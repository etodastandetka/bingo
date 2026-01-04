import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createApiResponse } from '@/lib/api-helpers'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, accountId } = body

    if (!userId) {
      return NextResponse.json(
        createApiResponse(null, 'Missing userId'),
        { status: 400 }
      )
    }

    const userIdBigInt = BigInt(userId)

    // Проверка блокировки пользователя по userId (Telegram ID)
    const user = await prisma.botUser.findUnique({
      where: { userId: userIdBigInt },
      select: { isActive: true },
    })

    // Если пользователь существует и заблокирован
    if (user && user.isActive === false) {
      return NextResponse.json(
        createApiResponse({
          blocked: true,
          reason: 'user',
          message: 'Вы заблокированы',
        })
      )
    }

    // Проверка блокировки по accountId (ID казино) - ОПТИМИЗИРОВАННАЯ ВЕРСИЯ
    if (accountId) {
      // ОПТИМИЗАЦИЯ: Используем один запрос с JOIN вместо множественных запросов
      // Находим всех заблокированных пользователей, которые использовали этот accountId
      const blockedUsersWithAccountId = await prisma.request.findMany({
        where: {
          accountId: accountId.toString(),
          user: {
            isActive: false, // Только заблокированные пользователи
          },
        },
        select: {
          userId: true,
        },
        distinct: ['userId'],
        take: 1, // Нам нужен только один результат для проверки
      })

      // Если найден хотя бы один заблокированный пользователь с этим accountId
      if (blockedUsersWithAccountId.length > 0) {
        // АВТОМАТИЧЕСКАЯ БЛОКИРОВКА: блокируем текущего пользователя, который пытается использовать заблокированный accountId
        try {
          await prisma.botUser.upsert({
            where: { userId: userIdBigInt },
            update: {
              isActive: false,
            },
            create: {
              userId: userIdBigInt,
              username: null,
              firstName: null,
              lastName: null,
              language: 'ru',
              isActive: false,
            },
          })
          console.log(`🔒 Auto-blocked user ${userId.toString()} for using blocked accountId ${accountId}`)
        } catch (error) {
          console.error('Error auto-blocking user:', error)
        }

        return NextResponse.json(
          createApiResponse({
            blocked: true,
            reason: 'accountId',
            message: 'Аккаунт заблокирован',
          })
        )
      }
    }

    // Пользователь не заблокирован
    return NextResponse.json(
      createApiResponse({
        blocked: false,
      })
    )
  } catch (error: any) {
    console.error('Error checking blocked status:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to check blocked status'),
      { status: 500 }
    )
  }
}

