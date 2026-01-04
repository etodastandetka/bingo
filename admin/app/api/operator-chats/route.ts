import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { ensureUserExists } from '@/lib/sync-user'

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

    // Оптимизация: получаем все данные батчами
    const usersWithMessages = await (prisma.chatMessage.groupBy as any)({
      by: ['userId'],
      where: {
        botType: 'operator',
        direction: 'in',
      },
      _count: {
        id: true,
      },
    })

    if (usersWithMessages.length === 0) {
      return NextResponse.json(
        createApiResponse({
          chats: [],
          totalUnread: 0,
          totalChats: 0,
        })
      )
    }

    const userIds = usersWithMessages.map((u: any) => u.userId)

    // Получаем все данные параллельно
    const [chatStatuses, users, allLastMessages] = await Promise.all([
      // Статусы чатов
      prisma.botUserData.findMany({
        where: {
          userId: { in: userIds },
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
          userId: { in: userIds },
        },
        select: {
          userId: true,
          username: true,
          firstName: true,
          lastName: true,
        },
      }),
      // Последние сообщения для каждого пользователя - оптимизированный запрос
      (async () => {
        // Получаем все последние сообщения одним запросом
        const allLastMessages = await prisma.chatMessage.findMany({
          where: {
            userId: { in: userIds.map((id: any) => BigInt(id)) },
            botType: 'operator',
          },
          orderBy: {
            createdAt: 'desc',
          },
          select: {
            userId: true,
            messageText: true,
            direction: true,
            createdAt: true,
          },
        })

        // Группируем по userId и берем первое (самое новое) для каждого
        const lastMessageMap = new Map()
        allLastMessages.forEach((msg: any) => {
          const userIdStr = msg.userId.toString()
          if (!lastMessageMap.has(userIdStr)) {
            lastMessageMap.set(userIdStr, {
              messageText: msg.messageText,
              direction: msg.direction,
              createdAt: msg.createdAt,
            })
          }
        })

        return userIds.map((userId: any) => ({
          userId,
          lastMessage: lastMessageMap.get(userId.toString()) || null,
        }))
      })(),
    ])

    const statusMap = new Map(
      chatStatuses.map(s => [s.userId.toString(), s.dataValue === 'closed'])
    )
    const userMap = new Map(users.map(u => [u.userId.toString(), u]))
    const lastMessageMap = new Map(
      allLastMessages.map((m: any) => [m.userId.toString(), m.lastMessage])
    )

    // Оптимизация: получаем все последние сообщения оператора одним запросом
    const allOperatorMessages = await prisma.chatMessage.findMany({
      where: {
        userId: { in: userIds.map((id: any) => BigInt(id)) },
        botType: 'operator',
        direction: 'out',
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        userId: true,
        createdAt: true,
      },
    })
    
    // Группируем по userId и берем первое (самое новое) для каждого
    const lastOperatorMessagesMap = new Map()
    allOperatorMessages.forEach((msg: any) => {
      const userIdStr = msg.userId.toString()
      if (!lastOperatorMessagesMap.has(userIdStr)) {
        lastOperatorMessagesMap.set(userIdStr, msg)
      }
    })
    
    const lastOperatorMessagesData = userIds.map((userId: any) => {
      const lastOpMsg = lastOperatorMessagesMap.get(userId.toString())
      return { userId, lastOpMsg: lastOpMsg || null }
    })

    // Оптимизация: подсчитываем непрочитанные сообщения одним запросом
    const userIdsWithLastOpMsg = lastOperatorMessagesData
      .filter((item: { userId: any, lastOpMsg: { userId: any, createdAt: Date } | null }) => item.lastOpMsg)
      .map((item: { userId: any, lastOpMsg: { userId: any, createdAt: Date } | null }) => ({
        userId: BigInt(item.userId),
        lastOpMsgTime: item.lastOpMsg!.createdAt,
      }))
    
    const userIdsWithoutLastOpMsg = lastOperatorMessagesData
      .filter((item: { userId: any, lastOpMsg: { userId: any, createdAt: Date } | null }) => !item.lastOpMsg)
      .map((item: { userId: any, lastOpMsg: { userId: any, createdAt: Date } | null }) => BigInt(item.userId))

    // Получаем время последнего прочтения оператором для всех пользователей
    const lastReadTimes = await prisma.botUserData.findMany({
      where: {
        userId: { in: [...userIdsWithLastOpMsg.map((item: { userId: bigint }) => item.userId), ...userIdsWithoutLastOpMsg] },
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

    // Подсчет для пользователей с последним сообщением оператора
    const unreadCountsWithLastMsg = await Promise.all(
      userIdsWithLastOpMsg.map(async (item: { userId: bigint, lastOpMsgTime: Date }) => {
        const { userId, lastOpMsgTime } = item
        const userIdStr = userId.toString()
        const lastReadAt = lastReadTimeMap.get(userIdStr)
        
        // Используем время последнего прочтения, если оно позже последнего сообщения оператора
        const readSince = lastReadAt && lastReadAt > lastOpMsgTime ? lastReadAt : lastOpMsgTime
        
        const count = await prisma.chatMessage.count({
          where: {
            userId,
            botType: 'operator',
            direction: 'in',
            createdAt: {
              gt: readSince,
            },
          },
        })
        return { userId: userIdStr, count }
      })
    )

    // Подсчет для пользователей без последнего сообщения оператора
    const unreadCountsWithoutLastMsg = userIdsWithoutLastOpMsg.length > 0
      ? await Promise.all(
          userIdsWithoutLastOpMsg.map(async (userId: bigint) => {
            const userIdStr = userId.toString()
            const lastReadAt = lastReadTimeMap.get(userIdStr)
            
            const whereClause: any = {
              userId,
              botType: 'operator',
              direction: 'in',
            }
            
            // Если есть время последнего прочтения, считаем только сообщения после него
            if (lastReadAt) {
              whereClause.createdAt = { gt: lastReadAt }
            }
            
            const count = await prisma.chatMessage.count({
              where: whereClause,
            })
            
            return { userId: userIdStr, count }
          })
        )
      : []

    const unreadCounts = [...unreadCountsWithLastMsg, ...unreadCountsWithoutLastMsg]

    const unreadCountMap = new Map(
      unreadCounts.map(u => [u.userId.toString(), u.count])
    )

    // Формируем результат
    const chats = usersWithMessages
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

    return NextResponse.json(
      createApiResponse({
        chats: filteredChats,
        totalUnread: filteredChats.reduce((sum: number, chat: any) => sum + chat.unreadCount, 0),
        totalChats: filteredChats.length,
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

