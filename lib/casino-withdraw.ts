/**
 * Функции для работы с API вывода средств из казино
 * Поддерживаются: 1xbet, Melbet, Mostbet, 1win
 */
import crypto from 'crypto'

// Конфигурация API казино
interface CasinoConfig {
  hash?: string
  cashierpass?: string
  login?: string
  cashdeskid?: string | number
  api_key?: string
  secret?: string
  cashpoint_id?: string | number
}

/**
 * Генерация confirm для 1xbet/Melbet
 */
function generateConfirm(userId: string, hash: string): string {
  return crypto.createHash('md5').update(`${userId}:${hash}`).digest('hex')
}

/**
 * Генерация подписи для вывода 1xbet/Melbet
 */
function generateSignForWithdraw(
  userId: string,
  code: string,
  hash: string,
  cashierpass: string,
  cashdeskid: string | number
): string {
  // a) SHA256(hash={hash}&lng=ru&userid={user_id})
  const step1String = `hash=${hash}&lng=ru&userid=${userId}`
  const step1Hash = crypto.createHash('sha256').update(step1String).digest('hex')

  // b) MD5(code={code}&cashierpass={cashierpass}&cashdeskid={cashdeskid})
  const step2String = `code=${code}&cashierpass=${cashierpass}&cashdeskid=${cashdeskid}`
  const step2Hash = crypto.createHash('md5').update(step2String).digest('hex')

  // c) SHA256(step1 + step2)
  const combined = step1Hash + step2Hash
  return crypto.createHash('sha256').update(combined).digest('hex')
}

/**
 * Проверка суммы вывода через API 1xbet/Melbet (Cashdesk API)
 * ВАЖНО: Метод Payout сразу выполняет вывод, поэтому используем его только для проверки кода
 * Если код верный - возвращаем успех (сумму нужно брать из заявки или запрашивать отдельно)
 */
export async function checkWithdrawAmountCashdesk(
  bookmaker: string,
  userId: string,
  code: string,
  config: CasinoConfig
): Promise<{ success: boolean; amount?: number; message?: string; transactionId?: number }> {
  try {
    const normalizedBookmaker = bookmaker.toLowerCase()
    const baseUrl = 'https://partners.servcul.com/CashdeskBotAPI'
    
    // Для Melbet userid должен быть в нижнем регистре
    const userIdForApi = normalizedBookmaker.includes('melbet') 
      ? userId.toLowerCase() 
      : userId

    const confirm = generateConfirm(userIdForApi, config.hash!)
    const sign = generateSignForWithdraw(
      userIdForApi,
      code,
      config.hash!,
      config.cashierpass!,
      config.cashdeskid!
    )

    const url = `${baseUrl}/Deposit/${userIdForApi}/Payout`
    
    const requestBody = {
      cashdeskId: parseInt(String(config.cashdeskid)),
      lng: 'ru',
      code: code,
      confirm: confirm,
    }

    console.log(`[Cashdesk Withdraw Check] Bookmaker: ${bookmaker}, User ID: ${userIdForApi}, Code: ${code}`)
    console.log(`[Cashdesk Withdraw Check] URL: ${url}`)
    console.log(`[Cashdesk Withdraw Check] Request body:`, requestBody)

    // ВАЖНО: Этот запрос ВЫПОЛНЯЕТ вывод, но мы используем его для проверки кода
    // Если код верный - вывод будет выполнен и вернется сумма
    // Если код неверный - вернется ошибка
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'sign': sign,
      },
      body: JSON.stringify(requestBody),
    })

    const data = await response.json()
    console.log(`[Cashdesk Withdraw Check] Response status: ${response.status}, Data:`, data)

    if (!response.ok || !data.success) {
      return {
        success: false,
        message: data.message || `Failed to check withdrawal: ${response.status}`,
      }
    }

    // Если успешно - возвращаем сумму
    // ВАЖНО: Вывод уже выполнен! Нужно это учесть при создании заявки
    return {
      success: true,
      amount: data.summa || 0,
      message: data.message || 'Withdrawal processed',
    }
  } catch (error: any) {
    console.error(`[Cashdesk Withdraw Check] Error:`, error)
    return {
      success: false,
      message: `Error checking withdrawal: ${error.message}`,
    }
  }
}

