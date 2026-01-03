import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'

// Редактирование сообщения
export async function PATCH(
  request: NextRequest,
  { params }: { params: { messageId: string } }
) {
  try {
    requireAuth(request)

    const messageId = parseInt(params.messageId)
    if (isNaN(messageId)) {
      return NextResponse.json(
        createApiResponse(null, 'Invalid message ID'),
        { status: 400 }
      )
    }

    const body = await request.json()
    const { text } = body

    if (!text || !text.trim()) {
      return NextResponse.json(
        createApiResponse(null, 'Message text is required'),
        { status: 400 }
      )
    }

    // Получаем сообщение из БД
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
    })

    if (!message) {
      return NextResponse.json(
        createApiResponse(null, 'Message not found'),
        { status: 404 }
      )
    }

    // Проверяем, что это сообщение от оператора (можно редактировать только исходящие)
    if (message.direction !== 'out') {
      return NextResponse.json(
        createApiResponse(null, 'Can only edit outgoing messages'),
        { status: 403 }
      )
    }

    // Если есть telegramMessageId, редактируем в Telegram
    if (message.telegramMessageId) {
      const botToken = message.botType === 'operator' 
        ? process.env.OPERATOR_BOT_TOKEN
        : process.env.TELEGRAM_BOT_TOKEN

      if (!botToken) {
        return NextResponse.json(
          createApiResponse(null, 'Bot token not configured'),
          { status: 500 }
        )
      }

      const editMessageUrl = `https://api.telegram.org/bot${botToken}/editMessageText`
      const telegramResponse = await fetch(editMessageUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: message.userId.toString(),
          message_id: Number(message.telegramMessageId),
          text: text,
          parse_mode: 'HTML',
        }),
      })

      const telegramData = await telegramResponse.json()

      if (!telegramData.ok) {
        return NextResponse.json(
          createApiResponse(null, telegramData.description || 'Failed to edit message in Telegram'),
          { status: 500 }
        )
      }
    }

    // Обновляем сообщение в БД
    const updatedMessage = await prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        messageText: text,
      },
    })

    return NextResponse.json(
      createApiResponse({
        success: true,
        message: {
          ...updatedMessage,
          userId: updatedMessage.userId.toString(),
          telegramMessageId: updatedMessage.telegramMessageId?.toString(),
        },
      })
    )
  } catch (error: any) {
    console.error('Edit message API error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to edit message'),
      { status: 500 }
    )
  }
}

// Удаление сообщения
export async function DELETE(
  request: NextRequest,
  { params }: { params: { messageId: string } }
) {
  try {
    requireAuth(request)

    const messageId = parseInt(params.messageId)
    if (isNaN(messageId)) {
      return NextResponse.json(
        createApiResponse(null, 'Invalid message ID'),
        { status: 400 }
      )
    }

    // Получаем сообщение из БД
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
    })

    if (!message) {
      return NextResponse.json(
        createApiResponse(null, 'Message not found'),
        { status: 404 }
      )
    }

    // Проверяем, что это сообщение от оператора (можно удалять только исходящие)
    if (message.direction !== 'out') {
      return NextResponse.json(
        createApiResponse(null, 'Can only delete outgoing messages'),
        { status: 403 }
      )
    }

    // Если есть telegramMessageId, удаляем в Telegram
    if (message.telegramMessageId) {
      const botToken = message.botType === 'operator' 
        ? process.env.OPERATOR_BOT_TOKEN
        : process.env.TELEGRAM_BOT_TOKEN

      if (!botToken) {
        return NextResponse.json(
          createApiResponse(null, 'Bot token not configured'),
          { status: 500 }
        )
      }

      const deleteMessageUrl = `https://api.telegram.org/bot${botToken}/deleteMessage`
      const telegramResponse = await fetch(deleteMessageUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: message.userId.toString(),
          message_id: Number(message.telegramMessageId),
        }),
      })

      const telegramData = await telegramResponse.json()

      // Если сообщение уже удалено в Telegram, это не критично
      if (!telegramData.ok && telegramData.error_code !== 400) {
        console.warn('Failed to delete message in Telegram:', telegramData.description)
      }
    }

    // Удаляем сообщение из БД
    await prisma.chatMessage.delete({
      where: { id: messageId },
    })

    return NextResponse.json(
      createApiResponse({
        success: true,
      })
    )
  } catch (error: any) {
    console.error('Delete message API error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to delete message'),
      { status: 500 }
    )
  }
}










