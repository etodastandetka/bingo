import { prisma } from './prisma'
import { depositCashdeskAPI, depositMostbetAPI } from './casino-deposit'

// Функция для получения конфигурации API казино из настроек
export async function getCasinoConfig(bookmaker: string) {
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
      hash: process.env.XBET_HASH || 'f7ff9a23821a0dd19276392f80d43fd2e481986bebb7418fef11e03bba038101',
      cashierpass: process.env.XBET_CASHIERPASS || 'i3EBqvV1hB',
      login: process.env.XBET_LOGIN || 'kurbanaevb',
      cashdeskid: process.env.XBET_CASHDESKID || '1343871',
    }
  }
  
  if (normalizedBookmaker.includes('melbet') || normalizedBookmaker === 'melbet') {
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

    return {
      hash: process.env.MELBET_HASH || '5c6459e67bde6c8ace972e2a4d7e1f83d05e2b68c0741474b0fa57e46a19bda1',
      cashierpass: process.env.MELBET_CASHIERPASS || 'ScgOQgUzZs',
      login: process.env.MELBET_LOGIN || 'bakhtark',
      cashdeskid: process.env.MELBET_CASHDESKID || '1350588',
    }
  }
  
  // Mostbet нужны: api_key, secret, cashpoint_id
  if (normalizedBookmaker.includes('mostbet') || normalizedBookmaker === 'mostbet') {
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

    return {
      api_key: process.env.MOSTBET_API_KEY || 'api-key:0522f4fb-0a18-4ec2-8e27-428643602db4',
      secret: process.env.MOSTBET_SECRET || 'Eldiyar.07',
      cashpoint_id: process.env.MOSTBET_CASHPOINT_ID || 'C92905',
    }
  }

  return null
}

// Функция для пополнения баланса через API казино
export async function depositToCasino(
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

