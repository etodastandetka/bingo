import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Отправка рассылки всем пользователям
export async function POST(request: NextRequest) {
  try {
    requireAuth(request)

    const body = await request.json()
    const { message, botType = 'main' } = body

    if (!message || !message.trim()) {
      return NextResponse.json(
        createApiResponse(null, 'Сообщение не может быть пустым'),
        { status: 400 }
      )
    }

    // Получаем токен бота на основе botType
    const { getBotTokenByBotType } = await import('@/lib/send-notification')
    const botToken = getBotTokenByBotType(botType)

    if (!botToken) {
      return NextResponse.json(
        createApiResponse(null, `BOT_TOKEN for ${botType} not configured`),
        { status: 500 }
      )
    }

    // Получаем пользователей для выбранного бота
    let users: Array<{ userId: bigint }> = []

    if (botType === 'operator') {
      // Для оператор-бота используем всех пользователей или тех, кто общался с оператором
      const operatorUsers = await prisma.chatMessage.findMany({
        where: { botType: 'operator' },
        select: { userId: true },
        distinct: ['userId']
      })
      
      if (operatorUsers.length > 0) {
        users = operatorUsers.map(u => ({ userId: u.userId }))
      } else {
        // Если нет операторских сообщений, используем всех пользователей
        users = await prisma.botUser.findMany({
          select: { userId: true },
        })
      }
    } else {
      // Для других ботов находим пользователей по заявкам с соответствующим botType
      const requests = await prisma.request.findMany({
        where: {
          botType: botType === 'main' ? { in: ['main', null] } : botType
        },
        select: { userId: true },
        distinct: ['userId']
      })
      
      users = requests.map(r => ({ userId: r.userId }))
      
      // Если нет заявок для этого бота, используем всех пользователей (fallback)
      if (users.length === 0) {
        users = await prisma.botUser.findMany({
          select: { userId: true },
        })
      }
    }

    if (users.length === 0) {
      return NextResponse.json(
        createApiResponse(null, 'Нет пользователей для рассылки'),
        { status: 400 }
      )
    }

    let successCount = 0
    let errorCount = 0

    // Отправляем сообщение всем пользователям
    for (const user of users) {
      try {
        const sendMessageUrl = `https://api.telegram.org/bot${botToken}/sendMessage`
        const telegramResponse = await fetch(sendMessageUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: user.userId.toString(),
            text: message,
            parse_mode: 'HTML',
            protect_content: true
          })
        })

        const telegramData = await telegramResponse.json()

        if (telegramData.ok) {
          successCount++
        } else {
          errorCount++
        }
      } catch (error) {
        errorCount++
      }
    }

    // Сохраняем в историю рассылок
    const botName = botType === 'main' ? 'Основной бот' :
                    botType === '1xbet' ? '1xbet бот' :
                    botType === 'mostbet' ? 'Mostbet бот' :
                    'Оператор-бот'
    const broadcastTitle = `Рассылка в ${botName} - ${successCount} пользователям - ${new Date().toLocaleString('ru-RU')}`
    await prisma.broadcastMessage.create({
      data: {
        title: broadcastTitle,
        message: message,
        isSent: true,
        sentAt: new Date(),
      },
    })

    return NextResponse.json(
      createApiResponse({
        success: true,
        message: `Рассылка завершена. Успешно: ${successCount}, Ошибок: ${errorCount}`,
        sentCount: successCount,
        errorCount: errorCount,
        totalUsers: users.length,
      })
    )
  } catch (error: any) {
    console.error('Broadcast API error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to send broadcast'),
      { status: 500 }
    )
  }
}

