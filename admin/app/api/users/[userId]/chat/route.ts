import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'

// Получение истории чата с пользователем
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

    const messages = await prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return NextResponse.json(
      createApiResponse({
        messages: messages.map(msg => ({
          ...msg,
          userId: msg.userId.toString(),
          telegramMessageId: msg.telegramMessageId?.toString(),
        })),
      })
    )
  } catch (error: any) {
    console.error('Chat history API error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to fetch chat history'),
      { status: 500 }
    )
  }
}

