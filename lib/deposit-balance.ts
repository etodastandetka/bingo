/**
 * Функция для пополнения баланса игрока через API казино
 */

import { prisma } from './prisma'
import { depositCashdeskAPI, depositMostbetAPI } from './casino-deposit'

interface DepositResult {
  success: boolean
  message: string
  data?: any
}

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

    // Fallback на дефолтные значения
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

    // Fallback на дефолтные значения
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

    // Fallback на дефолтные значения
    return {
      api_key: process.env.MOSTBET_API_KEY || 'api-key:0522f4fb-0a18-4ec2-8e27-428643602db4',
      secret: process.env.MOSTBET_SECRET || '7b6c63ae-2615-4466-a3eb-f5fca2c5c6dc',
      cashpoint_id: process.env.MOSTBET_CASHPOINT_ID || '117753',
    }
  }

  return null
}

// Функция для пополнения баланса через API казино
export async function depositToCasino(
  bookmaker: string,
  accountId: string,
  amount: number
): Promise<DepositResult> {
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

