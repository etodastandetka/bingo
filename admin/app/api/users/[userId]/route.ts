import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'
import { syncUserFromRequest } from '@/lib/sync-user'

// Отключаем кеширование для актуальных данных
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    requireAuth(request)

    const userId = BigInt(params.userId)

    // Синхронизируем данные пользователя перед получением
    await syncUserFromRequest(userId)

    let user = await prisma.botUser.findUnique({
      where: { userId },
      include: {
        transactions: {
          take: 50,
          orderBy: { createdAt: 'desc' },
        },
        referralMade: {
          include: {
            referred: true,
          },
        },
        referralEarnings: {
          take: 20,
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            transactions: true,
            referralMade: true,
            referralEarnings: true,
          },
        },
      },
    })

    // Если пользователь найден, но транзакций мало или нет, дополняем из Request
    if (user && user.transactions.length === 0) {
      const allRequests = await prisma.request.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })

      if (allRequests.length > 0) {
        // Дополняем транзакции из Request
        const requestTransactions = allRequests.map(req => ({
          id: req.id,
          transType: req.requestType,
          amount: req.amount?.toString() || '0',
          status: req.status,
          status_detail: req.statusDetail || null,
          processedByUsername: req.processedByUsername || null,
          bookmaker: req.bookmaker,
          bank: req.bank,
          accountId: req.accountId,
          createdAt: req.createdAt.toISOString(),
        }))

        user = {
          ...user,
          transactions: requestTransactions as any,
          _count: {
            ...user._count,
            transactions: allRequests.length,
          },
        }
      }
    }

    // Если пользователь не найден в BotUser, пытаемся получить данные из Request
    if (!user) {
      const latestRequest = await prisma.request.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      })

      if (latestRequest) {
        // Создаем виртуальный объект пользователя на основе данных из Request
        const allRequests = await prisma.request.findMany({
          where: { userId },
        })

        const deposits = allRequests.filter(r => r.requestType === 'deposit')
        const withdrawals = allRequests.filter(r => r.requestType === 'withdraw')
        
        // Получаем транзакции из Request
        const transactions = allRequests.slice(0, 50).map(req => ({
          id: req.id,
          transType: req.requestType,
          amount: req.amount?.toString() || '0',
          status: req.status,
          status_detail: req.statusDetail || null,
          processedByUsername: req.processedByUsername || null,
          bookmaker: req.bookmaker,
          bank: req.bank,
          accountId: req.accountId,
          createdAt: req.createdAt.toISOString(),
        }))

        user = {
          userId,
          username: latestRequest.username,
          firstName: latestRequest.firstName,
          lastName: latestRequest.lastName,
          language: 'ru',
          selectedBookmaker: latestRequest.bookmaker,
          createdAt: latestRequest.createdAt,
          isActive: true, // По умолчанию активен, если пользователь не найден в BotUser
          transactions,
          referralMade: [],
          referralEarnings: [],
          _count: {
            transactions: allRequests.length,
            referralMade: 0,
            referralEarnings: 0,
          },
        } as any
      }
    }

    if (!user) {
      return NextResponse.json(
        createApiResponse(null, 'User not found'),
        { status: 404 }
      )
    }

    // Маппим транзакции с учетом того, что они могут быть из BotTransaction или Request
    const mappedTransactions = user.transactions.map(t => {
      // Если createdAt уже строка (из Request), используем как есть, иначе конвертируем
      const createdAt = typeof t.createdAt === 'string' 
        ? t.createdAt 
        : (t.createdAt as Date).toISOString()
      
      return {
        id: t.id,
        transType: (t as any).transType || 'deposit',
        amount: typeof t.amount === 'string' ? t.amount : t.amount.toString(),
        status: t.status,
        status_detail: (t as any).statusDetail || (t as any).status_detail || null,
        processedByUsername: (t as any).processedByUsername || null,
        bookmaker: (t as any).bookmaker || null,
        bank: (t as any).bank || null,
        accountId: (t as any).accountId || null,
        createdAt,
      }
    })

    return NextResponse.json(
      createApiResponse({
        ...user,
        userId: user.userId.toString(),
        isActive: (user as any).isActive !== undefined ? (user as any).isActive : true,
        transactions: mappedTransactions,
        referralEarnings: (user.referralEarnings || []).map(e => ({
          ...e,
          amount: e.amount.toString(),
          commissionAmount: e.commissionAmount.toString(),
        })),
        referralMade: user.referralMade || [],
      })
    )
  } catch (error: any) {
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to fetch user'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    requireAuth(request)

    const userId = BigInt(params.userId)
    const body = await request.json()
    const { isActive } = body

    if (typeof isActive !== 'boolean') {
      return NextResponse.json(
        createApiResponse(null, 'isActive must be a boolean'),
        { status: 400 }
      )
    }

    // Получаем данные из последней заявки для создания пользователя, если его нет
    const lastRequest = await prisma.request.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })

    // Используем upsert для создания или обновления пользователя
    const user = await prisma.botUser.upsert({
      where: { userId },
      update: {
        isActive,
      },
      create: {
        userId,
        username: lastRequest?.username || null,
        firstName: lastRequest?.firstName || null,
        lastName: lastRequest?.lastName || null,
        language: 'ru',
        isActive,
      },
    })

    // Если пользователь заблокирован, логируем все его accountId для отслеживания
    if (!isActive) {
      const userRequests = await prisma.request.findMany({
        where: { userId },
        select: {
          accountId: true,
        },
        distinct: ['accountId'],
      })

      const accountIds = userRequests
        .map(r => r.accountId)
        .filter((id): id is string => id !== null)

      if (accountIds.length > 0) {
        console.log(`🔒 User ${userId.toString()} blocked. Blocked accountIds:`, accountIds)
        console.log(`⚠️ All future requests with these accountIds will be rejected with "Аккаунт заблокирован"`)
      }
    }

    return NextResponse.json(
      createApiResponse({
        isActive: user.isActive,
      })
    )
  } catch (error: any) {
    console.error('Error updating isActive:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to update isActive'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

