import crypto from 'crypto'
import { CasinoConfig, generateConfirm, generateBasicAuth, generateSignForPayout1xbet, generateSignForPayoutMelbet } from './casino-deposit'
import { getCasinoConfig } from './deposit-balance'

// Проверка суммы вывода для Cashdesk API (1xbet, Melbet, Winwin, 888starz, 1xcasino, betwinner, wowbet)
export async function checkWithdrawAmountCashdesk(
  bookmaker: string,
  userId: string,
  code: string,
  config: CasinoConfig
): Promise<{ success: boolean; amount?: number; message: string }> {
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

  if (!code || code.trim() === '') {
    return {
      success: false,
      message: 'Withdrawal code is required',
    }
  }

  try {
    console.log(`[Cashdesk Check Withdraw] Bookmaker: ${bookmaker}, Casino User ID: ${userId}, Code: ${code}`)
    
    const confirm = generateConfirm(userId, hash, isMelbet)
    const sign = isMelbet
      ? generateSignForPayoutMelbet(userId, code, hash, cashierpass, cashdeskid)
      : generateSignForPayout1xbet(userId, code, hash, cashierpass, cashdeskid)

    const url = `${baseUrl}Deposit/${userId}/Payout`
    const authHeader = generateBasicAuth(login, cashierpass)

    const requestBody = {
      cashdeskId: String(cashdeskid),
      lng: 'ru',
      code: code,
      confirm: confirm,
    }

    console.log(`[Cashdesk Check Withdraw] URL: ${url}, Request body:`, requestBody)

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
      console.error(`[Cashdesk Check Withdraw] Failed to parse response: ${responseText}`)
      return {
        success: false,
        message: `Invalid response from ${bookmaker} API: ${responseText.substring(0, 100)}`,
      }
    }

    console.log(`[Cashdesk Check Withdraw] Response status: ${response.status}, Data:`, data)

    // Проверяем оба варианта: summa (lowercase) и Summa (capitalized)
    let amount: number = 0

    if (data.summa !== undefined && data.summa !== null) {
      amount = parseFloat(String(data.summa))
    } else if (data.Summa !== undefined && data.Summa !== null) {
      amount = parseFloat(String(data.Summa))
    }

    // Берем абсолютное значение (API может вернуть отрицательное)
    const absoluteAmount = Math.abs(amount)

    // API может возвращать success (маленькая) или Success (большая буква)
    const isSuccess = response.ok && (data.success === true || data.Success === true)

    if (isSuccess && absoluteAmount > 0) {
      return {
        success: true,
        amount: absoluteAmount,
        message: data.Message || data.message || 'Withdrawal processed successfully',
      }
    }

    return {
      success: false,
      message: data.message || data.Message || data.error || data.Error || `Failed to get withdrawal amount (Status: ${response.status})`,
    }
  } catch (error: any) {
    console.error(`[Cashdesk Check Withdraw] Error for ${bookmaker}, userId: ${userId}:`, error)
    return {
      success: false,
      message: error.message || 'Failed to check withdrawal amount',
    }
  }
}

