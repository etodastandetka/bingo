import { prisma } from '@/lib/prisma'
import { calculateShiftProfit } from './shift-calculator'

/**
 * Close shift for a specific date
 * Calculates profit and saves detailed statistics to database
 */
export async function closeShiftForDate(date: Date): Promise<void> {
  // Calculate profit for the full day (00:00:00 - 23:59:59)
  const endTime = new Date(date)
  endTime.setHours(23, 59, 59, 999)

  const profitData = await calculateShiftProfit(date, endTime)

  // Format date to YYYY-MM-DD for database
  const dateStr = date.toISOString().split('T')[0]
  const dateOnly = new Date(dateStr)

  // Create or update shift record
  await prisma.shift.upsert({
    where: { date: dateOnly },
    create: {
      date: dateOnly,
      isClosed: true,
      totalDeposits: profitData.totalDeposits,
      totalDepositsCount: profitData.totalDepositsCount,
      totalWithdrawals: profitData.totalWithdrawals,
      totalWithdrawalsCount: profitData.totalWithdrawalsCount,
      totalProfit: profitData.totalProfit,
      casinoStats: profitData.casinoStats as any,
    },
    update: {
      isClosed: true,
      totalDeposits: profitData.totalDeposits,
      totalDepositsCount: profitData.totalDepositsCount,
      totalWithdrawals: profitData.totalWithdrawals,
      totalWithdrawalsCount: profitData.totalWithdrawalsCount,
      totalProfit: profitData.totalProfit,
      casinoStats: profitData.casinoStats as any,
    },
  })
}

/**
 * Check and auto-close yesterday's shift if not closed
 */
export async function autoCloseYesterdayShift(): Promise<void> {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)

  const shift = await prisma.shift.findUnique({
    where: { date: yesterday },
  })

  // If shift doesn't exist or is not closed, close it
  if (!shift || !shift.isClosed) {
    await closeShiftForDate(yesterday)
  }
}

