import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { ensureUserExists } from '@/lib/sync-user'

// Получение истории чата с оператором
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    requireAuth(request)

    let userId: bigint
    try {
      userId = BigInt(params.userId)
    } catch (e) {
      return NextResponse.json(
        createApiResponse(null, 'Invalid user ID'),
        { status: 400 }
      )
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')

    const [messages, chatStatus] = await Promise.all([
      prisma.chatMessage.findMany({
        where: { 
          userId,
          botType: 'operator'
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.botUserData.findUnique({
        where: {
          userId_dataType: {
            userId,
            dataType: 'operator_chat_status',
          },
        },
        select: {
          dataValue: true,
        },
      }),
    ])

    const isClosed = chatStatus?.dataValue === 'closed'

    // ВАЖНО: Отмечаем все сообщения как прочитанные при открытии чата оператором
    // Сохраняем время последнего прочтения в BotUserData
    try {
      await prisma.botUserData.upsert({
        where: {
          userId_dataType: {
            userId,
            dataType: 'operator_last_read_at',
          },
        },
        update: {
          dataValue: new Date().toISOString(),
        },
        create: {
          userId,
          dataType: 'operator_last_read_at',
          dataValue: new Date().toISOString(),
        },
      })
      console.log(`✅ Marked messages as read for user ${userId.toString()}`)
    } catch (error) {
      console.error('Error marking messages as read:', error)
      // Не прерываем выполнение, если не удалось отметить как прочитанное
    }

    return NextResponse.json(
      createApiResponse({
        messages: messages.map(msg => ({
          ...msg,
          userId: msg.userId.toString(),
          telegramMessageId: msg.telegramMessageId?.toString(),
          createdAt: msg.createdAt.toISOString(), // Явно преобразуем Date в ISO строку
        })),
        isClosed,
      })
    )
  } catch (error: any) {
    console.error('Operator chat history API error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to fetch chat history'),
      { status: 500 }
    )
  }
}

// Отправка сообщения пользователю через бота оператора
export async function POST(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    requireAuth(request)

    let userId: bigint
    try {
      userId = BigInt(params.userId)
    } catch (e) {
      return NextResponse.json(
        createApiResponse(null, 'Invalid user ID'),
        { status: 400 }
      )
    }

    const botToken = process.env.OPERATOR_BOT_TOKEN

    if (!botToken) {
      return NextResponse.json(
        createApiResponse(null, 'OPERATOR_BOT_TOKEN not configured'),
        { status: 500 }
      )
    }

    // Проверяем, есть ли файл в запросе (FormData)
    const contentType = request.headers.get('content-type') || ''
    let message: string | null = null
    let file: File | null = null
    let fileType: string | null = null
    let mediaUrl: string | null = null
    let messageType = 'text'

    if (contentType.includes('multipart/form-data')) {
      // Обрабатываем FormData
      const formData = await request.formData()
      message = formData.get('message') as string | null
      file = formData.get('file') as File | null
      fileType = formData.get('fileType') as string | null

      if (!message?.trim() && !file) {
        return NextResponse.json(
          createApiResponse(null, 'Message or file is required'),
          { status: 400 }
        )
      }
    } else {
      // Обрабатываем JSON (обратная совместимость)
      const body = await request.json()
      message = body.message

      if (!message || !message.trim()) {
        return NextResponse.json(
          createApiResponse(null, 'Message is required'),
          { status: 400 }
        )
      }
    }

    let telegramData: any
    let telegramMessageId: bigint

    if (file) {
      // Отправляем медиа (фото или видео)
      const isVideo = fileType?.startsWith('video/')
      const isPhoto = fileType?.startsWith('image/')

      if (!isPhoto && !isVideo) {
        return NextResponse.json(
          createApiResponse(null, 'File must be an image or video'),
          { status: 400 }
        )
      }

      // Конвертируем файл в Blob для отправки
      const arrayBuffer = await file.arrayBuffer()
      const blob = new Blob([arrayBuffer], { type: fileType || (isPhoto ? 'image/jpeg' : 'video/mp4') })

      // Создаем FormData для Telegram API
      const telegramFormData = new FormData()
      telegramFormData.append('chat_id', userId.toString())
      if (message?.trim()) {
        telegramFormData.append('caption', message)
      }
      telegramFormData.append(isPhoto ? 'photo' : 'video', blob, file.name)
      telegramFormData.append('protect_content', 'true')

      const apiEndpoint = isPhoto 
        ? `https://api.telegram.org/bot${botToken}/sendPhoto`
        : `https://api.telegram.org/bot${botToken}/sendVideo`

      const telegramResponse = await fetch(apiEndpoint, {
        method: 'POST',
        body: telegramFormData,
      })

      telegramData = await telegramResponse.json()

      if (!telegramData.ok) {
        return NextResponse.json(
          createApiResponse(null, telegramData.description || 'Failed to send media'),
          { status: 500 }
        )
      }

      messageType = isPhoto ? 'photo' : 'video'
      telegramMessageId = BigInt(telegramData.result.message_id)
      
      // Получаем URL медиа из ответа Telegram
      const media = telegramData.result.photo?.[telegramData.result.photo.length - 1] || telegramData.result.video
      if (media?.file_id) {
        // Получаем путь к файлу
        const getFileUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${media.file_id}`
        const fileResponse = await fetch(getFileUrl)
        const fileData = await fileResponse.json()
        
        if (fileData.ok && fileData.result?.file_path) {
          mediaUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`
        }
      }
    } else {
      // Отправляем текстовое сообщение
      const sendMessageUrl = `https://api.telegram.org/bot${botToken}/sendMessage`
      const telegramResponse = await fetch(sendMessageUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: userId.toString(),
          text: message,
          parse_mode: 'HTML',
          protect_content: true
        })
      })

      telegramData = await telegramResponse.json()

      if (!telegramData.ok) {
        return NextResponse.json(
          createApiResponse(null, telegramData.description || 'Failed to send message'),
          { status: 500 }
        )
      }

      telegramMessageId = BigInt(telegramData.result.message_id)
    }

    // Получаем актуальные данные пользователя из Telegram перед сохранением сообщения
    // Это нужно для синхронизации данных, как это делает основной бот
    let userData: { username?: string | null; firstName?: string | null; lastName?: string | null } | undefined
    
    try {
      // Пытаемся получить данные пользователя из Telegram API
      const botToken = process.env.OPERATOR_BOT_TOKEN
      if (botToken) {
        const getChatUrl = `https://api.telegram.org/bot${botToken}/getChat`
        const telegramResponse = await fetch(getChatUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: userId.toString() }),
        })
        
        if (telegramResponse.ok) {
          const chatData = await telegramResponse.json()
          if (chatData.ok && chatData.result) {
            userData = {
              username: chatData.result.username || null,
              firstName: chatData.result.first_name || null,
              lastName: chatData.result.last_name || null,
            }
          }
        }
      }
    } catch (error) {
      console.warn('Failed to get user data from Telegram, using existing data:', error)
    }
    
    // Синхронизируем пользователя с актуальными данными
    await ensureUserExists(userId, userData)

    // Сохраняем сообщение в БД
    const savedMessage = await prisma.chatMessage.create({
      data: {
        userId,
        messageText: message,
        messageType,
        direction: 'out', // Сообщение от оператора к пользователю
        botType: 'operator',
        telegramMessageId,
        mediaUrl,
      },
    })

    console.log('💾 Message saved to DB:', {
      id: savedMessage.id,
      userId: savedMessage.userId.toString(),
      direction: savedMessage.direction,
      botType: savedMessage.botType,
      messageText: savedMessage.messageText?.substring(0, 50),
      createdAt: savedMessage.createdAt,
    })

    return NextResponse.json(
      createApiResponse({
        success: true,
        messageId: Number(telegramMessageId),
        mediaUrl,
        savedMessageId: savedMessage.id,
      })
    )
  } catch (error: any) {
    console.error('Send operator message API error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to send message'),
      { status: 500 }
    )
  }
}

