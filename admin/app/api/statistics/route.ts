import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'

// Отключаем кеширование для актуальных данных
export const dynamic = 'force-dynamic'

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
          status: { in: ['completed', 'approved', 'auto_completed', 'autodeposit_success'] },
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
          status: { in: ['completed', 'approved', 'auto_completed', 'autodeposit_success'] },
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

    // Данные для графика (последние 30 дней если период не указан)
    let chartStartDate = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    let chartEndDate = endDate ? new Date(endDate) : new Date()

    // Группировка по датам для графика (только успешные заявки)
    const depositsByDate = await prisma.$queryRaw<Array<{ date: string; count: bigint; sum: string }>>`
      SELECT 
        TO_CHAR(created_at, 'YYYY-MM-DD') as date,
        COUNT(*)::bigint as count,
        COALESCE(SUM(amount::numeric), '0')::text as sum
      FROM requests
      WHERE request_type = 'deposit'
        AND status IN ('completed', 'approved', 'auto_completed', 'autodeposit_success')
        AND created_at >= ${chartStartDate}::timestamp
        AND created_at <= ${chartEndDate}::timestamp
      GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
      ORDER BY date ASC
    `

    const withdrawalsByDate = await prisma.$queryRaw<Array<{ date: string; count: bigint; sum: string }>>`
      SELECT 
        TO_CHAR(created_at, 'YYYY-MM-DD') as date,
        COUNT(*)::bigint as count,
        COALESCE(SUM(amount::numeric), '0')::text as sum
      FROM requests
      WHERE request_type = 'withdraw'
        AND status IN ('completed', 'approved', 'auto_completed', 'autodeposit_success')
        AND created_at >= ${chartStartDate}::timestamp
        AND created_at <= ${chartEndDate}::timestamp
      GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
      ORDER BY date ASC
    `

    // Форматируем даты для графика (YYYY-MM-DD -> dd.mm)
    const formatDate = (dateStr: string) => {
      const [year, month, day] = dateStr.split('-')
      return `${day}.${month}`
    }

    const depositsLabels = depositsByDate.map((d) => formatDate(d.date))
    const depositsCount = depositsByDate.map((d) => Number(d.count))
    const depositsSum = depositsByDate.map((d) => parseFloat(d.sum || '0'))
    
    const withdrawalsLabels = withdrawalsByDate.map((d) => formatDate(d.date))
    const withdrawalsCount = withdrawalsByDate.map((d) => Number(d.count))
    const withdrawalsSum = withdrawalsByDate.map((d) => parseFloat(d.sum || '0'))

    // Создаем мапу для быстрого доступа
    const depositsDateMap = new Map<string, string>()
    depositsByDate.forEach((d) => {
      depositsDateMap.set(formatDate(d.date), d.date)
    })
    
    const withdrawalsDateMap = new Map<string, string>()
    withdrawalsByDate.forEach((d) => {
      withdrawalsDateMap.set(formatDate(d.date), d.date)
    })
    
    // Объединяем метки и сортируем по исходной дате
    const allLabelsSet = new Set([...depositsLabels, ...withdrawalsLabels])
    const allLabels = Array.from(allLabelsSet).sort((a, b) => {
      const dateA = depositsDateMap.get(a) || withdrawalsDateMap.get(a) || ''
      const dateB = depositsDateMap.get(b) || withdrawalsDateMap.get(b) || ''
      return dateA.localeCompare(dateB)
    })

    // Синхронизируем данные
    const depositsCountDict = Object.fromEntries(
      depositsLabels.map((label, i) => [label, depositsCount[i]])
    )
    const depositsSumDict = Object.fromEntries(
      depositsLabels.map((label, i) => [label, depositsSum[i]])
    )
    const withdrawalsCountDict = Object.fromEntries(
      withdrawalsLabels.map((label, i) => [label, withdrawalsCount[i]])
    )
    const withdrawalsSumDict = Object.fromEntries(
      withdrawalsLabels.map((label, i) => [label, withdrawalsSum[i]])
    )

    const synchronizedDepositsCount = allLabels.map((label) => depositsCountDict[label] || 0)
    const synchronizedDepositsSum = allLabels.map((label) => depositsSumDict[label] || 0)
    const synchronizedWithdrawalsCount = allLabels.map((label) => withdrawalsCountDict[label] || 0)
    const synchronizedWithdrawalsSum = allLabels.map((label) => withdrawalsSumDict[label] || 0)

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
        chart: {
          labels: allLabels,
          depositsCount: synchronizedDepositsCount,
          depositsSum: synchronizedDepositsSum,
          withdrawalsCount: synchronizedWithdrawalsCount,
          withdrawalsSum: synchronizedWithdrawalsSum,
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

