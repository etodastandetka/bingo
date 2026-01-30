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
    // Получаем только пользователей с недавними сообщениями (за последние 7 дней для скорости)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    
    const usersWithMessages = await (prisma.chatMessage.groupBy as any)({
      by: ['userId'],
      where: {
        botType: 'operator',
        direction: 'in',
        createdAt: {
          gte: sevenDaysAgo, // Только недавние сообщения (7 дней)
        },
      },
      _count: {
        id: true,
      },
    })
    
    // Ограничиваем количество пользователей после получения (groupBy не поддерживает take)
    // Уменьшаем до 200 для более быстрой обработки
    const limitedUsers = usersWithMessages.slice(0, 200)

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
    const [chatStatuses, users, allMessages] = await Promise.all([
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
      // ОПТИМИЗАЦИЯ: Получаем ВСЕ сообщения для всех пользователей одним запросом
      // Это намного быстрее чем отдельные запросы для каждого пользователя
      prisma.chatMessage.findMany({
        where: {
          userId: { in: userIdsBigInt },
          botType: 'operator',
          createdAt: {
            gte: sevenDaysAgo, // Только сообщения за последние 7 дней
          },
        },
        select: {
          userId: true,
          messageText: true,
          direction: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        // Ограничиваем количество сообщений для производительности
        // Уменьшаем до 5000 для более быстрой обработки
        take: 5000,
      }),
    ])

    const statusMap = new Map(
      chatStatuses.map(s => [s.userId.toString(), s.dataValue === 'closed'])
    )
    const userMap = new Map(users.map(u => [u.userId.toString(), u]))
    
    // ОПТИМИЗАЦИЯ: Обрабатываем сообщения в памяти для получения последних сообщений
    // Группируем по userId и находим последнее сообщение для каждого пользователя
    // Используем более эффективный подход - проходим один раз и сохраняем только последние сообщения
    const lastMessageMap = new Map<string, { messageText: string; direction: string; createdAt: Date }>()
    const lastOperatorMessagesMap = new Map<string, { createdAt: Date }>()
    const messagesByUser = new Map<string, Array<{ messageText: string; direction: string; createdAt: Date }>>()
    
    // Проходим по сообщениям один раз и сохраняем только последнее сообщение для каждого пользователя
    for (const msg of allMessages) {
      const userIdStr = msg.userId.toString()
      
      // Сохраняем последнее сообщение (любое)
      if (!lastMessageMap.has(userIdStr)) {
        lastMessageMap.set(userIdStr, {
          messageText: msg.messageText || '',
          direction: msg.direction,
          createdAt: msg.createdAt,
        })
      }
      
      // Сохраняем последнее сообщение оператора
      if (msg.direction === 'out' && !lastOperatorMessagesMap.has(userIdStr)) {
        lastOperatorMessagesMap.set(userIdStr, { createdAt: msg.createdAt })
      }
      
      // Сохраняем сообщения для подсчета непрочитанных (только входящие)
      if (msg.direction === 'in') {
        if (!messagesByUser.has(userIdStr)) {
          messagesByUser.set(userIdStr, [])
        }
        messagesByUser.get(userIdStr)!.push({
          messageText: msg.messageText || '',
          direction: msg.direction,
          createdAt: msg.createdAt,
        })
      }
    }

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

    // ОПТИМИЗАЦИЯ: Подсчитываем непрочитанные сообщения в памяти из уже загруженных данных
    // Это намного быстрее чем отдельные count запросы для каждого пользователя
    const unreadCountMap = new Map<string, number>()
    
    for (const userIdStr of userIdsStr) {
      const lastReadAt = lastReadTimeMap.get(userIdStr)
      const lastOpMsg = lastOperatorMessagesMap.get(userIdStr)
      const userMessages = messagesByUser.get(userIdStr) || []
      
      // Определяем время, с которого считать непрочитанные
      let readSince: Date | null = null
      if (lastReadAt && lastOpMsg) {
        readSince = lastReadAt > lastOpMsg.createdAt ? lastReadAt : lastOpMsg.createdAt
      } else if (lastReadAt) {
        readSince = lastReadAt
      } else if (lastOpMsg) {
        readSince = lastOpMsg.createdAt
      }
      
      // Считаем непрочитанные входящие сообщения
      const unreadCount = userMessages.filter(msg => {
        if (msg.direction !== 'in') return false
        if (!readSince) return true // Если нет времени прочтения, все сообщения непрочитанные
        return msg.createdAt > readSince
      }).length
      
      unreadCountMap.set(userIdStr, unreadCount)
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

    // ОПТИМИЗАЦИЯ: Ограничиваем количество возвращаемых чатов (максимум 100 для скорости)
    const limitedChats = filteredChats.slice(0, 100)

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

