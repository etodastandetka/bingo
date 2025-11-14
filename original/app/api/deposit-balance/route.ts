import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { depositCashdeskAPI, depositMostbetAPI } from '@/lib/casino-deposit'

export const dynamic = 'force-dynamic'

// Функция для получения конфигурации API казино из настроек
async function getCasinoConfig(bookmaker: string) {
  const normalizedBookmaker = bookmaker?.toLowerCase() || ''
  
  // Для 1xbet и Melbet нужны: hash, cashierpass, login, cashdeskid
  if (normalizedBookmaker.includes('1xbet') || normalizedBookmaker === '1xbet') {
    // Сначала пробуем получить из БД
    const setting = await prisma.botConfiguration.findFirst({
      where: { key: '1xbet_api_config' },
    })

    if (setting) {
      const config = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value
      if (config.hash && config.cashierpass && config.login && config.cashdeskid) {
        return {
          hash: config.hash,
          cashierpass: config.cashierpass,
          login: config.login,
          cashdeskid: String(config.cashdeskid),
        }
      }
    }

    // Fallback на дефолтные значения из casino_api_config.py
    return {
      hash: process.env.XBET_HASH || process.env.ONEXBET_HASH || '97f471a9db92debbda38201af67e15f64d086e94ae4b919d8a6a4f64958912cf',
      cashierpass: process.env.XBET_CASHIERPASS || process.env.ONEXBET_CASHIERPASS || 'wiaWAfE9',
      login: process.env.XBET_LOGIN || process.env.ONEXBET_LOGIN || 'zhenishbAd',
      cashdeskid: process.env.XBET_CASHDESKID || process.env.ONEXBET_CASHDESKID || '1388580',
    }
  }
  
  if (normalizedBookmaker.includes('melbet') || normalizedBookmaker === 'melbet') {
    // Сначала пробуем получить из БД
    const setting = await prisma.botConfiguration.findFirst({
      where: { key: 'melbet_api_config' },
    })

    if (setting) {
      const config = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value
      if (config.hash && config.cashierpass && config.login && config.cashdeskid) {
        return {
          hash: config.hash,
          cashierpass: config.cashierpass,
          login: config.login,
          cashdeskid: String(config.cashdeskid),
        }
      }
    }

    // Fallback на дефолтные значения из casino_api_config.py
    return {
      hash: process.env.MELBET_HASH || 'd34f03473c467b538f685f933b2dc7a3ea8c877901231235693c10be014eb6f4',
      cashierpass: process.env.MELBET_CASHIERPASS || 'd1WRq!ke',
      login: process.env.MELBET_LOGIN || 'uuuadetz',
      cashdeskid: process.env.MELBET_CASHDESKID || '1390018',
    }
  }
  
  // Для Mostbet нужны: api_key, secret, cashpoint_id
  if (normalizedBookmaker.includes('mostbet') || normalizedBookmaker === 'mostbet') {
    // Сначала пробуем получить из БД
    const setting = await prisma.botConfiguration.findFirst({
      where: { key: 'mostbet_api_config' },
    })

    if (setting) {
      const config = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value
      if (config.api_key && config.secret && config.cashpoint_id) {
        return {
          api_key: config.api_key,
          secret: config.secret,
          cashpoint_id: String(config.cashpoint_id),
        }
      }
    }

    // Fallback на дефолтные значения из casino_api_config.py
    return {
      api_key: process.env.MOSTBET_API_KEY || 'api-key:0522f4fb-0a18-4ec2-8e27-428643602db4',
      secret: process.env.MOSTBET_SECRET || '7b6c63ae-2615-4466-a3eb-f5fca2c5c6dc',
      cashpoint_id: process.env.MOSTBET_CASHPOINT_ID || '117753',
    }
  }

  return null
}

// Функция для пополнения баланса через API казино
async function depositToCasino(
  bookmaker: string,
  accountId: string,
  amount: number
): Promise<{ success: boolean; message: string; data?: any }> {
  const normalizedBookmaker = bookmaker?.toLowerCase() || ''

  try {
    // 1xbet и Melbet используют Cashdesk API
    if (normalizedBookmaker.includes('1xbet') || normalizedBookmaker.includes('melbet')) {
      const config = await getCasinoConfig(bookmaker)
      
      if (!config) {
        return {
          success: false,
          message: `${bookmaker} API configuration not found in database`,
        }
      }

      return await depositCashdeskAPI(bookmaker, accountId, amount, config)
    }
    
    // Mostbet использует свой API
    if (normalizedBookmaker.includes('mostbet')) {
      const config = await getCasinoConfig(bookmaker)
      
      if (!config) {
        return {
          success: false,
          message: 'Mostbet API configuration not found in database',
        }
      }

      return await depositMostbetAPI(accountId, amount, config)
    }
    
    // 1win (если нужно будет добавить)
    if (normalizedBookmaker.includes('1win')) {
      return {
        success: false,
        message: '1win API not yet implemented',
      }
    }

    return {
      success: false,
      message: `Unsupported bookmaker: ${bookmaker}`,
    }
  } catch (error: any) {
    console.error('Deposit balance error:', error)
    return {
      success: false,
      message: error.message || 'Failed to deposit balance',
    }
  }
}

// API для пополнения баланса игрока
export async function POST(request: NextRequest) {
  try {
    requireAuth(request)

    const body = await request.json()
    const { requestId, bookmaker, accountId, amount } = body

    if (!requestId || !bookmaker || !accountId || !amount) {
      return NextResponse.json(
        createApiResponse(null, 'Missing required fields: requestId, bookmaker, accountId, amount'),
        { status: 400 }
      )
    }

    // Получаем заявку
    const requestData = await prisma.request.findUnique({
      where: { id: parseInt(requestId) },
    })

    if (!requestData) {
      return NextResponse.json(
        createApiResponse(null, 'Request not found'),
        { status: 404 }
      )
    }

    // ВАЖНО: Используем accountId (ID казино), а не userId (Telegram ID)
    // accountId - это ID игрока в казино (например, ID счета 1xbet, Melbet и т.д.)
    console.log(`[Deposit Balance] Bookmaker: ${bookmaker}, Casino Account ID: ${accountId}, Amount: ${amount}, Request ID: ${requestId}`)
    
    // Пополняем баланс через API казино
    const depositResult = await depositToCasino(bookmaker, accountId, parseFloat(amount))

    if (!depositResult.success) {
      console.error(`[Deposit Balance] Failed for ${bookmaker}, accountId: ${accountId}`, depositResult)
      return NextResponse.json(
        createApiResponse(null, depositResult.message || 'Failed to deposit balance'),
        { status: 500 }
      )
    }
    
    console.log(`[Deposit Balance] Success for ${bookmaker}, accountId: ${accountId}`, depositResult)

    // Обновляем статус заявки на completed
    const updatedRequest = await prisma.request.update({
      where: { id: parseInt(requestId) },
      data: {
        status: 'completed',
        processedAt: new Date(),
      },
    })

    return NextResponse.json(
      createApiResponse({
        success: true,
        message: depositResult.message,
        request: {
          ...updatedRequest,
          amount: updatedRequest.amount ? updatedRequest.amount.toString() : null,
        },
      })
    )
  } catch (error: any) {
    console.error('Deposit balance API error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to deposit balance'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

