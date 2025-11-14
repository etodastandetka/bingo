import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'

export async function GET(request: NextRequest) {
  try {
    requireAuth(request)

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const dateFilter: any = {}
    if (startDate || endDate) {
      dateFilter.createdAt = {}
      if (startDate) dateFilter.createdAt.gte = new Date(startDate)
      if (endDate) dateFilter.createdAt.lte = new Date(endDate)
    }

    const [
      totalUsers,
      totalRequests,
      pendingRequests,
      completedRequests,
      depositsStats,
      withdrawalsStats,
      totalReferrals,
      totalEarnings,
    ] = await Promise.all([
      prisma.botUser.count(),
      prisma.request.count(dateFilter.startDate || dateFilter.endDate ? { where: dateFilter } : undefined),
      prisma.request.count({
        where: {
          ...dateFilter,
          status: 'pending',
        },
      }),
      prisma.request.count({
        where: {
          ...dateFilter,
          status: 'completed',
        },
      }),
      prisma.request.aggregate({
        where: {
          ...dateFilter,
          requestType: 'deposit',
          status: 'completed',
        },
        _sum: {
          amount: true,
        },
        _count: true,
      }),
      prisma.request.aggregate({
        where: {
          ...dateFilter,
          requestType: 'withdraw',
          status: 'completed',
        },
        _sum: {
          amount: true,
        },
        _count: true,
      }),
      prisma.botReferral.count(),
      prisma.botReferralEarning.aggregate({
        where: {
          status: 'completed',
        },
        _sum: {
          commissionAmount: true,
        },
      }),
    ])

    return NextResponse.json(
      createApiResponse({
        totalUsers,
        totalRequests,
        pendingRequests,
        completedRequests,
        deposits: {
          total: depositsStats._sum.amount?.toString() || '0',
          count: depositsStats._count,
        },
        withdrawals: {
          total: withdrawalsStats._sum.amount?.toString() || '0',
          count: withdrawalsStats._count,
        },
        referrals: {
          total: totalReferrals,
          earnings: totalEarnings._sum.commissionAmount?.toString() || '0',
        },
      })
    )
  } catch (error: any) {
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to fetch statistics'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

