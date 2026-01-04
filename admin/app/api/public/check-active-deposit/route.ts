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

    // ВАЖНО: Сначала автоматически отклоняем истекшие заявки (старше 5 минут без фото)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    const expiredRequests = await prisma.request.findMany({
      where: {
        userId: userIdBigInt,
        requestType: 'deposit',
        status: {
          in: ['pending', 'pending_check']
        },
        createdAt: {
          lt: fiveMinutesAgo // Старше 5 минут
        },
        photoFileUrl: null, // Без фото чека
      },
      select: {
        id: true,
      },
    })

    // Автоматически отклоняем истекшие заявки
    if (expiredRequests.length > 0) {
      await prisma.request.updateMany({
        where: {
          id: {
            in: expiredRequests.map(r => r.id)
          }
        },
        data: {
          status: 'rejected',
          statusDetail: 'Таймер истек',
          processedAt: new Date(),
          updatedAt: new Date(),
        } as any,
      })
      console.log(`⏰ Auto-rejected ${expiredRequests.length} expired deposit request(s) for user ${userIdBigInt}`)
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

