/**
 * API клиенты для получения балансов и лимитов платформ
 */

interface CashdeskConfig {
  hash: string
  cashierpass: string
  login: string
  cashdeskid: number
}

interface MostbetConfig {
  api_key: string
  secret: string
  cashpoint_id: number
  x_project?: string
  brand_id?: number
}

interface OneWinConfig {
  api_key: string
}

interface BalanceResult {
  balance: number
  limit: number
}

// Конфигурация для API (из переменных окружения или дефолтные значения)
const CASHDESK_CONFIG: Record<string, CashdeskConfig> = {
  '1xbet': {
    hash: process.env.XBET_HASH || 'f7ff9a23821a0dd19276392f80d43fd2e481986bebb7418fef11e03bba038101',
    cashierpass: process.env.XBET_CASHIERPASS || 'i3EBqvV1hB',
    login: process.env.XBET_LOGIN || 'kurbanaevb',
    cashdeskid: parseInt(process.env.XBET_CASHDESKID || '1343871'),
  },
  melbet: {
    hash: process.env.MELBET_HASH || '5c6459e67bde6c8ace972e2a4d7e1f83d05e2b68c0741474b0fa57e46a19bda1',
    cashierpass: process.env.MELBET_CASHIERPASS || 'ScgOQgUzZs',
    login: process.env.MELBET_LOGIN || 'bakhtark',
    cashdeskid: parseInt(process.env.MELBET_CASHDESKID || '1350588'),
  },
  winwin: {
    hash: process.env.WINWIN_HASH || '4e3ab6e0b47e063017f7e41e3ee5090df5c717c1e908301539cc75199baf7a71',
    cashierpass: process.env.WINWIN_CASHIERPASS || '5JGENBWTuh',
    login: process.env.WINWIN_LOGIN || 'kurbanaevbakh',
    cashdeskid: parseInt(process.env.WINWIN_CASHDESKID || '1392184'),
  },
  '888starz': {
    hash: process.env.STARZ_HASH || process.env.STARZ888_HASH || '6bb5fbcbc5784359ccbf490167d9b3a82ea6dc3eac22e0d7cc083c2e71b10da0',
    cashierpass: process.env.STARZ_CASHIERPASS || process.env.STARZ888_CASHIERPASS || '8688726678',
    login: process.env.STARZ_LOGIN || process.env.STARZ888_LOGIN || 'kurbanaevba',
    cashdeskid: parseInt(process.env.STARZ_CASHDESKID || process.env.STARZ888_CASHDESKID || '1376440'),
  },
  '1xcasino': {
    hash: process.env.ONEXCASINO_HASH || process.env.XCASINO_HASH || 'ea6a5d009551cbadaf583b4b158341df4a770c4f2fbc8a1eceb0817ca814a588',
    cashierpass: process.env.ONEXCASINO_CASHIERPASS || process.env.XCASINO_CASHIERPASS || '1eezPvxmJO',
    login: process.env.ONEXCASINO_LOGIN || process.env.XCASINO_LOGIN || 'kurbanaevbak',
    cashdeskid: parseInt(process.env.ONEXCASINO_CASHDESKID || process.env.XCASINO_CASHDESKID || '1383980'),
  },
  betwinner: {
    hash: process.env.BETWINNER_HASH || 'b2b5dcc4fd7c2dd559bd3c465ee9202f157e0697ed016dbd7db0121ebfec7ff2',
    cashierpass: process.env.BETWINNER_CASHIERPASS || '2768772981',
    login: process.env.BETWINNER_LOGIN || 'kurbanaevba1',
    cashdeskid: parseInt(process.env.BETWINNER_CASHDESKID || '1392478'),
  },
  wowbet: {
    hash: process.env.WOWBET_HASH || '62a28327ed306a7a5b12c92f22c5ed10b88ff6ef94787b3890e2b4c77ac16b74',
    cashierpass: process.env.WOWBET_CASHIERPASS || 'yRxTshBn',
    login: process.env.WOWBET_LOGIN || 'bakhtarku',
    cashdeskid: parseInt(process.env.WOWBET_CASHDESKID || '1425058'),
  },
}

const MOSTBET_CONFIG: MostbetConfig = {
  api_key: process.env.MOSTBET_API_KEY || 'api-key:3d83ac24-7fd2-498d-84b4-f2a7e80401fb',
  secret: process.env.MOSTBET_SECRET || 'baa104d1-73a6-4914-866a-ddbbe0aae11a',
  cashpoint_id: parseInt(process.env.MOSTBET_CASHPOINT_ID || '48436'),
  x_project: process.env.MOSTBET_X_PROJECT || 'MBC',
  brand_id: parseInt(process.env.MOSTBET_BRAND_ID || '1'),
}

