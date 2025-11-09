import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createApiResponse } from '@/lib/api-helpers'
import { checkWithdrawsExistMostbet } from '@/lib/casino-withdraw'

/**
 * API для проверки наличия выводов для игрока (без кода)
 * GET /api/withdraw-check-exists?bookmaker=...&playerId=...
 */
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
    const bookmaker = searchParams.get('bookmaker')
    const playerId = searchParams.get('playerId')

    if (!bookmaker || !playerId) {
      return NextResponse.json(
        createApiResponse(null, 'Missing required parameters: bookmaker, playerId'),
        { 
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
          }
        }
      )
    }

    console.log(`[Withdraw Check Exists] Bookmaker: ${bookmaker}, Player ID: ${playerId}`)

    const normalizedBookmaker = bookmaker.toLowerCase()
    
    // Для 1xbet/Melbet/1win - нет метода проверки без кода, возвращаем что проверка возможна
    if (normalizedBookmaker.includes('1xbet') || 
        normalizedBookmaker.includes('melbet') || 
        normalizedBookmaker.includes('1win')) {
      return NextResponse.json(
        createApiResponse(
          { hasWithdrawals: true, canCheck: true },
          'Code required to check withdrawal'
        ),
        {
          headers: {
            'Access-Control-Allow-Origin': '*',
          }
        }
      )
    }

    // Для Mostbet можем проверить наличие выводов
    if (normalizedBookmaker.includes('mostbet') || normalizedBookmaker === 'mostbet') {
      const setting = await prisma.botConfiguration.findFirst({
        where: { key: 'mostbet_api_config' },
      })

      let config: any = null

      if (setting) {
        const settingConfig = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value
        if (settingConfig.api_key && settingConfig.secret && settingConfig.cashpoint_id) {
          config = {
            api_key: settingConfig.api_key,
            secret: settingConfig.secret,
            cashpoint_id: String(settingConfig.cashpoint_id),
          }
        }
      }

      if (!config) {
        config = {
          api_key: process.env.MOSTBET_API_KEY || 'api-key:0522f4fb-0a18-4ec2-8e27-428643602db4',
          secret: process.env.MOSTBET_SECRET || 'Eldiyar.07',
          cashpoint_id: process.env.MOSTBET_CASHPOINT_ID || 'C92905',
        }
      }

      const result = await checkWithdrawsExistMostbet(playerId, config)

      if (!result.success) {
        return NextResponse.json(
          createApiResponse(null, result.message || 'Failed to check withdrawals'),
          { 
            status: 400,
            headers: {
              'Access-Control-Allow-Origin': '*',
            }
          }
        )
      }

      return NextResponse.json(
        createApiResponse(
          {
            hasWithdrawals: result.hasWithdrawals,
            canCheck: true,
          },
          result.message
        ),
        {
          headers: {
            'Access-Control-Allow-Origin': '*',
          }
        }
      )
    }

    return NextResponse.json(
      createApiResponse(null, `Unsupported bookmaker: ${bookmaker}`),
      { 
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
        }
      }
    )
  } catch (error: any) {
    console.error('❌ Error checking withdrawals:', error)
    return NextResponse.json(
      createApiResponse(null, `Error: ${error.message}`),
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
        }
      }
    )
  }
}

