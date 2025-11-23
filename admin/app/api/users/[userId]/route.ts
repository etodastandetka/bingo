import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    requireAuth(request)

    const userId = BigInt(params.userId)

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
          bookmaker: req.bookmaker,
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

    return NextResponse.json(
      createApiResponse({
        ...user,
        userId: user.userId.toString(),
        transactions: user.transactions.map(t => ({
          ...t,
          amount: t.amount.toString(),
          status_detail: (t as any).statusDetail || null,
        })),
        referralEarnings: user.referralEarnings.map(e => ({
          ...e,
          amount: e.amount.toString(),
          commissionAmount: e.commissionAmount.toString(),
        })),
      })
    )
  } catch (error: any) {
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to fetch user'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

