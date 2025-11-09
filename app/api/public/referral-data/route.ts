import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Публичный эндпоинт для получения данных реферальной программы (без авторизации)
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('user_id')
    
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'User ID is required'
      }, { status: 400 })
    }
    
    const userIdBigInt = BigInt(userId)
    
    // Получаем всех рефералов пользователя
    const referrals = await prisma.botReferral.findMany({
      where: {
        referrer: {
          userId: userIdBigInt
        }
      },
      include: {
        referred: true
      }
    })
    
    const referredUserIds = referrals.map(r => r.referred.userId)
    
    // Получаем завершенные депозиты рефералов
    const completedDeposits = await prisma.request.findMany({
      where: {
        userId: { in: referredUserIds },
        requestType: 'deposit',
        status: { in: ['completed', 'approved', 'auto_completed', 'autodeposit_success'] }
      }
    })
    
    // Считаем количество активных рефералов (которые сделали депозит)
    const activeReferralCount = new Set(completedDeposits.map(d => d.userId.toString())).size
    
    // Считаем общую сумму депозитов рефералов
    const totalDeposits = completedDeposits.reduce((sum, dep) => {
      return sum + (dep.amount ? parseFloat(dep.amount.toString()) : 0)
    }, 0)
    
    // Получаем заработанные комиссии (завершенные)
    const earnings = await prisma.botReferralEarning.findMany({
      where: {
        referrer: {
          userId: userIdBigInt
        },
        status: 'completed'
      }
    })
    
    const earned = earnings.reduce((sum, e) => {
      return sum + (e.commissionAmount ? parseFloat(e.commissionAmount.toString()) : 0)
    }, 0)
    
    // НОВАЯ ЛОГИКА: Топ-5 реферов по сумме пополнений их рефералов
    // Получаем всех реферов и их рефералов
    const allReferrers = await prisma.botReferral.findMany({
      include: {
        referrer: true,
        referred: true
      }
    })
    
    // Группируем рефералов по реферам
    const referrerMap = new Map<string, {
      referrerId: string,
      referrerUsername: string,
      referredUserIds: Set<string>,
      totalDeposits: number
    }>()
    
    // Заполняем карту реферов
    for (const referral of allReferrers) {
      const referrerIdStr = referral.referrer.userId.toString()
      const referredIdStr = referral.referred.userId.toString()
      
      if (!referrerMap.has(referrerIdStr)) {
        const displayName = referral.referrer.username 
          ? `@${referral.referrer.username}` 
          : referral.referrer.firstName 
            ? referral.referrer.firstName 
            : `Игрок #${referrerIdStr}`
        
        referrerMap.set(referrerIdStr, {
          referrerId: referrerIdStr,
          referrerUsername: displayName,
          referredUserIds: new Set(),
          totalDeposits: 0
        })
      }
      
      referrerMap.get(referrerIdStr)!.referredUserIds.add(referredIdStr)
    }
    
    // Получаем все завершенные депозиты
    const allDeposits = await prisma.request.findMany({
      where: {
        requestType: 'deposit',
        status: { in: ['completed', 'approved', 'auto_completed', 'autodeposit_success'] }
      }
    })
    
    // Считаем сумму пополнений для каждого рефера (от всех его рефералов)
    for (const deposit of allDeposits) {
      const depositUserIdStr = deposit.userId.toString()
      
      // Находим всех реферов, у которых этот пользователь является рефералом
      for (const [referrerId, referrerData] of referrerMap.entries()) {
        if (referrerData.referredUserIds.has(depositUserIdStr)) {
          referrerData.totalDeposits += deposit.amount ? parseFloat(deposit.amount.toString()) : 0
        }
      }
    }
    
    // Сортируем по сумме пополнений рефералов и берем топ-5
    const topReferrers = Array.from(referrerMap.values())
      .sort((a, b) => b.totalDeposits - a.totalDeposits)
      .slice(0, 5)
      .map((ref, index) => ({
        id: ref.referrerId,
        username: ref.referrerUsername,
        total_deposits: ref.totalDeposits,
        referral_count: ref.referredUserIds.size,
        rank: index + 1
      }))
    
    // Находим место текущего пользователя (как рефера)
    let userRank = 0
    let userTotalDeposits = 0
    const allReferrersSorted = Array.from(referrerMap.values())
      .sort((a, b) => b.totalDeposits - a.totalDeposits)
    
    for (let i = 0; i < allReferrersSorted.length; i++) {
      if (allReferrersSorted[i].referrerId === userId) {
        userRank = i + 1
        userTotalDeposits = allReferrersSorted[i].totalDeposits
        break
      }
    }
    
    // Определяем причину, почему пользователь не в топе (если не в топе)
    let notInTopReason: string | null = null
    if (userRank === 0) {
      if (referrals.length === 0) {
        notInTopReason = 'no_referrals' // Нет рефералов
      } else if (totalDeposits === 0) {
        notInTopReason = 'no_deposits' // Рефералы не делали депозиты
      } else {
        notInTopReason = 'low_amount' // Сумма депозитов меньше, чем у топ-5
      }
    }
    
    // Если пользователь не в топ-5, но есть данные, показываем его место
    const userInTop5 = userRank > 0 && userRank <= 5
    
    // Настройки призового фонда: 20,000 сом распределены между 5 местами
    const prizeDistribution = [
      10000, // 1 место
      5000,  // 2 место
      2500,  // 3 место
      1500,  // 4 место
      1000   // 5 место
    ]
    
    // Добавляем призы к топ-5 реферам
    const topReferrersWithPrizes = topReferrers.map((ref, index) => ({
      ...ref,
      prize: prizeDistribution[index] || 0
    }))
    
    // Получаем уже выведенные средства для расчета доступного баланса
    const completedWithdrawals = await prisma.referralWithdrawalRequest.findMany({
      where: {
        userId: userIdBigInt,
        status: 'completed'
      }
    })
    
    const totalWithdrawn = completedWithdrawals.reduce((sum, w) => {
      return sum + (w.amount ? parseFloat(w.amount.toString()) : 0)
    }, 0)
    
    const availableBalance = earned - totalWithdrawn
    
    // Проверяем, есть ли pending заявка
    const pendingWithdrawal = await prisma.referralWithdrawalRequest.findFirst({
      where: {
        userId: userIdBigInt,
        status: 'pending'
      }
    })
    
    const hasPendingWithdrawal = !!pendingWithdrawal
    
    const response = NextResponse.json({
      success: true,
      earned: earned,
      available_balance: availableBalance, // Доступный баланс для вывода
      has_pending_withdrawal: hasPendingWithdrawal, // Есть ли pending заявка
      referral_count: activeReferralCount, // Количество рефералов, которые сделали депозиты
      total_referrals: referrals.length, // Общее количество рефералов (включая тех, кто не делал депозиты)
      top_players: topReferrersWithPrizes, // Топ-5 реферов
      user_rank: userRank > 0 ? userRank : null, // Место в рейтинге (null если не в топе)
      user_in_top5: userInTop5, // В топ-5 или нет
      user_total_deposits: userTotalDeposits, // Сумма всех депозитов рефералов пользователя
      not_in_top_reason: notInTopReason, // Причина, почему не в топе (если не в топе)
      // Минимальная сумма для попадания в топ-5 (сумма 5-го места)
      min_amount_for_top5: topReferrersWithPrizes.length >= 5 
        ? topReferrersWithPrizes[4].total_deposits 
        : 0,
      settings: {
        referral_percentage: 5,
        min_payout: 100,
        first_place_prize: prizeDistribution[0],
        second_place_prize: prizeDistribution[1],
        third_place_prize: prizeDistribution[2],
        fourth_place_prize: prizeDistribution[3],
        fifth_place_prize: prizeDistribution[4],
        total_prize_pool: 20000,
        next_payout_date: '1 ноября'
      }
    })
    response.headers.set('Access-Control-Allow-Origin', '*')
    return response
    
  } catch (error: any) {
    console.error('Referral data API error:', error)
    const errorResponse = NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch referral data'
    }, { status: 500 })
    errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return errorResponse
  }
}

export const dynamic = 'force-dynamic'

