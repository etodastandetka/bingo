import { NextRequest, NextResponse } from 'next/server'
import { createApiResponse } from '@/lib/api-helpers'
import { addCorsHeaders } from '@/lib/cors-headers'
import { prisma } from '@/lib/prisma'

// Обработка OPTIONS запроса для CORS
export async function OPTIONS(request: NextRequest) {
  const response = new NextResponse(null, { status: 200 })
  return addCorsHeaders(response)
}

// Сохранение сообщения в БД (используется ботом)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('📨 Received chat message request:', JSON.stringify(body, null, 2))
    
    const {
      userId,
      messageText,
      messageType = 'text',
      mediaUrl,
      direction = 'in',
      botType = 'main',
      telegramMessageId,
    } = body

    if (!userId) {
      console.error('❌ User ID is required')
      const errorResponse = NextResponse.json(
        createApiResponse(null, 'User ID is required'),
        { status: 400 }
      )
      return addCorsHeaders(errorResponse)
    }

    let userIdBigInt: bigint
    try {
      userIdBigInt = BigInt(userId)
    } catch (e) {
      const errorResponse = NextResponse.json(
        createApiResponse(null, 'Invalid user ID'),
        { status: 400 }
      )
      return addCorsHeaders(errorResponse)
    }

    // Если сообщение от пользователя (direction='in'), создаем или обновляем пользователя
    if (direction === 'in') {
      const { username, firstName, lastName } = body
      console.log(`📝 Updating user data: userId=${userIdBigInt.toString()}, firstName="${firstName || 'null'}", lastName="${lastName || 'null'}", username="${username || 'null'}"`)
      
      try {
        const { ensureUserExists } = await import('@/lib/sync-user')
        const updatedUser = await ensureUserExists(userIdBigInt, {
          username: username || null,
          firstName: firstName || null,
          lastName: lastName || null,
        })
        if (updatedUser) {
          console.log(`✅ User updated in DB: userId=${updatedUser.userId.toString()}, firstName="${updatedUser.firstName || 'null'}", lastName="${updatedUser.lastName || 'null'}", username="${updatedUser.username || 'null'}"`)
        }
      } catch (error) {
        console.error('❌ Error creating/updating user:', error)
        // Продолжаем выполнение даже если не удалось создать пользователя
      }
    }

    const message = await prisma.chatMessage.create({
      data: {
        userId: userIdBigInt,
        messageText: messageText || null,
        messageType,
        mediaUrl: mediaUrl || null,
        direction,
        botType,
        telegramMessageId: telegramMessageId ? BigInt(telegramMessageId) : null,
      },
    })

    console.log(`✅ Message saved: id=${message.id}, userId=${message.userId.toString()}, botType=${message.botType}, direction=${message.direction}`)

    const response = NextResponse.json(
      createApiResponse({
        id: message.id,
        userId: message.userId.toString(),
        messageText: message.messageText,
        messageType: message.messageType,
        mediaUrl: message.mediaUrl,
        direction: message.direction,
        botType: message.botType,
        telegramMessageId: message.telegramMessageId?.toString(),
        createdAt: message.createdAt,
      })
    )
    
    return addCorsHeaders(response)
  } catch (error: any) {
    console.error('Chat message API error:', error)
    const errorResponse = NextResponse.json(
      createApiResponse(null, error.message || 'Failed to save message'),
      { status: 500 }
    )
    return addCorsHeaders(errorResponse)
  }
}

