import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export interface CasinoStats {
  depositsSum: number
  depositsCount: number
  withdrawalsSum: number
  withdrawalsCount: number
  profit: number
}

export interface ShiftProfitResult {
  totalDeposits: number
  totalDepositsCount: number
  totalWithdrawals: number
  totalWithdrawalsCount: number
  totalProfit: number
  casinoStats: Record<string, CasinoStats>
}

/**
 * Calculate shift profit for a specific date
 * @param date - Date of the shift
 * @param endTime - Optional end time (default: 23:59:59, for current day: current time)
 */
export async function calculateShiftProfit(
  date: Date,
  endTime?: Date
): Promise<ShiftProfitResult> {
  // Set start time to 00:00:00 of the date
  const startTime = new Date(date)
  startTime.setHours(0, 0, 0, 0)

  // Set end time
  let endDateTime: Date
  if (endTime) {
    endDateTime = new Date(endTime)
  } else {
    // Default to 23:59:59 of the date
    endDateTime = new Date(date)
    endDateTime.setHours(23, 59, 59, 999)
  }

  // Successful statuses
  const successStatuses = ['completed', 'approved', 'auto_completed', 'autodeposit_success']
  
  // Get all requests for deposits and filter duplicates by ID
  const allDepositRequests = await prisma.request.findMany({
    where: {
      requestType: 'deposit',
      status: {
        in: ['completed', 'approved', 'auto_completed', 'autodeposit_success'],
      },
      createdAt: {
        gte: startTime,
        lte: endDateTime,
      },
      amount: {
        not: null,
      },
    },
    select: {
      id: true,
      bookmaker: true,
      amount: true,
    },
  })

  // Remove duplicates by ID (keep first occurrence)
  const seenDepositIds = new Set<number>()
  const depositRequests = allDepositRequests.filter((req) => {
    if (seenDepositIds.has(req.id)) {
      return false
    }
    seenDepositIds.add(req.id)
    return true
  })

  // Get all requests for withdrawals and filter duplicates by ID
  const allWithdrawalRequests = await prisma.request.findMany({
    where: {
      requestType: 'withdraw',
      status: {
        in: ['completed', 'approved', 'auto_completed', 'autodeposit_success'],
      },
      createdAt: {
        gte: startTime,
        lte: endDateTime,
      },
      amount: {
        not: null,
      },
    },
    select: {
      id: true,
      bookmaker: true,
      amount: true,
    },
  })

  // Remove duplicates by ID (keep first occurrence)
  const seenWithdrawalIds = new Set<number>()
  const withdrawalRequests = allWithdrawalRequests.filter((req) => {
    if (seenWithdrawalIds.has(req.id)) {
      return false
    }
    seenWithdrawalIds.add(req.id)
    return true
  })

  // Initialize casino stats
  const casinoStats: Record<string, CasinoStats> = {}

  // Process deposits
  let totalDeposits = 0
  let totalDepositsCount = 0

  for (const deposit of depositRequests) {
    const bookmaker = deposit.bookmaker || 'unknown'
    const amount = parseFloat(deposit.amount!.toString())

    if (!casinoStats[bookmaker]) {
      casinoStats[bookmaker] = {
        depositsSum: 0,
        depositsCount: 0,
        withdrawalsSum: 0,
        withdrawalsCount: 0,
        profit: 0,
      }
    }

    casinoStats[bookmaker].depositsSum += amount
    casinoStats[bookmaker].depositsCount += 1
    totalDeposits += amount
    totalDepositsCount += 1
  }

  // Process withdrawals
  let totalWithdrawals = 0
  let totalWithdrawalsCount = 0

  for (const withdrawal of withdrawalRequests) {
    const bookmaker = withdrawal.bookmaker || 'unknown'
    const amount = parseFloat(withdrawal.amount!.toString())

    if (!casinoStats[bookmaker]) {
      casinoStats[bookmaker] = {
        depositsSum: 0,
        depositsCount: 0,
        withdrawalsSum: 0,
        withdrawalsCount: 0,
        profit: 0,
      }
    }

    casinoStats[bookmaker].withdrawalsSum += amount
    casinoStats[bookmaker].withdrawalsCount += 1
    totalWithdrawals += amount
    totalWithdrawalsCount += 1
  }

  // Calculate profit for each casino (8% deposits + 2% withdrawals, except 1win and mostbet)
  let totalProfit = 0

  for (const [bookmaker, stats] of Object.entries(casinoStats)) {
    const normalizedBookmaker = bookmaker.toLowerCase()
    
    // Skip profit calculation for 1win and mostbet
    if (normalizedBookmaker.includes('1win') || normalizedBookmaker.includes('mostbet')) {
      stats.profit = 0
    } else {
      // Calculate profit: 8% of deposits + 2% of withdrawals
      stats.profit = stats.depositsSum * 0.08 + stats.withdrawalsSum * 0.02
      totalProfit += stats.profit
    }
  }

  return {
    totalDeposits,
    totalDepositsCount,
    totalWithdrawals,
    totalWithdrawalsCount,
    totalProfit,
    casinoStats,
  }
}

/**
 * Aggregate statistics from multiple shifts
 * @param shifts - Array of closed shifts with casinoStats
 */
export function aggregateShiftsStats(shifts: Array<{
  casinoStats: Record<string, CasinoStats> | null
  totalDeposits: number | Prisma.Decimal
  totalDepositsCount: number
  totalWithdrawals: number | Prisma.Decimal
  totalWithdrawalsCount: number
  totalProfit: number | Prisma.Decimal
}>): ShiftProfitResult {
  const aggregatedCasinoStats: Record<string, CasinoStats> = {}
  let totalDeposits = 0
  let totalDepositsCount = 0
  let totalWithdrawals = 0
  let totalWithdrawalsCount = 0
  let totalProfit = 0

  for (const shift of shifts) {
    // Add totals
    totalDeposits += parseFloat(shift.totalDeposits.toString())
    totalDepositsCount += shift.totalDepositsCount
    totalWithdrawals += parseFloat(shift.totalWithdrawals.toString())
    totalWithdrawalsCount += shift.totalWithdrawalsCount
    totalProfit += parseFloat(shift.totalProfit.toString())

    // Aggregate casino stats
    if (shift.casinoStats && typeof shift.casinoStats === 'object') {
      for (const [bookmaker, stats] of Object.entries(shift.casinoStats)) {
        if (!aggregatedCasinoStats[bookmaker]) {
          aggregatedCasinoStats[bookmaker] = {
            depositsSum: 0,
            depositsCount: 0,
            withdrawalsSum: 0,
            withdrawalsCount: 0,
            profit: 0,
          }
        }

        aggregatedCasinoStats[bookmaker].depositsSum += stats.depositsSum || 0
        aggregatedCasinoStats[bookmaker].depositsCount += stats.depositsCount || 0
        aggregatedCasinoStats[bookmaker].withdrawalsSum += stats.withdrawalsSum || 0
        aggregatedCasinoStats[bookmaker].withdrawalsCount += stats.withdrawalsCount || 0
        aggregatedCasinoStats[bookmaker].profit += stats.profit || 0
      }
    }
  }

  return {
    totalDeposits,
    totalDepositsCount,
    totalWithdrawals,
    totalWithdrawalsCount,
    totalProfit,
    casinoStats: aggregatedCasinoStats,
  }
}

