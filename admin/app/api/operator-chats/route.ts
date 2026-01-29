import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { ensureUserExists } from '@/lib/sync-user'
import { Prisma } from '@prisma/client'

// Получение списка пользователей с сообщениями от оператора
export async function GET(request: NextRequest) {
  try {
    try {
      requireAuth(request)
    } catch (authError: any) {
      if (authError.message === 'Unauthorized') {
        return NextResponse.json(
          createApiResponse(null, 'Unauthorized'),
          { status: 401 }
        )
      }
      throw authError
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'open' // 'open' или 'closed'
    const search = searchParams.get('search') || ''

    // ОПТИМИЗАЦИЯ: Ограничиваем количество пользователей для производительности
    // Получаем только пользователей с недавними сообщениями (за последние 30 дней)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    
    const usersWithMessages = await (prisma.chatMessage.groupBy as any)({
      by: ['userId'],
      where: {
        botType: 'operator',
        direction: 'in',
        createdAt: {
          gte: thirtyDaysAgo, // Только недавние сообщения
        },
      },
      _count: {
        id: true,
      },
    })
    
    // Ограничиваем количество пользователей после получения (groupBy не поддерживает take)
    const limitedUsers = usersWithMessages.slice(0, 500)

    if (limitedUsers.length === 0) {
      return NextResponse.json(
        createApiResponse({
          chats: [],
          totalUnread: 0,
          totalChats: 0,
        })
      )
    }

    const userIds = limitedUsers.map((u: any) => u.userId)

    // ОПТИМИЗАЦИЯ: Используем один SQL-запрос с оконными функциями для получения последних сообщений
    // Это намного быстрее чем отдельные запросы для каждого пользователя
    const userIdsBigInt = userIds.map((id: any) => BigInt(id))
    const userIdsStr = userIds.map((id: any) => id.toString())
    
    // Получаем все данные параллельно
    const [chatStatuses, users, allLastMessages, lastOperatorMessages] = await Promise.all([
      // Статусы чатов
      prisma.botUserData.findMany({
        where: {
          userId: { in: userIdsBigInt },
          dataType: 'operator_chat_status',
        },
        select: {
          userId: true,
          dataValue: true,
        },
      }),
      // Пользователи
      prisma.botUser.findMany({
        where: {
          userId: { in: userIdsBigInt },
        },
        select: {
          userId: true,
          username: true,
          firstName: true,
          lastName: true,
        },
      }),
      // ОПТИМИЗАЦИЯ: Используем более эффективный подход - получаем только последние сообщения
      // Вместо загрузки всех сообщений используем подзапросы для каждого пользователя параллельно
      (async () => {
        if (userIdsBigInt.length === 0) return []
        
        // ОПТИМИЗАЦИЯ: Используем батчинг - обрабатываем по 50 пользователей за раз
        const batchSize = 50
        const results: Array<{ userId: string; lastMessage: any }> = []
        
        for (let i = 0; i < userIdsBigInt.length; i += batchSize) {
          const batch = userIdsBigInt.slice(i, i + batchSize)
          
          // Для каждого батча получаем последние сообщения параллельно
          const batchResults = await Promise.all(
            batch.map(async (userIdBigInt: bigint) => {
              const lastMessage = await prisma.chatMessage.findFirst({
                where: {
                  userId: userIdBigInt,
                  botType: 'operator',
                },
                select: {
                  messageText: true,
                  direction: true,
                  createdAt: true,
                },
                orderBy: {
                  createdAt: 'desc',
                },
              })
              
              return {
                userId: userIdBigInt.toString(),
                lastMessage: lastMessage ? {
                  messageText: lastMessage.messageText,
                  direction: lastMessage.direction,
                  createdAt: lastMessage.createdAt,
                } : null,
              }
            })
          )
          
          results.push(...batchResults)
        }
        
        return results
      })(),
      // ОПТИМИЗАЦИЯ: Получаем последние сообщения оператора батчами
      (async () => {
        if (userIdsBigInt.length === 0) return []
        
        // ОПТИМИЗАЦИЯ: Используем батчинг - обрабатываем по 50 пользователей за раз
        const batchSize = 50
        const results: Array<{ userId: string; lastOpMsg: any }> = []
        
        for (let i = 0; i < userIdsBigInt.length; i += batchSize) {
          const batch = userIdsBigInt.slice(i, i + batchSize)
          
          // Для каждого батча получаем последние сообщения оператора параллельно
          const batchResults = await Promise.all(
            batch.map(async (userIdBigInt: bigint) => {
              const lastOpMsg = await prisma.chatMessage.findFirst({
                where: {
                  userId: userIdBigInt,
                  botType: 'operator',
                  direction: 'out',
                },
                select: {
                  userId: true,
                  createdAt: true,
                },
                orderBy: {
                  createdAt: 'desc',
                },
              })
              
              return {
                userId: userIdBigInt.toString(),
                lastOpMsg: lastOpMsg || null,
              }
            })
          )
          
          results.push(...batchResults)
        }
        
        return results
      })(),
    ])

    const statusMap = new Map(
      chatStatuses.map(s => [s.userId.toString(), s.dataValue === 'closed'])
    )
    const userMap = new Map(users.map(u => [u.userId.toString(), u]))
    
    // Преобразуем результаты в Map
    const lastMessageMap = new Map(
      allLastMessages.map((m: any) => [
        m.userId,
        m.lastMessage
      ])
    )
    
    const lastOperatorMessagesMap = new Map(
      lastOperatorMessages.map((m: any) => [
        m.userId,
        m.lastOpMsg
      ])
    )

    // ОПТИМИЗАЦИЯ: Получаем время последнего прочтения для всех пользователей одним запросом
    const lastReadTimes = await prisma.botUserData.findMany({
      where: {
        userId: { in: userIdsBigInt },
        dataType: 'operator_last_read_at',
      },
      select: {
        userId: true,
        dataValue: true,
      },
    })
    
    const lastReadTimeMap = new Map(
      lastReadTimes.map(lr => [lr.userId.toString(), lr.dataValue ? new Date(lr.dataValue) : null])
    )

    // ОПТИМИЗАЦИЯ: Подсчитываем непрочитанные сообщения батчами с использованием count запросов
    // Это быстрее чем загрузка всех сообщений в память
    const unreadCountMap = new Map<string, number>()
    const batchSize = 50
    
    // Обрабатываем пользователей батчами
    for (let i = 0; i < userIdsStr.length; i += batchSize) {
      const batch = userIdsStr.slice(i, i + batchSize)
      
      // Для каждого пользователя в батче считаем непрочитанные параллельно
      const batchCounts = await Promise.all(
        batch.map(async (userIdStr: string) => {
          const userIdBigInt = BigInt(userIdStr)
          const lastReadAt = lastReadTimeMap.get(userIdStr)
          const lastOpMsg = lastOperatorMessagesMap.get(userIdStr)
          
          // Определяем время, с которого считать непрочитанные
          let readSince: Date | null = null
          if (lastReadAt && lastOpMsg && lastOpMsg !== null && typeof lastOpMsg === 'object' && 'createdAt' in lastOpMsg) {
            const opMsg = lastOpMsg as { createdAt: Date }
            readSince = lastReadAt > opMsg.createdAt ? lastReadAt : opMsg.createdAt
          } else if (lastReadAt) {
            readSince = lastReadAt
          } else if (lastOpMsg && lastOpMsg !== null && typeof lastOpMsg === 'object' && 'createdAt' in lastOpMsg) {
            readSince = (lastOpMsg as { createdAt: Date }).createdAt
          }
          
          // Используем count вместо загрузки всех сообщений
          const whereClause: any = {
            userId: userIdBigInt,
            botType: 'operator',
            direction: 'in',
          }
          
          if (readSince) {
            whereClause.createdAt = { gt: readSince }
          }
          
          const count = await prisma.chatMessage.count({
            where: whereClause,
          })
          
          return { userId: userIdStr, count }
        })
      )
      
      batchCounts.forEach(({ userId, count }) => {
        unreadCountMap.set(userId, count)
      })
    }

    // Формируем результат
    const chats = limitedUsers
      .map((userGroup: any) => {
        const userId = userGroup.userId
        const userIdStr = userId.toString()
        const isClosed = statusMap.get(userIdStr) || false

        // Фильтруем по статусу
        if (status === 'open' && isClosed) return null
        if (status === 'closed' && !isClosed) return null

        const user = userMap.get(userIdStr)
        const lastMessage = lastMessageMap.get(userIdStr) as { messageText: string, direction: string, createdAt: Date } | undefined
        const unreadCount = unreadCountMap.get(userIdStr) || 0

        // Если пользователь не найден, создаем его асинхронно
        if (!user) {
          ensureUserExists(userId).catch(console.error)
        }

        const finalUser = user || null

        // Формируем имя для отображения
        const displayName = `${finalUser?.firstName || ''} ${finalUser?.lastName || ''}`.trim() || 
                           finalUser?.username || 
                           `ID: ${userIdStr}`

        // Фильтруем по поисковому запросу
        if (search && search.trim()) {
          const searchLower = search.toLowerCase().trim()
          const firstName = (finalUser?.firstName || '').toLowerCase()
          const lastName = (finalUser?.lastName || '').toLowerCase()
          const username = (finalUser?.username || '').toLowerCase()
          const displayNameLower = displayName.toLowerCase()
          
          const matches = 
            firstName.includes(searchLower) ||
            lastName.includes(searchLower) ||
            username.includes(searchLower) ||
            userIdStr.includes(searchLower) ||
            displayNameLower.includes(searchLower)
          
          if (!matches) {
            return null
          }
        }

        return {
          userId: userIdStr,
          username: finalUser?.username || null,
          firstName: finalUser?.firstName || null,
          lastName: finalUser?.lastName || null,
          photoUrl: null, // Фото загружается на клиенте
          lastMessage: lastMessage?.messageText || null,
          lastMessageDirection: lastMessage?.direction || null,
          lastMessageTime: lastMessage?.createdAt 
            ? (typeof lastMessage.createdAt === 'string' 
                ? lastMessage.createdAt 
                : (lastMessage.createdAt as Date).toISOString())
            : null,
          unreadCount,
          totalMessages: typeof userGroup._count === 'object' && userGroup._count?.id ? userGroup._count.id : 0,
          isClosed,
        }
      })
      .filter((chat: any) => chat !== null)

    // Убираем null значения и сортируем по времени последнего сообщения
    const filteredChats = chats.filter((chat: any) => chat !== null) as any[]
    filteredChats.sort((a: any, b: any) => {
      if (!a.lastMessageTime && !b.lastMessageTime) return 0
      if (!a.lastMessageTime) return 1
      if (!b.lastMessageTime) return -1
      return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
    })

    // ОПТИМИЗАЦИЯ: Ограничиваем количество возвращаемых чатов (максимум 200)
    const limitedChats = filteredChats.slice(0, 200)

    return NextResponse.json(
      createApiResponse({
        chats: limitedChats,
        totalUnread: limitedChats.reduce((sum: number, chat: any) => sum + chat.unreadCount, 0),
        totalChats: filteredChats.length, // Общее количество (до лимита)
      })
    )
  } catch (error: any) {
    console.error('Operator chats API error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to fetch operator chats'),
      { status: 500 }
    )
  }
}

// Закрытие/открытие чата
export async function PATCH(request: NextRequest) {
  try {
    try {
      requireAuth(request)
    } catch (authError: any) {
      if (authError.message === 'Unauthorized') {
        return NextResponse.json(
          createApiResponse(null, 'Unauthorized'),
          { status: 401 }
        )
      }
      throw authError
    }

    const body = await request.json()
    const { userId, isClosed } = body

    if (!userId) {
      return NextResponse.json(
        createApiResponse(null, 'User ID is required'),
        { status: 400 }
      )
    }

    const userIdBigInt = BigInt(userId)

    // Обновляем или создаем статус чата
    await prisma.botUserData.upsert({
      where: {
        userId_dataType: {
          userId: userIdBigInt,
          dataType: 'operator_chat_status',
        },
      },
      update: {
        dataValue: isClosed ? 'closed' : 'open',
      },
      create: {
        userId: userIdBigInt,
        dataType: 'operator_chat_status',
        dataValue: isClosed ? 'closed' : 'open',
      },
    })

    return NextResponse.json(
      createApiResponse({ success: true })
    )
  } catch (error: any) {
    console.error('Update chat status API error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to update chat status'),
      { status: 500 }
    )
  }
}

