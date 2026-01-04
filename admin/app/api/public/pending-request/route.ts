import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createApiResponse } from '@/lib/api-helpers'

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const telegramUserId = searchParams.get('telegram_user_id')
    const type = searchParams.get('type') || 'deposit'

    if (!telegramUserId) {
      return NextResponse.json(
        createApiResponse(null, 'telegram_user_id is required'),
        { status: 400 }
      )
    }

    const userIdBigInt = BigInt(telegramUserId)

    // Ищем pending заявку для этого пользователя за последние 5 минут
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)

    const pendingRequest = await prisma.request.findFirst({
      where: {
        userId: userIdBigInt,
        requestType: type,
        status: 'pending',
        createdAt: { gte: fiveMinutesAgo },
      },
      select: {
        id: true,
        status: true,
        amount: true,
        bookmaker: true,
        accountId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' }, // Берем самую свежую
    })

    if (pendingRequest) {
      return NextResponse.json(
        createApiResponse({
          id: pendingRequest.id,
          status: pendingRequest.status,
          amount: pendingRequest.amount?.toString(),
          bookmaker: pendingRequest.bookmaker,
          accountId: pendingRequest.accountId,
          createdAt: pendingRequest.createdAt.toISOString(),
        }),
        {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    return NextResponse.json(
      createApiResponse(null, 'No pending request found'),
      {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  } catch (error: any) {
    console.error('Error getting pending request:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Internal server error'),
      {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  }
}