const ONEWIN_CONFIG: OneWinConfig = {
  api_key: process.env.ONEWIN_API_KEY || process.env.ONE_WIN_API_KEY || '0ad11eda9f40c2e05c34dc81c24ebe7f53eabe606c6cc5e553cfe66cd7fa9c8e',
}

/**
 * Получение баланса и лимита через Cashdesk API (1xbet, Melbet, Winwin, 888starz, 1xcasino, betwinner)
 */
async function getCashdeskBalance(
  casino: '1xbet' | 'melbet' | 'winwin' | '888starz' | '1xcasino' | 'betwinner' | 'wowbet',
  cfg: CashdeskConfig
): Promise<BalanceResult> {
  try {
    const crypto = require('crypto')
    
    // Формируем дату в UTC в формате 'YYYY.MM.DD HH:MM:SS'
    const now = new Date()
    const year = now.getUTCFullYear()
    const month = String(now.getUTCMonth() + 1).padStart(2, '0')
    const day = String(now.getUTCDate()).padStart(2, '0')
    const hours = String(now.getUTCHours()).padStart(2, '0')
    const minutes = String(now.getUTCMinutes()).padStart(2, '0')
    const seconds = String(now.getUTCSeconds()).padStart(2, '0')
    const formattedDt = `${year}.${month}.${day} ${hours}:${minutes}:${seconds}`

    // confirm = MD5(cashdeskid:hash)
    const confirmStr = `${cfg.cashdeskid}:${cfg.hash}`
    const confirm = crypto.createHash('md5').update(confirmStr).digest('hex')

    // Подпись для баланса:
    // a. SHA256(hash={hash}&cashierpass={cashierpass}&dt={dt})
    const step1 = `hash=${cfg.hash}&cashierpass=${cfg.cashierpass}&dt=${formattedDt}`
    const sha1 = crypto.createHash('sha256').update(step1).digest('hex')

    // b. MD5(dt={dt}&cashierpass={cashierpass}&cashdeskid={cashdeskid})
    const step2 = `dt=${formattedDt}&cashierpass=${cfg.cashierpass}&cashdeskid=${cfg.cashdeskid}`
    const md5Hash = crypto.createHash('md5').update(step2).digest('hex')

    // c. SHA256(результаты a и b объединены)
    const combined = sha1 + md5Hash
    const sign = crypto.createHash('sha256').update(combined).digest('hex')

    const url = `https://partners.servcul.com/CashdeskBotAPI/Cashdesk/${cfg.cashdeskid}/Balance?confirm=${confirm}&dt=${formattedDt}`
    const headers = { sign }

    const response = await fetch(url, { headers, method: 'GET' })

    if (response.ok) {
      const data = await response.json()
      if (data && typeof data.Balance !== 'undefined') {
        return {
          balance: parseFloat(data.Balance) || 0,
          limit: parseFloat(data.Limit) || 0,
        }
      }
    }
  } catch (error) {
    console.error(`Error getting ${casino} balance:`, error)
  }

  return { balance: 0, limit: 0 }
}

/**
 * Получение баланса через Mostbet/MBCash API
 */