// Проверка суммы вывода для Mostbet
export async function checkWithdrawAmountMostbet(
  playerId: string,
  code: string,
  config: CasinoConfig
): Promise<{ success: boolean; amount?: number; message: string; transactionId?: number }> {
  const baseUrl = 'https://apimb.com'

  // Проверяем, что все обязательные поля заполнены
  const apiKey = config.api_key
  const secret = config.secret
  const cashpointId = config.cashpoint_id

  if (!apiKey || !secret || !cashpointId ||
      apiKey.trim() === '' || secret.trim() === '' || 
      String(cashpointId).trim() === '' || String(cashpointId).trim() === '0') {
    return {
      success: false,
      message: 'Missing required Mostbet API credentials. Please configure API settings.',
    }
  }

  if (!code || code.trim() === '') {
    return {
      success: false,
      message: 'Withdrawal code is required',
    }
  }

  try {
    console.log(`[Mostbet Check Withdraw] Player ID: ${playerId}, Code: ${code}`)
    
    // Получаем timestamp в UTC+0 формате 'YYYY-MM-DD HH:MM:SS'
    const now = new Date()
    const year = now.getUTCFullYear()
    const month = String(now.getUTCMonth() + 1).padStart(2, '0')
    const day = String(now.getUTCDate()).padStart(2, '0')
    const hours = String(now.getUTCHours()).padStart(2, '0')
    const minutes = String(now.getUTCMinutes()).padStart(2, '0')
    const seconds = String(now.getUTCSeconds()).padStart(2, '0')
    const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`

    // Шаг 1: Получаем список выводов
    const cashpointIdStr = String(cashpointId)
    // Используем searchString для поиска по playerId
    const listPath = `/mbc/gateway/v1/api/cashpoint/${cashpointIdStr}/player/cashout/list/page?page=0&size=10&searchString=${encodeURIComponent(playerId)}`
    const listUrl = `${baseUrl}${listPath}`

    // API key может быть с префиксом или без
    const apiKeyFormatted = apiKey.startsWith('api-key:') 
      ? apiKey
      : `api-key:${apiKey}`

    // Генерируем подпись для списка
    const listSignString = `${apiKeyFormatted}${listPath}${timestamp}`
    let listSignature: string
    try {
      listSignature = crypto
        .createHmac('sha3-256', secret)
        .update(listSignString)
        .digest('hex')
    } catch (e) {
      listSignature = crypto
        .createHmac('sha256', secret)
        .update(listSignString)
        .digest('hex')
    }

    const listHeaders = {
      'X-Api-Key': apiKeyFormatted,
      'X-Timestamp': timestamp,
      'X-Signature': listSignature,
      'Content-Type': 'application/json',
      'Accept': '*/*',
    }

    console.log(`[Mostbet Check Withdraw] List URL: ${listUrl}`)

    const listResponse = await fetch(listUrl, {
      method: 'GET',
      headers: listHeaders,
    })

    const listResponseText = await listResponse.text()
    let listData: any
    try {
      listData = JSON.parse(listResponseText)
    } catch (e) {
      console.error(`[Mostbet Check Withdraw] Failed to parse list response: ${listResponseText}`)
      return {
        success: false,
        message: `Invalid response from Mostbet API: ${listResponseText.substring(0, 100)}`,
      }
    }

    console.log(`[Mostbet Check Withdraw] List response:`, listData)

    // Ищем вывод для данного игрока
    const withdrawals = listData.items || []
    console.log(`[Mostbet Check Withdraw] Found ${withdrawals.length} withdrawals for player ${playerId}`)
    
    // Ищем заявку на вывод для данного игрока (может быть NEW, PROCESSING и т.д.)
    let withdrawal = withdrawals.find((w: any) => 
      String(w.playerId) === String(playerId) && 
      (w.status === 'NEW' || w.status === 'ACCEPTED' || w.status === 'PROCESSING')
    )

    if (!withdrawal) {
      // Если не нашли активную, берем первую в списке
      withdrawal = withdrawals.find((w: any) => String(w.playerId) === String(playerId))
    }

    if (!withdrawal) {
      return {
        success: false,
        message: `No withdrawal found for player ${playerId}`,
      }
    }

    const transactionId = withdrawal.transactionId
    const amount = parseFloat(String(withdrawal.amount || 0))
    
    console.log(`[Mostbet Check Withdraw] Found withdrawal: transactionId=${transactionId}, amount=${amount}, status=${withdrawal.status}`)

    // Шаг 2: Подтверждаем вывод кодом
    const confirmPath = `/mbc/gateway/v1/api/cashpoint/${cashpointIdStr}/player/cashout/confirmation`
    const confirmUrl = `${baseUrl}${confirmPath}`
    const confirmBodyData = {
      code: code,
      transactionId: transactionId,
    }
    // Важно: JSON.stringify без пробелов для подписи
    const confirmBody = JSON.stringify(confirmBodyData)

    // Генерируем подпись для подтверждения: <API_KEY><PATH><REQUEST_BODY><TIMESTAMP>
    const confirmSignString = `${apiKeyFormatted}${confirmPath}${confirmBody}${timestamp}`
    let confirmSignature: string
    try {
      confirmSignature = crypto
        .createHmac('sha3-256', secret)
        .update(confirmSignString)
        .digest('hex')
    } catch (e) {
      console.warn('[Mostbet Check Withdraw] SHA3-256 not supported, using SHA256')
      confirmSignature = crypto
        .createHmac('sha256', secret)
        .update(confirmSignString)
        .digest('hex')
    }

    const confirmHeaders = {
      'X-Api-Key': apiKeyFormatted,
      'X-Timestamp': timestamp,
      'X-Signature': confirmSignature,
      'X-Project': config.x_project || 'MBC',
      'Content-Type': 'application/json',
      'Accept': '*/*',
    }

    console.log(`[Mostbet Check Withdraw] Confirm URL: ${confirmUrl}`)
    console.log(`[Mostbet Check Withdraw] Confirm Headers:`, {
      'X-Api-Key': apiKeyFormatted.substring(0, 20) + '...',
      'X-Timestamp': timestamp,
      'X-Signature': confirmSignature.substring(0, 20) + '...',
      'X-Project': config.x_project || 'MBC',
    })
    console.log(`[Mostbet Check Withdraw] Confirm Body:`, confirmBodyData)
    console.log(`[Mostbet Check Withdraw] Signature string:`, confirmSignString.substring(0, 100) + '...')

    const confirmResponse = await fetch(confirmUrl, {
      method: 'POST',
      headers: confirmHeaders,
      body: confirmBody,
    })

    const confirmResponseText = await confirmResponse.text()
    let confirmData: any
    try {
      confirmData = JSON.parse(confirmResponseText)
    } catch (e) {
      console.error(`[Mostbet Check Withdraw] Failed to parse confirm response: ${confirmResponseText}`)
      return {
        success: false,
        message: `Invalid response from Mostbet API: ${confirmResponseText.substring(0, 100)}`,
      }
    }

    console.log(`[Mostbet Check Withdraw] Confirm response:`, confirmData)

    // По документации статус может быть NEW, PROCESSING, COMPLETED и т.д.
    // COMPLETED означает успешное завершение
    if (confirmResponse.ok) {
      const status = confirmData.status
      const finalAmount = confirmData.amount || amount || 0
      
      if (status === 'COMPLETED' || status === 'NEW' || status === 'ACCEPTED' || status === 'PROCESSING') {
        return {
          success: true,
          amount: parseFloat(String(finalAmount)),
          transactionId: transactionId,
          message: `Withdrawal ${status === 'COMPLETED' ? 'completed' : 'confirmed'} successfully`,
        }
      }
      
      // Если статус NEW_ERROR или другая ошибка
      if (status === 'NEW_ERROR' || status === 'PROCESSING_ERROR' || status === 'CANCELED' || status === 'EXPIRED') {
        return {
          success: false,
          message: confirmData.message || confirmData.error || `Withdrawal failed with status: ${status}`,
        }
      }
    }

    return {
      success: false,
      message: confirmData.message || confirmData.error || `Failed to confirm withdrawal (Status: ${confirmResponse.status})`,
    }
  } catch (error: any) {
    console.error(`[Mostbet Check Withdraw] Error for playerId: ${playerId}:`, error)
    return {
      success: false,
      message: error.message || 'Failed to check withdrawal amount',
    }
  }
}

// Проверка суммы вывода для 1win
export async function checkWithdrawAmount1win(
  userId: string,
  code: string,
  config: CasinoConfig
): Promise<{ success: boolean; amount?: number; message: string }> {
  const baseUrl = 'https://api.1win.win/v1/client'

  // Проверяем, что все обязательные поля заполнены
  const apiKey = config.api_key

  if (!apiKey || apiKey.trim() === '') {
    return {
      success: false,
      message: 'Missing required 1win API key. Please configure API settings.',
    }
  }

  if (!code || code.trim() === '') {
    return {
      success: false,
      message: 'Withdrawal code is required',
    }
  }

  try {
    console.log(`[1win Check Withdraw] User ID: ${userId}, Code: ${code}`)
    
    const url = `${baseUrl}/withdrawal`
    const requestBody = {
      userId: parseInt(String(userId)),
      code: parseInt(String(code)),
    }

    console.log(`[1win Check Withdraw] URL: ${url}, Request body:`, requestBody)

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
      console.error(`[1win Check Withdraw] Failed to parse response: ${responseText}`)
      return {
        success: false,
        message: `Invalid response from 1win API: ${responseText.substring(0, 100)}`,
      }
    }

    console.log(`[1win Check Withdraw] Response status: ${response.status}, Data:`, data)

    if (response.ok && data.amount) {
      const amount = parseFloat(String(data.amount))
      if (amount === 0 || isNaN(amount)) {
        return {
          success: false,
          message: 'Сумма вывода не получена',
        }
      }
      return {
        success: true,
        amount: amount,
        message: 'Withdrawal processed successfully',
      }
    }

    // Обработка ошибок
    if (response.status === 400) {
      return {
        success: false,
        message: data.errorMessage || data.message || 'Неверный код, превышение лимитов или в процессе обработки',
      }
    }
    if (response.status === 403) {
      return {
        success: false,
        message: 'Вывод не допускается',
      }
    }
    if (response.status === 404) {
      return {
        success: false,
        message: 'Вывод или пользователь не найден',
      }
    }

    return {
      success: false,
      message: data.errorMessage || data.message || `Failed to get withdrawal amount (Status: ${response.status})`,
    }
  } catch (error: any) {
    console.error(`[1win Check Withdraw] Error for userId: ${userId}:`, error)
    return {
      success: false,
      message: error.message || 'Failed to check withdrawal amount',
    }
  }
}

