import crypto from 'crypto'

// Конфигурация API казино
export interface CasinoConfig {
  hash?: string
  cashierpass?: string
  login?: string
  cashdeskid?: string | number
  api_key?: string
  secret?: string
  cashpoint_id?: string | number
  x_project?: string // Для MBCash (MBC или INDEP)
  brand_id?: number // Для MBCash (1=Mostbet, 2=BetAndreas, 3=Vivi, 4=Banzai)
}

// Генерация confirm для 1xbet/Melbet
export function generateConfirm(userId: string, hash: string, isMelbet: boolean = false): string {
  const userIdForConfirm = isMelbet ? userId.toLowerCase() : userId
  const confirmString = `${userIdForConfirm}:${hash}`
  return crypto.createHash('md5').update(confirmString).digest('hex')
}

// Генерация подписи для пополнения 1xbet и других Cashdesk казино
export function generateSignForDeposit1xbet(
  userId: string,
  amount: number,
  hash: string,
  cashierpass: string,
  cashdeskid: string | number
): string {
  // Согласно документации API пункт 3.5 (пример):
  // a) SHA256(hash={hash}&lng=ru&userid={userId})
  // В примере используется userid с маленькой буквы (пункт 3.5), это правильная форма
  const step1String = `hash=${hash}&lng=ru&userid=${userId}`
  const step1Hash = crypto.createHash('sha256').update(step1String).digest('hex')

  // b) MD5(summa={amount}&cashierpass={cashierpass}&cashdeskid={cashdeskid})
  const step2String = `summa=${amount}&cashierpass=${cashierpass}&cashdeskid=${cashdeskid}`
  const step2Hash = crypto.createHash('md5').update(step2String).digest('hex')

  // c) SHA256(step1 + step2) - объединяем результаты шагов 1 и 2
  const combined = step1Hash + step2Hash
  return crypto.createHash('sha256').update(combined).digest('hex')
}

// Генерация подписи для пополнения Melbet (userid в lower-case)
export function generateSignForDepositMelbet(
  userId: string,
  amount: number,
  hash: string,
  cashierpass: string,
  cashdeskid: string | number
): string {
  // a) SHA256(hash={hash}&lng=ru&userid={userId.lower()})
  // Для Melbet используется userId в нижнем регистре, параметр userid с маленькой буквы
  const step1String = `hash=${hash}&lng=ru&userid=${userId.toLowerCase()}`
  const step1Hash = crypto.createHash('sha256').update(step1String).digest('hex')

  // b) MD5(summa={amount}&cashierpass={cashierpass}&cashdeskid={cashdeskid})
  const step2String = `summa=${amount}&cashierpass=${cashierpass}&cashdeskid=${cashdeskid}`
  const step2Hash = crypto.createHash('md5').update(step2String).digest('hex')

  // c) SHA256(step1 + step2)
  const combined = step1Hash + step2Hash
  return crypto.createHash('sha256').update(combined).digest('hex')
}

// Генерация подписи для вывода 1xbet
export function generateSignForPayout1xbet(
  userId: string,
  code: string,
  hash: string,
  cashierpass: string,
  cashdeskid: string | number
): string {
  // a) SHA256(hash={hash}&lng={lng}&userid={userId})
  // Согласно документации пункт 4.1 и логике пополнения (пункт 3.5) используем userid с маленькой буквы
  const step1String = `hash=${hash}&lng=ru&userid=${userId}`
  const step1Hash = crypto.createHash('sha256').update(step1String).digest('hex')

  // b) MD5(code={code}&cashierpass={cashierpass}&cashdeskid={cashdeskid})
  const step2String = `code=${code}&cashierpass=${cashierpass}&cashdeskid=${cashdeskid}`
  const step2Hash = crypto.createHash('md5').update(step2String).digest('hex')

  // c) SHA256(step1 + step2)
  const combined = step1Hash + step2Hash
  return crypto.createHash('sha256').update(combined).digest('hex')
}

