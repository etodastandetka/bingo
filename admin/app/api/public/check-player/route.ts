import { NextRequest, NextResponse } from 'next/server'
import { createApiResponse } from '@/lib/api-helpers'
import { getCasinoConfig } from '@/lib/casino-config'
import { searchPlayerCashdeskAPI } from '@/lib/casino-deposit'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { bookmaker, accountId } = body

    if (!bookmaker || !accountId) {
      return NextResponse.json(
        createApiResponse(null, 'Bookmaker and accountId are required'),
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

    // Проверяем, что это казино с Cashdesk API (не 1win и не mostbet)
    const normalizedBookmaker = bookmaker.toLowerCase()
    const isCashdeskAPI = normalizedBookmaker.includes('1xbet') || 
                         normalizedBookmaker.includes('melbet') || 
                         normalizedBookmaker.includes('winwin') || 
                         normalizedBookmaker.includes('888starz') || 
                         normalizedBookmaker.includes('starz') || 
                         normalizedBookmaker.includes('1xcasino') || 
                         normalizedBookmaker.includes('xcasino') || 
                         normalizedBookmaker.includes('betwinner') || 
                         normalizedBookmaker.includes('wowbet')

    if (!isCashdeskAPI) {
      // Для 1win и mostbet не проверяем игрока
      return NextResponse.json(
        createApiResponse({ exists: true, skipCheck: true }, 'Player check skipped for this casino'),
        { status: 200 }
      )
    }

    // Проверяем игрока через Cashdesk API
    const result = await searchPlayerCashdeskAPI(bookmaker, accountId, config)

    if (result.success) {
      return NextResponse.json(
        createApiResponse({ exists: true, player: result.data }, undefined, 'Player found'),
        { status: 200 }
      )
    }

    return NextResponse.json(
      createApiResponse({ exists: false, message: result.message }, undefined, 'Player not found'),
      { status: 404 }
    )
  } catch (error: any) {
    console.error('Check player API error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to check player'),
      { status: 500 }
    )
  }
}

