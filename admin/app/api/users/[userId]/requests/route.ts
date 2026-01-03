import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'
import { syncUserFromRequest } from '@/lib/sync-user'

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    requireAuth(request)

    const userId = BigInt(params.userId)
    
    // Получаем параметры запроса
    const searchParams = request.nextUrl.searchParams
    const requestType = searchParams.get('type') // 'deposit' или 'withdraw'
    const limitParam = searchParams.get('limit')
    const limit = limitParam ? parseInt(limitParam, 10) : undefined

    // Синхронизируем данные пользователя перед получением заявок
    await syncUserFromRequest(userId)

    const uncreatedModel = (prisma as any).uncreatedRequest

    // Формируем условие where с учетом фильтра по типу
    const whereClause: any = { userId }
    if (requestType) {
      whereClause.requestType = requestType
    }

    const [requests, uncreated] = await Promise.all([
      prisma.request.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: limit, // Применяем лимит, если указан
        select: {
          id: true,
          userId: true,
          accountId: true,
          username: true,
          firstName: true,
          lastName: true,
          requestType: true,
          amount: true,
          status: true,
          statusDetail: true,
          bookmaker: true,
          bank: true,
          phone: true,
          createdAt: true,
          processedAt: true,
        },
      }),
      uncreatedModel
        ? uncreatedModel.findMany({
        where: { userId, status: { in: ['not_created', 'pending_check'] } },
        orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([]),
    ])

    return NextResponse.json(
      createApiResponse({
        requests: requests.map((r: any) => ({
          id: r.id,
          userId: r.userId.toString(),
          accountId: r.accountId,
          username: r.username,
          firstName: r.firstName,
          lastName: r.lastName,
          requestType: r.requestType,
          amount: r.amount?.toString() || '0',
          status: r.status,
          statusDetail: r.statusDetail,
          bookmaker: r.bookmaker,
          bank: r.bank,
          phone: r.phone,
          createdAt: r.createdAt.toISOString(),
          processedAt: r.processedAt?.toISOString() || null,
        })),
        uncreatedRequests: uncreated.map((u: any) => ({
          id: u.id,
          userId: u.userId.toString(),
          username: u.username,
          firstName: u.firstName,
          lastName: u.lastName,
          bookmaker: u.bookmaker,
          accountId: u.accountId,
          bank: u.bank,
          amount: u.amount?.toString() || '0',
          requestType: u.requestType,
          status: u.status,
          createdRequestId: u.createdRequestId,
          createdAt: u.createdAt.toISOString(),
          updatedAt: u.updatedAt.toISOString(),
        })),
        total: requests.length,
      })
    )
  } catch (error: any) {
    console.error('User requests API error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to fetch user requests'),
      { status: 500 }
    )
  }
}