async function getMostbetBalance(cfg: MostbetConfig): Promise<BalanceResult> {
  try {
    const crypto = require('crypto')

    // Получаем timestamp в формате 'YYYY-MM-DD HH:MM:SS'
    const now = new Date()
    const year = now.getUTCFullYear()
    const month = String(now.getUTCMonth() + 1).padStart(2, '0')
    const day = String(now.getUTCDate()).padStart(2, '0')
    const hours = String(now.getUTCHours()).padStart(2, '0')
    const minutes = String(now.getUTCMinutes()).padStart(2, '0')
    const seconds = String(now.getUTCSeconds()).padStart(2, '0')
    const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`

    const path = `/mbc/gateway/v1/api/cashpoint/${cfg.cashpoint_id}/balance`
    const url = `https://apimb.com${path}`

    // API key может быть с префиксом или без
    const apiKeyFormatted = cfg.api_key.startsWith('api-key:') 
      ? cfg.api_key
      : `api-key:${cfg.api_key}`

    // Подпись: HMAC SHA3-256 от <API_KEY><PATH><REQUEST_BODY><TIMESTAMP>
    // Для GET запроса REQUEST_BODY пустой
    const signString = `${apiKeyFormatted}${path}${timestamp}`
    
    // Пытаемся использовать SHA3-256, если не поддерживается - используем SHA256
    let signature: string
    try {
      signature = crypto
        .createHmac('sha3-256', cfg.secret)
        .update(signString)
        .digest('hex')
    } catch (e) {
      // Fallback на SHA256
      signature = crypto
        .createHmac('sha256', cfg.secret)
        .update(signString)
        .digest('hex')
    }

    const headers = {
      'X-Api-Key': apiKeyFormatted,
      'X-Timestamp': timestamp,
      'X-Signature': signature,
      'Content-Type': 'application/json',
      'Accept': '*/*',
    }

    console.log(`[Mostbet Balance] URL: ${url}`)
    console.log(`[Mostbet Balance] Headers:`, {
      'X-Api-Key': apiKeyFormatted.substring(0, 20) + '...',
      'X-Timestamp': timestamp,
      'X-Signature': signature.substring(0, 20) + '...',
    })
    console.log(`[Mostbet Balance] Signature string:`, signString.substring(0, 100) + '...')

    const response = await fetch(url, { headers, method: 'GET' })

    console.log(`[Mostbet Balance] Response status: ${response.status}`)

    if (response.ok) {
      const data = await response.json()
      console.log(`[Mostbet Balance] Response data:`, data)
      if (data && typeof data.balance !== 'undefined') {
        const balance = parseFloat(String(data.balance)) || 0
        const limit = balance // Лимит равен балансу
        console.log(`[Mostbet Balance] Parsed balance: ${balance}, limit: ${limit}`)
        return {
          balance: balance,
          limit: limit,
        }
      } else {
        console.warn(`[Mostbet Balance] Response missing balance field:`, data)
      }
    } else {
      const errorText = await response.text()
      console.error(`[Mostbet Balance] Error response (${response.status}):`, errorText)
    }
  } catch (error) {
    console.error('Error getting Mostbet balance:', error)
  }

  return { balance: 0, limit: 0 }
}

/**
 * Получение баланса через 1win API (через попытку пополнения)
 */
async function get1winBalance(cfg: OneWinConfig): Promise<BalanceResult> {
  try {
    // Используем функцию из casino-deposit.ts
    const { get1winBalance: get1winBalanceFunc } = await import('./casino-deposit')
    // Используем тестовый userId (любой, так как мы просто проверяем баланс кассы)
    // userId нужен для запроса, но баланс кассы не зависит от конкретного пользователя
    const testUserId = '1'
    return await get1winBalanceFunc(testUserId, { api_key: cfg.api_key })
  } catch (error) {
    console.error('Error getting 1win balance:', error)
    return { balance: 0, limit: 0 }
  }
}

/**
 * Получение лимитов всех платформ
 */
export async function getPlatformLimits(): Promise<
  Array<{ key: string; name: string; limit: number }>
