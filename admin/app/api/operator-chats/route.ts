import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { ensureUserExists } from '@/lib/sync-user'

// Получение списка пользователей с сообщениями от оператора
export async function GET(request: NextRequest) {
  try {
    requireAuth(request)

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
      // Последние сообщения для каждого пользователя
      Promise.all(
        userIds.map(async (userId: any) => {
          const lastMessage = await prisma.chatMessage.findFirst({
            where: {
              userId,
              botType: 'operator',
            },
            orderBy: {
              createdAt: 'desc',
            },
            select: {
              messageText: true,
              direction: true,
              createdAt: true,
            },
          })
          return { userId, lastMessage }
        })
      ),
    ])

    const statusMap = new Map(
      chatStatuses.map(s => [s.userId.toString(), s.dataValue === 'closed'])
    )
    const userMap = new Map(users.map(u => [u.userId.toString(), u]))
    const lastMessageMap = new Map(
      allLastMessages.map((m: any) => [m.userId.toString(), m.lastMessage])
    )

    // Оптимизация: получаем все последние сообщения оператора одним запросом
    const lastOperatorMessagesData = await Promise.all(
      userIds.map(async (userId: any) => {
        const lastOpMsg = await prisma.chatMessage.findFirst({
          where: {
            userId,
            botType: 'operator',
            direction: 'out',
          },
          orderBy: {
            createdAt: 'desc',
          },
          select: {
            createdAt: true,
          },
        })
        return { userId, lastOpMsg }
      })
    )

    // Подсчитываем непрочитанные сообщения параллельно
    const unreadCounts = await Promise.all(
      lastOperatorMessagesData.map(async ({ userId, lastOpMsg }) => {
        if (!lastOpMsg) {
          const count = await prisma.chatMessage.count({
            where: {
              userId,
              botType: 'operator',
              direction: 'in',
            },
          })
          return { userId, count }
        }

        const count = await prisma.chatMessage.count({
          where: {
            userId,
            botType: 'operator',
            direction: 'in',
            createdAt: {
              gt: lastOpMsg.createdAt,
            },
          },
        })
        return { userId, count }
      })
    )

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
        const lastMessage = lastMessageMap.get(userIdStr)
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
    requireAuth(request)

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