// Генерация подписи для вывода Melbet (userid в lower-case)
export function generateSignForPayoutMelbet(
  userId: string,
  code: string,
  hash: string,
  cashierpass: string,
  cashdeskid: string | number
): string {
  // a) SHA256(hash={hash}&lng=ru&userid={user_id.lower()})
  const step1String = `hash=${hash}&lng=ru&userid=${userId.toLowerCase()}`
  const step1Hash = crypto.createHash('sha256').update(step1String).digest('hex')

  // b) MD5(code={code}&cashierpass={cashierpass}&cashdeskid={cashdeskid})
  const step2String = `code=${code}&cashierpass=${cashierpass}&cashdeskid=${cashdeskid}`
  const step2Hash = crypto.createHash('md5').update(step2String).digest('hex')

  // c) SHA256(step1 + step2)
  const combined = step1Hash + step2Hash
  return crypto.createHash('sha256').update(combined).digest('hex')
}

// Генерация Basic Auth header
export function generateBasicAuth(login: string, cashierpass: string): string {
  const authString = `${login}:${cashierpass}`
  const authBase64 = Buffer.from(authString).toString('base64')
  return `Basic ${authBase64}`
}

// Пополнение для 1xbet/Melbet/Winwin через Cashdesk API
export async function depositCashdeskAPI(
  bookmaker: string,
  userId: string,
  amount: number,
  config: CasinoConfig
): Promise<{ success: boolean; message: string; data?: any }> {
  const baseUrl = 'https://partners.servcul.com/CashdeskBotAPI/'
  const isMelbet = bookmaker.toLowerCase().includes('melbet')
  // Winwin использует ту же логику что и 1xbet (не нужно toLowerCase для userId)

  // Проверяем, что все обязательные поля заполнены и не пустые
  const hash = config.hash
  const cashierpass = config.cashierpass
  const login = config.login
  const cashdeskid = config.cashdeskid

  if (!hash || !cashierpass || !login || !cashdeskid || 
      hash.trim() === '' || cashierpass.trim() === '' || 
      login.trim() === '' || String(cashdeskid).trim() === '' || String(cashdeskid).trim() === '0') {
    return {
      success: false,
      message: `Missing required API credentials for ${bookmaker}. Please configure API settings in database or environment variables.`,
    }
  }

  try {
    // userId здесь - это ID казино (accountId), не Telegram ID
    console.log(`[Cashdesk Deposit] Bookmaker: ${bookmaker}, Casino User ID: ${userId}, Amount: ${amount}`)
    console.log(`[Cashdesk Deposit] Config - hash: ${hash?.substring(0, 10)}..., cashdeskid: ${cashdeskid}, login: ${login}`)
    
    const confirm = generateConfirm(userId, hash, isMelbet)
    const sign = isMelbet
      ? generateSignForDepositMelbet(userId, amount, hash, cashierpass, cashdeskid)
      : generateSignForDeposit1xbet(userId, amount, hash, cashierpass, cashdeskid)
    
    // Дополнительное логирование для отладки подписи
    if (isMelbet) {
      const step1String = `hash=${hash}&lng=ru&userid=${userId.toLowerCase()}`
      const step2String = `summa=${amount}&cashierpass=${cashierpass}&cashdeskid=${cashdeskid}`
      console.log(`[Cashdesk Deposit] Melbet signature steps:`)
      console.log(`  Step1 string: ${step1String}`)
      console.log(`  Step2 string: ${step2String}`)
    } else {
      const step1String = `hash=${hash}&lng=ru&userid=${userId}`
      const step2String = `summa=${amount}&cashierpass=${cashierpass}&cashdeskid=${cashdeskid}`
      console.log(`[Cashdesk Deposit] ${bookmaker} signature steps:`)
      console.log(`  Step1 string: ${step1String}`)
      console.log(`  Step2 string: ${step2String}`)
    }

    const url = `${baseUrl}Deposit/${userId}/Add`
    const authHeader = generateBasicAuth(login, cashierpass)

    // cashdeskId должен быть числом согласно документации
    const cashdeskIdNum = typeof cashdeskid === 'string' ? parseInt(cashdeskid, 10) : Number(cashdeskid)
    
    const requestBody = {
      cashdeskId: cashdeskIdNum,
      lng: 'ru',
      summa: amount,
      confirm: confirm,
    }

    console.log(`[Cashdesk Deposit] URL: ${url}`)
    console.log(`[Cashdesk Deposit] Sign: ${sign}`)
    console.log(`[Cashdesk Deposit] Confirm: ${confirm}`)
    console.log(`[Cashdesk Deposit] Request body:`, JSON.stringify(requestBody, null, 2))

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'sign': sign,
      },
      body: JSON.stringify(requestBody),
    })

    const responseText = await response.text()
    let data: any
    try {
      data = JSON.parse(responseText)
    } catch (e) {
      console.error(`[Cashdesk Deposit] Failed to parse response: ${responseText}`)
      return {
        success: false,
        message: `Invalid response from ${bookmaker} API: ${responseText.substring(0, 100)}`,
        data: { rawResponse: responseText, status: response.status },
      }
    }

    console.log(`[Cashdesk Deposit] Response status: ${response.status}, Data:`, data)
    
    // Логируем детали при ошибке 401
    if (response.status === 401) {
      console.error(`[Cashdesk Deposit] 401 Unauthorized - Check signature generation`)
      console.error(`[Cashdesk Deposit] Request details:`, {
        url,
        headers: {
          'Authorization': authHeader.substring(0, 20) + '...',
          'sign': sign,
        },
        body: requestBody,
      })
    }

    // API может возвращать success (маленькая) или Success (большая буква)
    const isSuccess = response.ok && (data.success === true || data.Success === true)

    if (isSuccess) {
      return {
        success: true,
        message: 'Balance deposited successfully',
        data,
      }
    }

    return {
      success: false,
      message: data.message || data.Message || data.error || data.Error || `Failed to deposit balance (Status: ${response.status})`,
      data,
    }
  } catch (error: any) {
    console.error(`[Cashdesk Deposit] Error for ${bookmaker}, userId: ${userId}:`, error)
    return {
      success: false,
      message: error.message || 'Failed to deposit balance',
    }
  }
}

