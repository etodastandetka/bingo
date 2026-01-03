import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'
import { calculateShiftProfit, aggregateShiftsStats } from '@/lib/shift-calculator'
import { closeShiftForDate, autoCloseYesterdayShift } from '@/lib/shift-closer'
import { getPlatformLimits } from '@/lib/casino-api'

export const dynamic = 'force-dynamic'

/**
 * GET - Get statistics for display on statistics page
 * Supports single date or date range
 */
export async function GET(request: NextRequest) {
  try {
    requireAuth(request)

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // Auto-close yesterday's shift if needed
    await autoCloseYesterdayShift()

    // Get platform limits for total limit calculation
    const platformLimits = await getPlatformLimits()
    const totalLimit = platformLimits.reduce((sum, p) => sum + p.limit, 0)
    const totalLimitUSD = totalLimit / 88 // Approximate exchange rate: 88 KGS = 1 USD

    // If date range is specified
    if (startDate && endDate) {
      const start = new Date(startDate)
      start.setHours(0, 0, 0, 0)
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)

      // Find all closed shifts in the range
      const shifts = await prisma.shift.findMany({
        where: {
          date: {
            gte: start,
            lte: end,
          },
          isClosed: true,
        },
        orderBy: { date: 'asc' },
      })

      // Aggregate statistics from all shifts
      const aggregatedStats = aggregateShiftsStats(
        shifts.map((shift) => ({
          casinoStats: (shift.casinoStats as any) || null,
          totalDeposits: shift.totalDeposits,
          totalDepositsCount: shift.totalDepositsCount,
          totalWithdrawals: shift.totalWithdrawals,
          totalWithdrawalsCount: shift.totalWithdrawalsCount,
          totalProfit: shift.totalProfit,
        }))
      )

      return NextResponse.json(
        createApiResponse({
          ...aggregatedStats,
          totalLimit,
          totalLimitUSD,
          isDateRange: true,
          startDate: startDate,
          endDate: endDate,
        })
      )
    }

    // Single date (default: today)
    const targetDate = date ? new Date(date) : new Date()
    targetDate.setHours(0, 0, 0, 0)

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const isToday = targetDate.getTime() === today.getTime()

    // Check if shift exists
    let shift = await prisma.shift.findUnique({
      where: { date: targetDate },
    })

    let stats

    if (isToday) {
      // For today: calculate real-time (00:00:00 - current time)
      const currentTime = new Date()
      stats = await calculateShiftProfit(targetDate, currentTime)
    } else {
      // For past dates: use stored data if closed, otherwise calculate and close
      if (shift && shift.isClosed) {
        // Use stored data
        stats = {
          totalDeposits: parseFloat(shift.totalDeposits.toString()),
          totalDepositsCount: shift.totalDepositsCount,
          totalWithdrawals: parseFloat(shift.totalWithdrawals.toString()),
          totalWithdrawalsCount: shift.totalWithdrawalsCount,
          totalProfit: parseFloat(shift.totalProfit.toString()),
          casinoStats: (shift.casinoStats as any) || {},
        }
      } else {
        // Calculate and close the shift
        await closeShiftForDate(targetDate)
        shift = await prisma.shift.findUnique({
          where: { date: targetDate },
        })
        if (shift) {
          stats = {
            totalDeposits: parseFloat(shift.totalDeposits.toString()),
            totalDepositsCount: shift.totalDepositsCount,
            totalWithdrawals: parseFloat(shift.totalWithdrawals.toString()),
            totalWithdrawalsCount: shift.totalWithdrawalsCount,
            totalProfit: parseFloat(shift.totalProfit.toString()),
            casinoStats: (shift.casinoStats as any) || {},
          }
        } else {
          // Fallback: calculate on the fly
          stats = await calculateShiftProfit(targetDate)
        }
      }
    }

    return NextResponse.json(
      createApiResponse({
        ...stats,
        totalLimit,
        totalLimitUSD,
        isDateRange: false,
        date: targetDate.toISOString().split('T')[0],
        isClosed: shift?.isClosed || false,
        isToday,
      })
    )
  } catch (error: any) {
    console.error('Error fetching shift statistics:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to fetch statistics'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

