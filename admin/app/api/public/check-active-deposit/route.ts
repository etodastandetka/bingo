import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createApiResponse } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId } = body

    if (!userId) {
      return NextResponse.json(
        createApiResponse(null, 'userId is required'),
        { status: 400 }
      )
    }

    let userIdBigInt: bigint
    try {
      userIdBigInt = BigInt(userId)
    } catch {
      return NextResponse.json(
        createApiResponse(null, 'Invalid userId'),
        { status: 400 }
      )
    }

    // Проверяем активные заявки на пополнение (оптимизированный запрос без сортировки)
    // Используем findFirst без orderBy для максимальной скорости
    const activeDepositRequest = await prisma.request.findFirst({
      where: {
        userId: userIdBigInt,
        requestType: 'deposit',
        status: {
          in: ['pending', 'pending_check']
        }
      },
      // Убираем orderBy для ускорения - нам нужна любая активная заявка
      select: {
        id: true,
        createdAt: true,
        status: true,
      },
      // Используем индекс для быстрого поиска
      take: 1, // Ограничиваем результат одной записью
    })

    if (activeDepositRequest) {
      const timeAgo = Math.floor((Date.now() - activeDepositRequest.createdAt.getTime()) / 1000 / 60) // минуты назад
      return NextResponse.json(
        createApiResponse({
          hasActive: true,
          requestId: activeDepositRequest.id,
          createdAt: activeDepositRequest.createdAt.toISOString(),
          timeAgoMinutes: timeAgo,
          status: activeDepositRequest.status,
        })
      )
    }

    return NextResponse.json(
      createApiResponse({
        hasActive: false,
      })
    )
  } catch (error: any) {
    console.error('Check active deposit API error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to check active deposit'),
      { status: 500 }
    )
  }
}

