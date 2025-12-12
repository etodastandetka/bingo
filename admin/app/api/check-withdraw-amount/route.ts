import { NextRequest, NextResponse } from 'next/server'
import { createApiResponse } from '@/lib/api-helpers'
import { checkWithdrawAmountCashdesk, checkWithdrawAmountMostbet, checkWithdrawAmount1win } from '@/lib/casino-withdraw'
import { getCasinoConfig } from '@/lib/deposit-balance'

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export async function POST(request: NextRequest) {
  try {
    // Публичный endpoint - не требует аутентификации

    const body = await request.json()
    const { bookmaker, userId, code } = body

    if (!bookmaker || !userId || !code) {
      return NextResponse.json(
        createApiResponse(null, 'Bookmaker, userId and code are required'),
        { status: 400 }
      )
    }

    // Получаем конфигурацию казино
    const config = await getCasinoConfig(bookmaker)
    
    if (!config) {
      return NextResponse.json(
        createApiResponse(null, `API configuration not found for ${bookmaker}`),
        { status: 404 }
      )
    }

    const normalizedBookmaker = bookmaker.toLowerCase()
    let result: { success: boolean; amount?: number; message: string; transactionId?: number }

    // Cashdesk API (1xbet, Melbet, Winwin, 888starz, 1xcasino, betwinner, wowbet)
    if (normalizedBookmaker.includes('1xbet') || 
        normalizedBookmaker.includes('melbet') || 
        normalizedBookmaker.includes('winwin') || 
        normalizedBookmaker.includes('888starz') || 
        normalizedBookmaker.includes('starz') || 
        normalizedBookmaker.includes('1xcasino') || 
        normalizedBookmaker.includes('xcasino') || 
        normalizedBookmaker.includes('betwinner') || 
        normalizedBookmaker.includes('wowbet')) {
      result = await checkWithdrawAmountCashdesk(bookmaker, userId, code, config)
    }
    // Mostbet
    else if (normalizedBookmaker.includes('mostbet')) {
      result = await checkWithdrawAmountMostbet(userId, code, config)
    }
    // 1win
    else if (normalizedBookmaker.includes('1win')) {
      result = await checkWithdrawAmount1win(userId, code, config)
    }
    else {
      return NextResponse.json(
        createApiResponse(null, `Unsupported bookmaker: ${bookmaker}`),
        { status: 400 }
      )
    }

    if (result.success) {
      return NextResponse.json(
        createApiResponse({
          amount: result.amount,
          transactionId: result.transactionId,
          message: result.message,
        }, result.message),
        { status: 200 }
      )
    }

    return NextResponse.json(
      createApiResponse(null, result.message),
      { status: 400 }
    )
  } catch (error: any) {
    console.error('Check withdraw amount API error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to check withdrawal amount'),
      { status: 500 }
    )
  }
}

