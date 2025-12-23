import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { payoutCashdeskAPI } from '@/lib/casino-deposit'
import { getCasinoConfig } from '@/lib/casino-config'
import { checkWithdrawAmountMostbet, checkWithdrawAmount1win } from '@/lib/casino-withdraw'

export const dynamic = 'force-dynamic'

// Функция для вывода баланса через API казино
async function withdrawFromCasino(
  bookmaker: string,
  accountId: string,
  code: string
): Promise<{ success: boolean; message: string; data?: any }> {
  const normalizedBookmaker = bookmaker?.toLowerCase() || ''

  try {
    // 1xbet, Melbet, Winwin, 888starz, 1xCasino, BetWinner и WowBet используют Cashdesk API
    if (normalizedBookmaker.includes('1xbet') || normalizedBookmaker.includes('melbet') || normalizedBookmaker.includes('winwin') || normalizedBookmaker.includes('888starz') || normalizedBookmaker.includes('starz') || normalizedBookmaker.includes('1xcasino') || normalizedBookmaker.includes('xcasino') || normalizedBookmaker.includes('betwinner') || normalizedBookmaker.includes('wowbet')) {
      const config = await getCasinoConfig(bookmaker)
      
      if (!config) {
        return {
          success: false,
          message: `${bookmaker} API configuration not found in database`,
        }
      }

      return await payoutCashdeskAPI(bookmaker, accountId, code, config)
    }
    
    // Mostbet использует свой API (проверка суммы и вывод выполняются вместе)
    if (normalizedBookmaker.includes('mostbet')) {
      const config = await getCasinoConfig(bookmaker)
      
      if (!config) {
        return {
          success: false,
          message: 'Mostbet API configuration not found in database',
        }
      }

      const result = await checkWithdrawAmountMostbet(accountId, code, config)
      
      if (result.success) {
        return {
          success: true,
          message: result.message || 'Balance withdrawn successfully',
          data: {
            amount: result.amount,
            transactionId: result.transactionId,
          },
        }
      }
      
      return {
        success: false,
        message: result.message || 'Failed to withdraw balance',
      }
    }
    
    // 1win использует свой API (проверка суммы и вывод выполняются вместе)
    if (normalizedBookmaker.includes('1win')) {
      const config = await getCasinoConfig(bookmaker)
      
      if (!config) {
        return {
          success: false,
          message: '1win API configuration not found in database',
        }
      }

      const result = await checkWithdrawAmount1win(accountId, code, config)
      
      if (result.success) {
        return {
          success: true,
          message: result.message || 'Balance withdrawn successfully',
          data: {
            amount: result.amount,
          },
        }
      }
      
      return {
        success: false,
        message: result.message || 'Failed to withdraw balance',
      }
    }

    return {
      success: false,
      message: `Unsupported bookmaker: ${bookmaker}`,
    }
  } catch (error: any) {
    console.error(`[Withdraw Balance] Error for ${bookmaker}:`, error)
    return {
      success: false,
      message: error.message || 'Failed to withdraw balance',
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    requireAuth(request)

    const body = await request.json()
    const { bookmaker, accountId, code } = body

    if (!bookmaker || !accountId || !code) {
      return NextResponse.json(
        createApiResponse(null, 'Bookmaker, accountId and code are required'),
        { status: 400 }
      )
    }

    const result = await withdrawFromCasino(bookmaker, accountId, code)

    if (result.success) {
      return NextResponse.json(
        createApiResponse(result.data, result.message),
        { status: 200 }
      )
    }

    return NextResponse.json(
      createApiResponse(null, result.message),
      { status: 400 }
    )
  } catch (error: any) {
    console.error('Withdraw balance API error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to withdraw balance'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

