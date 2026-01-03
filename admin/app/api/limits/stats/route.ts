import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    requireAuth(request)

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('start')
    const endDate = searchParams.get('end')

    const filters: any = {}
    if (startDate) {
      filters.createdAt = { ...filters.createdAt, gte: new Date(startDate) }
    }
    if (endDate) {
      filters.createdAt = { ...filters.createdAt, lte: new Date(endDate) }
    }

    // Статистика пополнений (только успешные заявки)
    const depositStats = await prisma.request.aggregate({
      where: {
        requestType: 'deposit',
        status: { in: ['completed', 'approved', 'auto_completed', 'autodeposit_success'] },
        ...filters,
      },
      _count: { id: true },
      _sum: { amount: true },
    })

    // Статистика выводов (только успешные заявки)
    const withdrawalStats = await prisma.request.aggregate({
      where: {
        requestType: 'withdraw',
        status: { in: ['completed', 'approved', 'auto_completed', 'autodeposit_success'] },
        ...filters,
      },
      _count: { id: true },
      _sum: { amount: true },
    })

    const totalDepositsCount = depositStats._count.id || 0
    const totalDepositsSum = parseFloat(depositStats._sum.amount?.toString() || '0')
    const totalWithdrawalsCount = withdrawalStats._count.id || 0
    const totalWithdrawalsSum = parseFloat(withdrawalStats._sum.amount?.toString() || '0')

    // Приблизительный доход: 8% от пополнений + 2% от выводов
    const approximateIncome = totalDepositsSum * 0.08 + totalWithdrawalsSum * 0.02

    // Данные для графика (последние 30 дней если период не указан)
    let chartStartDate = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    let chartEndDate = endDate ? new Date(endDate) : new Date()

    // Группировка по датам для графика используя SQL (только успешные заявки)
    const depositsByDate = await prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT 
        TO_CHAR(created_at, 'YYYY-MM-DD') as date,
        COUNT(*)::bigint as count
      FROM requests
      WHERE request_type = 'deposit'
        AND status IN ('completed', 'approved', 'auto_completed', 'autodeposit_success')
        AND created_at >= ${chartStartDate}::timestamp
        AND created_at <= ${chartEndDate}::timestamp
      GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
      ORDER BY date DESC
      LIMIT 10
    `

    const withdrawalsByDate = await prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT 
        TO_CHAR(created_at, 'YYYY-MM-DD') as date,
        COUNT(*)::bigint as count
      FROM requests
      WHERE request_type = 'withdraw'
        AND status IN ('completed', 'approved', 'auto_completed', 'autodeposit_success')
        AND created_at >= ${chartStartDate}::timestamp
        AND created_at <= ${chartEndDate}::timestamp
      GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
      ORDER BY date DESC
      LIMIT 10
    `

    // Форматируем даты для графика (YYYY-MM-DD -> dd.mm)
    const formatDate = (dateStr: string) => {
      const [year, month, day] = dateStr.split('-')
      return `${day}.${month}`
    }

    const depositsLabels = depositsByDate.map((d) => formatDate(d.date))
    const depositsData = depositsByDate.map((d) => Number(d.count))
    const withdrawalsLabels = withdrawalsByDate.map((d) => formatDate(d.date))
    const withdrawalsData = withdrawalsByDate.map((d) => Number(d.count))

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
    const depositsDict = Object.fromEntries(
      depositsLabels.map((label, i) => [label, depositsData[i]])
    )
    const withdrawalsDict = Object.fromEntries(
      withdrawalsLabels.map((label, i) => [label, withdrawalsData[i]])
    )

    const synchronizedDeposits = allLabels.map((label) => depositsDict[label] || 0)
    const synchronizedWithdrawals = allLabels.map((label) => withdrawalsDict[label] || 0)

    // Получаем лимиты платформ через API
    const { getPlatformLimits } = await import('@/lib/casino-api')
    const platformLimits = await getPlatformLimits()

    return NextResponse.json(
      createApiResponse({
        platformLimits,
        totalDepositsCount,
        totalDepositsSum,
        totalWithdrawalsCount,
        totalWithdrawalsSum,
        approximateIncome,
        chart: {
          labels: allLabels,
          deposits: synchronizedDeposits,
          withdrawals: synchronizedWithdrawals,
        },
      })
    )
  } catch (error: any) {
    console.error('Limits stats error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to fetch limits stats'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