> {
  const limits: Array<{ key: string; name: string; limit: number }> = []

  try {
    // 1xbet
    const xbetCfg = CASHDESK_CONFIG['1xbet']
    if (xbetCfg.cashdeskid > 0) {
      const xbetBal = await getCashdeskBalance('1xbet', xbetCfg)
      limits.push({ key: '1xbet', name: '1xbet', limit: xbetBal.limit })
    } else {
      limits.push({ key: '1xbet', name: '1xbet', limit: 0 })
    }

    // Melbet
    const melbetCfg = CASHDESK_CONFIG.melbet
    if (melbetCfg.cashdeskid > 0) {
      const melbetBal = await getCashdeskBalance('melbet', melbetCfg)
      limits.push({ key: 'melbet', name: 'Melbet', limit: melbetBal.limit })
    } else {
      limits.push({ key: 'melbet', name: 'Melbet', limit: 0 })
    }

    // 1WIN
    const onewinCfg = ONEWIN_CONFIG
    if (onewinCfg.api_key) {
      const onewinBal = await get1winBalance(onewinCfg)
      limits.push({ key: '1win', name: '1WIN', limit: onewinBal.limit })
    } else {
      limits.push({ key: '1win', name: '1WIN', limit: 0 })
    }

    // Mostbet - загружаем конфигурацию из БД
    try {
      const { getCasinoConfig } = await import('./casino-config')
      const mostbetConfigFromDB = await getCasinoConfig('mostbet')
      
      if (mostbetConfigFromDB && mostbetConfigFromDB.api_key && mostbetConfigFromDB.secret && mostbetConfigFromDB.cashpoint_id) {
        const mostbetCfg: MostbetConfig = {
          api_key: mostbetConfigFromDB.api_key,
          secret: mostbetConfigFromDB.secret,
          cashpoint_id: parseInt(String(mostbetConfigFromDB.cashpoint_id)),
          x_project: mostbetConfigFromDB.x_project || 'MBC',
          brand_id: mostbetConfigFromDB.brand_id || 1,
        }
        const mostbetBal = await getMostbetBalance(mostbetCfg)
        console.log(`[Mostbet Limits] Balance: ${mostbetBal.balance}, Limit: ${mostbetBal.limit}`)
        limits.push({ key: 'mostbet', name: 'Mostbet', limit: mostbetBal.limit })
      } else {
        // Fallback на переменные окружения
        const mostbetCfg = MOSTBET_CONFIG
        if (mostbetCfg.cashpoint_id > 0) {
          const mostbetBal = await getMostbetBalance(mostbetCfg)
          limits.push({ key: 'mostbet', name: 'Mostbet', limit: mostbetBal.limit })
        } else {
          limits.push({ key: 'mostbet', name: 'Mostbet', limit: 0 })
        }
      }
    } catch (error) {
      console.error('Error loading Mostbet config for limits:', error)
      limits.push({ key: 'mostbet', name: 'Mostbet', limit: 0 })
    }

    // Winwin
    const winwinCfg = CASHDESK_CONFIG.winwin
    if (winwinCfg.cashdeskid > 0) {
      const winwinBal = await getCashdeskBalance('winwin', winwinCfg)
      limits.push({ key: 'winwin', name: 'Winwin', limit: winwinBal.limit })
    } else {
      limits.push({ key: 'winwin', name: 'Winwin', limit: 0 })
    }

    // 888starz
    const starzCfg = CASHDESK_CONFIG['888starz']
    if (starzCfg.cashdeskid > 0) {
      const starzBal = await getCashdeskBalance('888starz', starzCfg)
      limits.push({ key: '888starz', name: '888starz', limit: starzBal.limit })
    } else {
      limits.push({ key: '888starz', name: '888starz', limit: 0 })
    }

    // 1xCasino
    const xcasinoCfg = CASHDESK_CONFIG['1xcasino']
    if (xcasinoCfg.cashdeskid > 0) {
      const xcasinoBal = await getCashdeskBalance('1xcasino', xcasinoCfg)
      limits.push({ key: '1xcasino', name: '1xCasino', limit: xcasinoBal.limit })
    } else {
      limits.push({ key: '1xcasino', name: '1xCasino', limit: 0 })
    }

    // BetWinner
    const betwinnerCfg = CASHDESK_CONFIG['betwinner']
    if (betwinnerCfg.cashdeskid > 0) {
      const betwinnerBal = await getCashdeskBalance('betwinner', betwinnerCfg)
      limits.push({ key: 'betwinner', name: 'BetWinner', limit: betwinnerBal.limit })
    } else {
      limits.push({ key: 'betwinner', name: 'BetWinner', limit: 0 })
    }
    
    // WowBet
    const wowbetCfg = CASHDESK_CONFIG['wowbet']
    if (wowbetCfg.cashdeskid > 0) {
      const wowbetBal = await getCashdeskBalance('wowbet', wowbetCfg)
      limits.push({ key: 'wowbet', name: 'WowBet', limit: wowbetBal.limit })
    } else {
      limits.push({ key: 'wowbet', name: 'WowBet', limit: 0 })
    }
  } catch (error) {
    console.error('Error getting platform limits:', error)
    // Возвращаем нули если ошибка
    return [
      { key: '1xbet', name: '1xbet', limit: 0 },
      { key: 'melbet', name: 'Melbet', limit: 0 },
      { key: '1win', name: '1WIN', limit: 0 },
      { key: 'mostbet', name: 'Mostbet', limit: 0 },
      { key: 'winwin', name: 'Winwin', limit: 0 },
      { key: '888starz', name: '888starz', limit: 0 },
      { key: '1xcasino', name: '1xCasino', limit: 0 },
      { key: 'betwinner', name: 'BetWinner', limit: 0 },
      { key: 'betwinner', name: 'BetWinner', limit: 0 },
      { key: 'wowbet', name: 'WowBet', limit: 0 },
    ]
  }

  return limits
}




