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
        const balance = parseFloat(data.Balance) || 0
        const limit = parseFloat(data.Limit) || balance // Если лимит не указан, используем баланс
        return {
          balance,
          limit,
        }
      } else {
        console.error(`[${casino}] Invalid response data:`, data)
      }
    } else {
      const errorText = await response.text().catch(() => '')
      console.error(`[${casino}] API error (${response.status}):`, errorText)
    }
  } catch (error) {
    console.error(`[${casino}] Error getting balance:`, error)
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

    const response = await fetch(url, { headers, method: 'GET' })

    if (response.ok) {
      const data = await response.json()
      if (data && typeof data.balance !== 'undefined') {
        return {
          balance: parseFloat(data.balance) || 0,
          limit: parseFloat(data.balance) || 0, // Лимит равен балансу
        }
      }
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
  const { getCasinoConfig } = await import('./casino-config')

  // Вспомогательная функция для безопасного получения баланса
  const getBalanceSafe = async (
    fn: () => Promise<BalanceResult>,
    platformName: string,
    defaultLimit: number = 0
  ): Promise<number> => {
    try {
      const result = await fn()
      console.log(`[Platform Limits] ${platformName}: balance=${result.balance}, limit=${result.limit}`)
      return result.limit
    } catch (error) {
      console.error(`[Platform Limits] Error getting ${platformName} balance:`, error)
      return defaultLimit
    }
  }

  // 1xbet
  try {
    const dbConfig = await getCasinoConfig('1xbet')
    if (dbConfig && 'cashdeskid' in dbConfig && parseInt(dbConfig.cashdeskid) > 0) {
      const xbetCfg = {
        hash: dbConfig.hash,
        cashierpass: dbConfig.cashierpass,
        login: dbConfig.login,
        cashdeskid: parseInt(dbConfig.cashdeskid),
      }
      const limit = await getBalanceSafe(() => getCashdeskBalance('1xbet', xbetCfg), '1xbet')
      limits.push({ key: '1xbet', name: '1xbet', limit })
    } else {
      limits.push({ key: '1xbet', name: '1xbet', limit: 0 })
    }
  } catch (error) {
    limits.push({ key: '1xbet', name: '1xbet', limit: 0 })
  }

  // Melbet
  try {
    const dbConfig = await getCasinoConfig('melbet')
    if (dbConfig && 'cashdeskid' in dbConfig && parseInt(dbConfig.cashdeskid) > 0) {
      const melbetCfg = {
        hash: dbConfig.hash,
        cashierpass: dbConfig.cashierpass,
        login: dbConfig.login,
        cashdeskid: parseInt(dbConfig.cashdeskid),
      }
      const limit = await getBalanceSafe(() => getCashdeskBalance('melbet', melbetCfg), 'Melbet')
      limits.push({ key: 'melbet', name: 'Melbet', limit })
    } else {
      limits.push({ key: 'melbet', name: 'Melbet', limit: 0 })
    }
  } catch (error) {
    limits.push({ key: 'melbet', name: 'Melbet', limit: 0 })
  }

  // 1WIN
  try {
    const dbConfig = await getCasinoConfig('1win')
    if (dbConfig && 'api_key' in dbConfig && dbConfig.api_key) {
      const onewinCfg = { api_key: dbConfig.api_key }
      const limit = await getBalanceSafe(() => get1winBalance(onewinCfg), '1WIN')
      limits.push({ key: '1win', name: '1WIN', limit })
    } else {
      limits.push({ key: '1win', name: '1WIN', limit: 0 })
    }
  } catch (error) {
    limits.push({ key: '1win', name: '1WIN', limit: 0 })
  }

  // Mostbet
  try {
    const dbConfig = await getCasinoConfig('mostbet')
    if (dbConfig && 'cashpoint_id' in dbConfig && parseInt(dbConfig.cashpoint_id) > 0) {
      const mostbetCfg = {
        api_key: dbConfig.api_key,
        secret: dbConfig.secret,
        cashpoint_id: parseInt(dbConfig.cashpoint_id),
        x_project: dbConfig.x_project || 'MBC',
        brand_id: dbConfig.brand_id || 1,
      }
      const limit = await getBalanceSafe(() => getMostbetBalance(mostbetCfg), 'Mostbet')
      limits.push({ key: 'mostbet', name: 'Mostbet', limit })
    } else {
      limits.push({ key: 'mostbet', name: 'Mostbet', limit: 0 })
    }
  } catch (error) {
    limits.push({ key: 'mostbet', name: 'Mostbet', limit: 0 })
  }

  // Winwin
  try {
    const dbConfig = await getCasinoConfig('winwin')
    if (dbConfig && 'cashdeskid' in dbConfig && parseInt(dbConfig.cashdeskid) > 0) {
      const winwinCfg = {
        hash: dbConfig.hash,
        cashierpass: dbConfig.cashierpass,
        login: dbConfig.login,
        cashdeskid: parseInt(dbConfig.cashdeskid),
      }
      const limit = await getBalanceSafe(() => getCashdeskBalance('winwin', winwinCfg), 'Winwin')
      limits.push({ key: 'winwin', name: 'Winwin', limit })
    } else {
      limits.push({ key: 'winwin', name: 'Winwin', limit: 0 })
    }
  } catch (error) {
    limits.push({ key: 'winwin', name: 'Winwin', limit: 0 })
  }

  // 888starz
  try {
    const dbConfig = await getCasinoConfig('888starz')
    if (dbConfig && 'cashdeskid' in dbConfig && parseInt(dbConfig.cashdeskid) > 0) {
      const starzCfg = {
        hash: dbConfig.hash,
        cashierpass: dbConfig.cashierpass,
        login: dbConfig.login,
        cashdeskid: parseInt(dbConfig.cashdeskid),
      }
      const limit = await getBalanceSafe(() => getCashdeskBalance('888starz', starzCfg), '888starz')
      limits.push({ key: '888starz', name: '888starz', limit })
    } else {
      limits.push({ key: '888starz', name: '888starz', limit: 0 })
    }
  } catch (error) {
    limits.push({ key: '888starz', name: '888starz', limit: 0 })
  }

  // 1xCasino
  try {
    const dbConfig = await getCasinoConfig('1xcasino')
    if (dbConfig && 'cashdeskid' in dbConfig && parseInt(dbConfig.cashdeskid) > 0) {
      const xcasinoCfg = {
        hash: dbConfig.hash,
        cashierpass: dbConfig.cashierpass,
        login: dbConfig.login,
        cashdeskid: parseInt(dbConfig.cashdeskid),
      }
      const limit = await getBalanceSafe(() => getCashdeskBalance('1xcasino', xcasinoCfg), '1xCasino')
      limits.push({ key: '1xcasino', name: '1xCasino', limit })
    } else {
      limits.push({ key: '1xcasino', name: '1xCasino', limit: 0 })
    }
  } catch (error) {
    limits.push({ key: '1xcasino', name: '1xCasino', limit: 0 })
  }

  // BetWinner
  try {
    const dbConfig = await getCasinoConfig('betwinner')
    if (dbConfig && 'cashdeskid' in dbConfig && parseInt(dbConfig.cashdeskid) > 0) {
      const betwinnerCfg = {
        hash: dbConfig.hash,
        cashierpass: dbConfig.cashierpass,
        login: dbConfig.login,
        cashdeskid: parseInt(dbConfig.cashdeskid),
      }
      const limit = await getBalanceSafe(() => getCashdeskBalance('betwinner', betwinnerCfg), 'BetWinner')
      limits.push({ key: 'betwinner', name: 'BetWinner', limit })
    } else {
      limits.push({ key: 'betwinner', name: 'BetWinner', limit: 0 })
    }
  } catch (error) {
    limits.push({ key: 'betwinner', name: 'BetWinner', limit: 0 })
  }
  
  // WowBet
  try {
    const dbConfig = await getCasinoConfig('wowbet')
    if (dbConfig && 'cashdeskid' in dbConfig && parseInt(dbConfig.cashdeskid) > 0) {
      const wowbetCfg = {
        hash: dbConfig.hash,
        cashierpass: dbConfig.cashierpass,
        login: dbConfig.login,
        cashdeskid: parseInt(dbConfig.cashdeskid),
      }
      const limit = await getBalanceSafe(() => getCashdeskBalance('wowbet', wowbetCfg), 'WowBet')
      limits.push({ key: 'wowbet', name: 'WowBet', limit })
    } else {
      limits.push({ key: 'wowbet', name: 'WowBet', limit: 0 })
    }
  } catch (error) {
    limits.push({ key: 'wowbet', name: 'WowBet', limit: 0 })
  }

  console.log(`[Platform Limits] Total platforms: ${limits.length}, limits:`, limits.map(p => `${p.name}=${p.limit}`).join(', '))
  return limits
}