/**
 * Проверка наличия выводов для игрока (Mostbet) - без кода
 */
export async function checkWithdrawsExistMostbet(
  playerId: string,
  config: CasinoConfig
): Promise<{ success: boolean; hasWithdrawals: boolean; message?: string }> {
  try {
    const baseUrl = 'https://apimb.com/mbc/gateway/v1/api/cashpoint'
    const cashpointId = String(config.cashpoint_id)
    
    const now = new Date()
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`

    const apiKey = config.api_key!
    const apiKeyFormatted = apiKey.startsWith('api-key:') 
      ? apiKey
      : `api-key:${apiKey}`

    const listPath = `/mbc/gateway/v1/api/cashpoint/${cashpointId}/player/cashout/list/page?page=1&size=10&searchString=${playerId}`
    const listString = `${apiKeyFormatted}${listPath}${timestamp}`
    const listSignature = crypto.createHmac('sha3-256', config.secret!).update(listString).digest('hex')

    const listResponse = await fetch(`${baseUrl}${listPath}`, {
      method: 'GET',
      headers: {
        'X-Timestamp': timestamp,
        'X-Signature': listSignature,
        'X-Api-Key': apiKeyFormatted,
      },
    })

    const listData = await listResponse.json()
    
    if (!listResponse.ok) {
      return {
        success: false,
        hasWithdrawals: false,
        message: listData.message || 'Failed to check withdrawals',
      }
    }

    const hasWithdrawals = listData.items && listData.items.length > 0 && 
      listData.items.some((item: any) => item.playerId === String(playerId))

    return {
      success: true,
      hasWithdrawals,
      message: hasWithdrawals ? 'Withdrawals found' : 'No withdrawals found for this player',
    }
  } catch (error: any) {
    console.error(`[Mostbet Check Withdrawals] Error:`, error)
    return {
      success: false,
      hasWithdrawals: false,
      message: `Error: ${error.message}`,
    }
  }
}

/**
 * Проверка суммы вывода через API Mostbet
 */
export async function checkWithdrawAmountMostbet(
  playerId: string,
  code: string,
  config: CasinoConfig
): Promise<{ success: boolean; amount?: number; transactionId?: number; message?: string }> {
  try {
    const baseUrl = 'https://apimb.com/mbc/gateway/v1/api/cashpoint'
    const cashpointId = String(config.cashpoint_id)
    
    // Формируем timestamp
    const now = new Date()
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`

    // API key может быть с префиксом или без
    const apiKey = config.api_key!
    const apiKeyFormatted = apiKey.startsWith('api-key:') 
      ? apiKey
      : `api-key:${apiKey}`

    // Сначала получаем список запросов на вывод
    const listPath = `/mbc/gateway/v1/api/cashpoint/${cashpointId}/player/cashout/list/page?page=1&size=10&searchString=${playerId}`
    const listString = `${apiKeyFormatted}${listPath}${timestamp}`
    const listSignature = crypto.createHmac('sha3-256', config.secret!).update(listString).digest('hex')

    const listResponse = await fetch(`${baseUrl}${listPath}`, {
      method: 'GET',
      headers: {
        'X-Timestamp': timestamp,
        'X-Signature': listSignature,
        'X-Api-Key': apiKeyFormatted,
      },
    })

    const listData = await listResponse.json()
    console.log(`[Mostbet Withdraw Check] List response:`, listData)

    if (!listResponse.ok || !listData.items || listData.items.length === 0) {
      return {
        success: false,
        message: 'No withdrawal request found for this player',
      }
    }

    // Ищем запрос для этого игрока
    let withdrawal = listData.items.find((item: any) => 
      item.playerId === String(playerId)
    )

    if (!withdrawal) {
      // Если не нашли точно по ID, берем первый (может быть новый запрос)
      withdrawal = listData.items[0]
    }

    // Подтверждаем вывод кодом, чтобы получить сумму
    const confirmPath = `/mbc/gateway/v1/api/cashpoint/${cashpointId}/player/cashout/confirmation`
    const confirmBody = {
      code: code,
      transactionId: withdrawal.transactionId,
    }
    const confirmBodyString = JSON.stringify(confirmBody)
    const confirmString = `${apiKeyFormatted}${confirmPath}${confirmBodyString}${timestamp}`
    const confirmSignature = crypto.createHmac('sha3-256', config.secret!).update(confirmString).digest('hex')

    const confirmResponse = await fetch(`${baseUrl}${confirmPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Timestamp': timestamp,
        'X-Signature': confirmSignature,
        'X-Api-Key': apiKeyFormatted,
        'X-Project': 'MBC',
      },
      body: confirmBodyString,
    })

    const confirmData = await confirmResponse.json()
    console.log(`[Mostbet Withdraw Check] Confirm response:`, confirmData)

    if (!confirmResponse.ok || confirmData.status === 'NEW_ERROR' || confirmData.status === 'PROCESSING_ERROR') {
      return {
        success: false,
        message: confirmData.message || 'Invalid code or withdrawal not found',
      }
    }

    // Возвращаем сумму подтвержденного вывода
    return {
      success: true,
      amount: withdrawal.amount || confirmData.amount,
      transactionId: withdrawal.transactionId || confirmData.transactionId,
      message: 'Withdrawal confirmed',
    }
  } catch (error: any) {
    console.error(`[Mostbet Withdraw Check] Error:`, error)
    return {
      success: false,
      message: `Error checking withdrawal: ${error.message}`,
    }
  }
}

/**
 * Проверка суммы вывода через API 1win
 */
export async function checkWithdrawAmount1win(
  userId: string,
  code: string,
  config: CasinoConfig
): Promise<{ success: boolean; amount?: number; message?: string }> {
  try {
    const baseUrl = 'https://api.1win.win/v1/client'
    
    // Для 1win нужно сначала проверить вывод по коду
    const response = await fetch(`${baseUrl}/withdrawal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': config.api_key!,
      },
      body: JSON.stringify({
        userId: parseInt(userId),
        code: parseInt(code),
      }),
    })

    const data = await response.json()
    console.log(`[1win Withdraw Check] Response status: ${response.status}, Data:`, data)

    if (!response.ok) {
      return {
        success: false,
        message: data.message || `Failed to check withdrawal: ${response.status}`,
      }
    }

    return {
      success: true,
      amount: data.amount || 0,
      message: 'Withdrawal confirmed',
    }
  } catch (error: any) {
    console.error(`[1win Withdraw Check] Error:`, error)
    return {
      success: false,
      message: `Error checking withdrawal: ${error.message}`,
    }
  }
}

/**
 * Выполнение вывода средств через API казино
 */
export async function processWithdraw(
  bookmaker: string,
  userId: string,
  code: string,
  config: CasinoConfig
): Promise<{ success: boolean; amount?: number; message?: string; transactionId?: number }> {
  const normalizedBookmaker = bookmaker.toLowerCase()

  // 1xbet и Melbet используют Cashdesk API
  if (normalizedBookmaker.includes('1xbet') || normalizedBookmaker.includes('melbet')) {
    return await checkWithdrawAmountCashdesk(bookmaker, userId, code, config)
  }

  // Mostbet использует свой API
  if (normalizedBookmaker.includes('mostbet')) {
    return await checkWithdrawAmountMostbet(userId, code, config)
  }

  // 1win использует свой API
  if (normalizedBookmaker.includes('1win')) {
    return await checkWithdrawAmount1win(userId, code, config)
  }

  return {
    success: false,
    message: `Unsupported bookmaker: ${bookmaker}`,
  }
}