// Пополнение для Mostbet
export async function depositMostbetAPI(
  userId: string,
  amount: number,
  config: CasinoConfig
): Promise<{ success: boolean; message: string; data?: any }> {
  const baseUrl = 'https://apimb.com'

  // Проверяем, что все обязательные поля заполнены и не пустые
  const apiKey = config.api_key
  const secret = config.secret
  const cashpointId = config.cashpoint_id

  if (!apiKey || !secret || !cashpointId ||
      apiKey.trim() === '' || secret.trim() === '' || 
      String(cashpointId).trim() === '' || String(cashpointId).trim() === '0') {
    return {
      success: false,
      message: 'Missing required Mostbet API credentials. Please configure API settings in database or environment variables.',
    }
  }

  try {
    // userId здесь - это ID казино (accountId), не Telegram ID
    console.log(`[Mostbet Deposit] Casino Player ID: ${userId}, Amount: ${amount}`)
    
    // Получаем timestamp в формате YYYY-MM-DD HH:MM:SS в UTC+0 (как требует документация)
    const now = new Date()
    const year = now.getUTCFullYear()
    const month = String(now.getUTCMonth() + 1).padStart(2, '0')
    const day = String(now.getUTCDate()).padStart(2, '0')
    const hours = String(now.getUTCHours()).padStart(2, '0')
    const minutes = String(now.getUTCMinutes()).padStart(2, '0')
    const seconds = String(now.getUTCSeconds()).padStart(2, '0')
    const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`

    // Формируем путь и тело запроса
    const cashpointIdStr = String(cashpointId)
    const path = `/mbc/gateway/v1/api/cashpoint/${cashpointIdStr}/player/deposit`
    const requestBodyData = {
      brandId: config.brand_id || 1, // По умолчанию Mostbet
      playerId: String(userId), // ID игрока в казино
      amount: amount,
      currency: 'KGS', // KGS для Киргизии
    }
    const requestBody = JSON.stringify(requestBodyData)

    // API key может быть с префиксом или без
    const apiKeyFormatted = apiKey.startsWith('api-key:') 
      ? apiKey
      : `api-key:${apiKey}`

    // Генерируем подпись: HMAC SHA3-256 от <API_KEY><PATH><REQUEST_BODY><TIMESTAMP>
    const signatureString = `${apiKeyFormatted}${path}${requestBody}${timestamp}`
    // Используем SHA3-256 (Node.js 10+ поддерживает)
    let signature: string
    try {
      signature = crypto
        .createHmac('sha3-256', secret)
        .update(signatureString)
        .digest('hex')
    } catch (e) {
      // Fallback на SHA256 если SHA3-256 не поддерживается
      console.warn('[Mostbet Deposit] SHA3-256 not supported, using SHA256')
      signature = crypto
        .createHmac('sha256', secret)
        .update(signatureString)
        .digest('hex')
    }

    const url = `${baseUrl}${path}`
    
    console.log(`[Mostbet Deposit] URL: ${url}, Request body:`, requestBodyData)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKeyFormatted,
        'X-Timestamp': timestamp,
        'X-Signature': signature,
        'X-Project': config.x_project || 'MBC',
        'Content-Type': 'application/json',
        'Accept': '*/*',
      },
      body: requestBody,
    })

    const responseText = await response.text()
    let data: any
    try {
      data = JSON.parse(responseText)
    } catch (e) {
      console.error(`[Mostbet Deposit] Failed to parse response: ${responseText}`)
      return {
        success: false,
        message: `Invalid response from Mostbet API: ${responseText.substring(0, 100)}`,
        data: { rawResponse: responseText, status: response.status },
      }
    }

    console.log(`[Mostbet Deposit] Response status: ${response.status}, Data:`, data)

    if (response.ok) {
      return {
        success: true,
        message: 'Balance deposited successfully',
        data,
      }
    }

    return {
      success: false,
      message: data.message || data.error || data.Message || `Failed to deposit balance (Status: ${response.status})`,
      data,
    }
  } catch (error: any) {
    console.error(`[Mostbet Deposit] Error for playerId: ${userId}:`, error)
    return {
      success: false,
      message: error.message || 'Failed to deposit balance',
    }
  }
}

// Пополнение для 1win с retry для rate limit ошибок
export async function deposit1winAPI(
  userId: string,
  amount: number,
  config: CasinoConfig,
  retryCount: number = 0
): Promise<{ success: boolean; message: string; data?: any }> {
  const baseUrl = 'https://api.1win.win/v1/client'
  const MAX_RETRIES = 3
  const RETRY_DELAYS = [2000, 5000, 10000] // Задержки в миллисекундах: 2с, 5с, 10с

  // Проверяем, что все обязательные поля заполнены и не пустые
  const apiKey = config.api_key

  if (!apiKey || apiKey.trim() === '') {
    return {
      success: false,
      message: 'Missing required 1win API key. Please configure API settings in database or environment variables.',
    }
  }

  try {
    // userId здесь - это ID казино (accountId), не Telegram ID
    console.log(`[1win Deposit] Casino User ID: ${userId}, Amount: ${amount}, Attempt: ${retryCount + 1}`)
    
    const url = `${baseUrl}/deposit`
    const requestBody = {
      userId: parseInt(String(userId)),
      amount: amount,
    }

    console.log(`[1win Deposit] URL: ${url}, Request body:`, requestBody)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify(requestBody),
    })

    const responseText = await response.text()
    let data: any
    try {
      data = JSON.parse(responseText)
    } catch (e) {
      console.error(`[1win Deposit] Failed to parse response: ${responseText}`)
      return {
        success: false,
        message: `Invalid response from 1win API: ${responseText.substring(0, 100)}`,
        data: { rawResponse: responseText, status: response.status },
      }
    }

    console.log(`[1win Deposit] Response status: ${response.status}, Data:`, data)

    if (response.ok && !data.errorCode) {
      return {
        success: true,
        message: 'Balance deposited successfully',
        data,
      }
    }

    // Обработка специфических ошибок 1win API
    const errorCode = data.errorCode
    let errorMessage = data.errorMessage || data.message || `Failed to deposit balance (Status: ${response.status})`
    
    if (errorCode === 'CASH06') {
      errorMessage = 'Слишком много запросов к API 1win. Пожалуйста, подождите несколько секунд и попробуйте снова.'
      
      // RETRY для rate limit ошибок
      if (retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAYS[retryCount] || RETRY_DELAYS[RETRY_DELAYS.length - 1]
        console.log(`⚠️ [1win Deposit] Rate limit error (CASH06), retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`)
        
        // Ждем перед повторной попыткой
        await new Promise(resolve => setTimeout(resolve, delay))
        
        // Повторная попытка
        return await deposit1winAPI(userId, amount, config, retryCount + 1)
      } else {
        console.error(`❌ [1win Deposit] Rate limit error after ${MAX_RETRIES} retries`)
      }
    } else if (errorCode === 'CASH07') {
      errorMessage = 'Превышен лимит баланса. Сумма пополнения слишком большая.'
    } else if (errorCode === 'CASH01') {
      errorMessage = 'Неверный ID пользователя или пользователь не найден в системе 1win.'
    } else if (errorCode === 'CASH02') {
      errorMessage = 'Неверная сумма пополнения. Проверьте сумму и попробуйте снова.'
    } else if (errorCode === 'CASH03') {
      errorMessage = 'Операция временно недоступна. Попробуйте позже.'
    } else if (errorCode === 'CASH04') {
      errorMessage = 'Недостаточно средств для пополнения.'
    } else if (errorCode === 'CASH05') {
      errorMessage = 'Операция отклонена. Свяжитесь с поддержкой 1win.'
    }

    return {
      success: false,
      message: errorMessage,
      data,
    }
  } catch (error: any) {
    console.error(`[1win Deposit] Error for userId: ${userId}:`, error)
    return {
      success: false,
      message: error.message || 'Failed to deposit balance',
    }
  }
}

// Получение баланса 1win через попытку пополнения с огромной суммой
export async function get1winBalance(
  userId: string,
  config: CasinoConfig
): Promise<{ balance: number; limit: number }> {
  const baseUrl = 'https://api.1win.win/v1/client'
  const apiKey = config.api_key

  if (!apiKey || apiKey.trim() === '') {
    return { balance: 0, limit: 0 }
  }

  try {
    // Пытаемся пополнить на огромную сумму (1 триллион)
    const hugeAmount = 1000000000000
    const url = `${baseUrl}/deposit`
    const requestBody = {
      userId: parseInt(String(userId)),
      amount: hugeAmount,
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify(requestBody),
    })

    const responseText = await response.text()
    let data: any
    try {
      data = JSON.parse(responseText)
    } catch (e) {
      console.error(`[1win Balance] Failed to parse response: ${responseText}`)
      return { balance: 0, limit: 0 }
    }

    // Если получили ошибку CASH07, извлекаем баланс из сообщения
    if (data.errorCode === 'CASH07' && data.errorMessage) {
      // Формат: "Cash limit exceeded: 44729.21 >= 560222222222220.06"
      const match = data.errorMessage.match(/Cash limit exceeded:\s*([\d.]+)/)
      if (match && match[1]) {
        const balance = parseFloat(match[1])
        return {
          balance: balance,
          limit: balance, // Лимит равен балансу
        }
      }
    }

    return { balance: 0, limit: 0 }
  } catch (error) {
    console.error('[1win Balance] Error:', error)
    return { balance: 0, limit: 0 }
  }
}

// Поиск игрока через Cashdesk API (для 1xbet, Melbet, Winwin, 888starz, 1xcasino, betwinner, wowbet)
export async function searchPlayerCashdeskAPI(
  bookmaker: string,
  userId: string,
  config: CasinoConfig
): Promise<{ success: boolean; message: string; data?: any }> {
  const baseUrl = 'https://partners.servcul.com/CashdeskBotAPI/'
  const isMelbet = bookmaker.toLowerCase().includes('melbet')

  // Проверяем, что все обязательные поля заполнены
  const hash = config.hash
  const cashierpass = config.cashierpass
  const login = config.login
  const cashdeskid = config.cashdeskid

  if (!hash || !cashierpass || !login || !cashdeskid || 
      hash.trim() === '' || cashierpass.trim() === '' || 
      login.trim() === '' || String(cashdeskid).trim() === '' || String(cashdeskid).trim() === '0') {
    return {
      success: false,
      message: `Missing required API credentials for ${bookmaker}. Please configure API settings.`,
    }
  }

  try {
    console.log(`[Cashdesk Search Player] Bookmaker: ${bookmaker}, Casino User ID: ${userId}`)
    
    // Формируем подпись для поиска игрока:
    // a. SHA256(hash={hash}&userid={userid}&cashdeskid={cashdeskid})
    const step1String = `hash=${hash}&userid=${isMelbet ? userId.toLowerCase() : userId}&cashdeskid=${cashdeskid}`
    const step1Hash = crypto.createHash('sha256').update(step1String).digest('hex')

    // b. MD5(userid={userid}&cashierpass={cashierpass}&hash={hash})
    const step2String = `userid=${isMelbet ? userId.toLowerCase() : userId}&cashierpass=${cashierpass}&hash=${hash}`
    const step2Hash = crypto.createHash('md5').update(step2String).digest('hex')

    // c. SHA256(step1 + step2)
    const combined = step1Hash + step2Hash
    const sign = crypto.createHash('sha256').update(combined).digest('hex')

    // Формируем confirm: MD5(userId:hash)
    const userIdForConfirm = isMelbet ? userId.toLowerCase() : userId
    const confirmString = `${userIdForConfirm}:${hash}`
    const confirm = crypto.createHash('md5').update(confirmString).digest('hex')

    const url = `${baseUrl}Users/${userId}?confirm=${confirm}&cashdeskId=${cashdeskid}`
    const authHeader = generateBasicAuth(login, cashierpass)

    console.log(`[Cashdesk Search Player] URL: ${url}`)

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'sign': sign,
      },
    })

    const responseText = await response.text()
    let data: any
    try {
      data = JSON.parse(responseText)
    } catch (e) {
      console.error(`[Cashdesk Search Player] Failed to parse response: ${responseText}`)
      return {
        success: false,
        message: `Invalid response from ${bookmaker} API: ${responseText.substring(0, 100)}`,
        data: { rawResponse: responseText, status: response.status },
      }
    }

    console.log(`[Cashdesk Search Player] Response status: ${response.status}, Data:`, data)

    const userIdFromResponse = data.userId ?? data.UserId
    const nameFromResponse = data.name ?? data.Name ?? ''
    const currencyIdFromResponse = data.currencyId ?? data.CurrencyId ?? 0

    if (response.ok && userIdFromResponse) {
      return {
        success: true,
        message: 'Player found',
        data: {
          userId: userIdFromResponse,
          name: nameFromResponse,
          currencyId: currencyIdFromResponse,
        },
      }
    }

    return {
      success: false,
      message: data.message || data.Message || data.error || data.Error || `Player not found (Status: ${response.status})`,
      data,
    }
  } catch (error: any) {
    console.error(`[Cashdesk Search Player] Error for ${bookmaker}, userId: ${userId}:`, error)
    return {
      success: false,
      message: error.message || 'Failed to search player',
    }
  }
}

// Вывод для 1xbet/Melbet/Winwin/888starz/1xcasino/betwinner/wowbet через Cashdesk API
export async function payoutCashdeskAPI(
  bookmaker: string,
  userId: string,
  code: string,
  config: CasinoConfig
): Promise<{ success: boolean; message: string; data?: any }> {
  const baseUrl = 'https://partners.servcul.com/CashdeskBotAPI/'
  const isMelbet = bookmaker.toLowerCase().includes('melbet')

  // Проверяем, что все обязательные поля заполнены и не пустые
  const hash = config.hash
  const cashierpass = config.cashierpass
  const login = config.login
  const cashdeskid = config.cashdeskid

  if (!hash || !cashierpass || !login || !cashdeskid || 
      hash.trim() === '' || cashierpass.trim() === '' || 
      login.trim() === '' || String(cashdeskid).trim() === '' || String(cashdeskid).trim() === '0') {
    return {
      success: false,
      message: `Missing required API credentials for ${bookmaker}. Please configure API settings in database or environment variables.`,
    }
  }

  if (!code || code.trim() === '') {
    return {
      success: false,
      message: 'Withdrawal code is required',
    }
  }

  try {
    // userId здесь - это ID казино (accountId), не Telegram ID
    console.log(`[Cashdesk Payout] Bookmaker: ${bookmaker}, Casino User ID: ${userId}, Code: ${code}`)
    
    const confirm = generateConfirm(userId, hash, isMelbet)
    const sign = isMelbet
      ? generateSignForPayoutMelbet(userId, code, hash, cashierpass, cashdeskid)
      : generateSignForPayout1xbet(userId, code, hash, cashierpass, cashdeskid)

    // Дополнительное логирование для отладки подписи
    if (isMelbet) {
      const step1String = `hash=${hash}&lng=ru&userid=${userId.toLowerCase()}`
      const step2String = `code=${code}&cashierpass=${cashierpass}&cashdeskid=${cashdeskid}`
      console.log(`[Cashdesk Payout] Melbet signature steps:`)
      console.log(`  Step1 string: ${step1String}`)
      console.log(`  Step2 string: ${step2String}`)
    } else {
      const step1String = `hash=${hash}&lng=ru&userid=${userId}`
      const step2String = `code=${code}&cashierpass=${cashierpass}&cashdeskid=${cashdeskid}`
      console.log(`[Cashdesk Payout] ${bookmaker} signature steps:`)
      console.log(`  Step1 string: ${step1String}`)
      console.log(`  Step2 string: ${step2String}`)
    }

    const url = `${baseUrl}Deposit/${userId}/Payout`
    const authHeader = generateBasicAuth(login, cashierpass)

    // cashdeskId должен быть числом согласно документации
    const cashdeskIdNum = typeof cashdeskid === 'string' ? parseInt(cashdeskid, 10) : Number(cashdeskid)

    const requestBody = {
      cashdeskId: cashdeskIdNum,
      lng: 'ru',
      code: code,
      confirm: confirm,
    }

    console.log(`[Cashdesk Payout] URL: ${url}`)
    console.log(`[Cashdesk Payout] Sign: ${sign}`)
    console.log(`[Cashdesk Payout] Confirm: ${confirm}`)
    console.log(`[Cashdesk Payout] Request body:`, JSON.stringify(requestBody, null, 2))

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'sign': sign,
      },
      body: JSON.stringify(requestBody),
    })

    const responseText = await response.text()
    let data: any
    try {
      data = JSON.parse(responseText)
    } catch (e) {
      console.error(`[Cashdesk Payout] Failed to parse response: ${responseText}`)
      return {
        success: false,
        message: `Invalid response from ${bookmaker} API: ${responseText.substring(0, 100)}`,
        data: { rawResponse: responseText, status: response.status },
      }
    }

    console.log(`[Cashdesk Payout] Response status: ${response.status}, Data:`, data)
    
    // Логируем детали при ошибке 401
    if (response.status === 401) {
      console.error(`[Cashdesk Payout] 401 Unauthorized - Check signature generation`)
      console.error(`[Cashdesk Payout] Request details:`, {
        url,
        headers: {
          'Authorization': authHeader.substring(0, 20) + '...',
          'sign': sign,
        },
        body: requestBody,
      })
    }

    // API может возвращать success (маленькая) или Success (большая буква)
    const isSuccess = response.ok && (data.success === true || data.Success === true)

    if (isSuccess) {
      return {
        success: true,
        message: 'Balance withdrawn successfully',
        data,
      }
    }

    return {
      success: false,
      message: data.message || data.Message || data.error || data.Error || `Failed to withdraw balance (Status: ${response.status})`,
      data,
    }
  } catch (error: any) {
    console.error(`[Cashdesk Payout] Error for ${bookmaker}, userId: ${userId}:`, error)
    return {
      success: false,
      message: error.message || 'Failed to withdraw balance',
    }
  }
}

