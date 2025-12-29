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
      console.log(`[Cashdesk Check Withdraw] Found summa (lowercase): ${data.summa}, parsed: ${amount}`)
    } else if (data.Summa !== undefined && data.Summa !== null) {
      amount = parseFloat(String(data.Summa))
      console.log(`[Cashdesk Check Withdraw] Found Summa (capitalized): ${data.Summa}, parsed: ${amount}`)
    } else {
      console.log(`[Cashdesk Check Withdraw] No summa/Summa found in response. Available keys:`, Object.keys(data))
    }

    // Берем абсолютное значение (API может вернуть отрицательное, например -150)
    const absoluteAmount = Math.abs(amount)
    console.log(`[Cashdesk Check Withdraw] Amount: ${amount}, Absolute amount: ${absoluteAmount}`)

    // API может возвращать success (маленькая) или Success (большая буква)
    const isSuccess = response.ok && (data.success === true || data.Success === true)
    console.log(`[Cashdesk Check Withdraw] Success check: response.ok=${response.ok}, data.success=${data.success}, data.Success=${data.Success}, isSuccess=${isSuccess}`)

    if (isSuccess && absoluteAmount > 0) {
      console.log(`[Cashdesk Check Withdraw] Returning success with amount: ${absoluteAmount}`)
      return {
        success: true,
        amount: absoluteAmount,
        message: data.Message || data.message || 'Withdrawal processed successfully',
      }
    }

    // Улучшаем сообщения об ошибках для Cashdesk API
    let errorMessage = data.message || data.Message || data.error || data.Error || `Не удалось получить сумму вывода (Статус: ${response.status})`
    
    // Переводим типичные ошибки на более понятный язык
    if (errorMessage.toLowerCase().includes('not found') || errorMessage.toLowerCase().includes('не найден')) {
      errorMessage = 'У этого игрока нет активной заявки на вывод в казино. Пожалуйста, создайте новую заявку на вывод в казино.'
    } else if (errorMessage.toLowerCase().includes('active') || errorMessage.toLowerCase().includes('актив')) {
      errorMessage = 'У этого игрока нет активной заявки на вывод в казино. Пожалуйста, создайте новую заявку на вывод в казино.'
    } else if (errorMessage.toLowerCase().includes('code') || errorMessage.toLowerCase().includes('код')) {
      errorMessage = 'Неверный код вывода. Пожалуйста, проверьте код и попробуйте снова.'
    }
    
    return {
      success: false,
      message: errorMessage,
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
    
    // Получаем timestamp в формате YYYY-MM-DD HH:MM:SS в UTC+0 (как требует документация)
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
    const listPath = `/mbc/gateway/v1/api/cashpoint/${cashpointIdStr}/player/cashout/list/page?page=1&size=10&searchString=${playerId}`
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

    // Ищем вывод с нужным кодом или берем первый NEW
    const withdrawals = listData.items || []
    let withdrawal = withdrawals.find((w: any) => w.status === 'NEW')

    if (!withdrawal) {
      // Более детальное сообщение об ошибке
      const hasWithdrawals = withdrawals.length > 0
      if (hasWithdrawals) {
        const statuses = withdrawals.map((w: any) => w.status).join(', ')
        return {
          success: false,
          message: `У этого игрока нет активной заявки на вывод в казино Mostbet. Текущие статусы заявок: ${statuses}. Пожалуйста, создайте новую заявку на вывод в казино.`,
        }
      } else {
      return {
        success: false,
          message: 'У этого игрока нет активной заявки на вывод в казино Mostbet. Пожалуйста, создайте новую заявку на вывод в казино.',
        }
      }
    }

    const transactionId = withdrawal.transactionId
    // Явно преобразуем amount в число (может прийти как строка или число)
    const amount = withdrawal.amount != null ? parseFloat(String(withdrawal.amount)) : 0
    console.log(`[Mostbet Check Withdraw] Extracted amount from list: ${withdrawal.amount} (type: ${typeof withdrawal.amount}), parsed: ${amount}`)

    // Шаг 2: Подтверждаем вывод кодом
    // Генерируем новый timestamp для запроса подтверждения (каждый запрос должен иметь свой timestamp)
    const confirmNow = new Date()
    const confirmYear = confirmNow.getUTCFullYear()
    const confirmMonth = String(confirmNow.getUTCMonth() + 1).padStart(2, '0')
    const confirmDay = String(confirmNow.getUTCDate()).padStart(2, '0')
    const confirmHours = String(confirmNow.getUTCHours()).padStart(2, '0')
    const confirmMinutes = String(confirmNow.getUTCMinutes()).padStart(2, '0')
    const confirmSeconds = String(confirmNow.getUTCSeconds()).padStart(2, '0')
    const confirmTimestamp = `${confirmYear}-${confirmMonth}-${confirmDay} ${confirmHours}:${confirmMinutes}:${confirmSeconds}`
    
    const confirmPath = `/mbc/gateway/v1/api/cashpoint/${cashpointIdStr}/player/cashout/confirmation`
    const confirmUrl = `${baseUrl}${confirmPath}`
    // JSON.stringify по умолчанию не добавляет пробелы, что требуется по документации
    const confirmBody = JSON.stringify({
      code: code,
      transactionId: transactionId,
    })

    // Генерируем подпись для подтверждения
    const confirmSignString = `${apiKeyFormatted}${confirmPath}${confirmBody}${confirmTimestamp}`
    let confirmSignature: string
    try {
      confirmSignature = crypto
        .createHmac('sha3-256', secret)
        .update(confirmSignString)
        .digest('hex')
    } catch (e) {
      confirmSignature = crypto
        .createHmac('sha256', secret)
        .update(confirmSignString)
        .digest('hex')
    }

    const confirmHeaders = {
      'X-Api-Key': apiKeyFormatted,
      'X-Timestamp': confirmTimestamp,
      'X-Signature': confirmSignature,
      'X-Project': config.x_project || 'MBC',
      'Content-Type': 'application/json',
      'Accept': '*/*',
    }

    console.log(`[Mostbet Check Withdraw] Confirm URL: ${confirmUrl}, Body:`, confirmBody)

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

    // По документации при успешном подтверждении возвращается статус NEW или COMPLETED
    // Проверяем успешный ответ и наличие transactionId
    if (confirmResponse.ok && confirmData.transactionId) {
      // Используем amount из confirmData, если есть, иначе из списка (amount)
      const finalAmount = confirmData.amount != null 
        ? parseFloat(String(confirmData.amount))
        : (amount || 0)
      console.log(`[Mostbet Check Withdraw] Final amount: confirmData.amount=${confirmData.amount}, list amount=${amount}, final=${finalAmount}`)
      // Статус может быть NEW, COMPLETED, PROCESSING и т.д.
      // Любой статус при успешном ответе означает, что транзакция подтверждена
      return {
        success: true,
        amount: finalAmount,
        transactionId: transactionId,
        message: 'Withdrawal confirmed successfully',
      }
    }

    // Улучшаем сообщения об ошибках
    let errorMessage = confirmData.message || confirmData.error || 'Не удалось подтвердить вывод'
    
    // Переводим типичные ошибки на более понятный язык
    if (errorMessage.toLowerCase().includes('code') || errorMessage.toLowerCase().includes('код')) {
      errorMessage = 'Неверный код подтверждения. Пожалуйста, проверьте код и попробуйте снова.'
    } else if (errorMessage.toLowerCase().includes('not found') || errorMessage.toLowerCase().includes('не найден')) {
      errorMessage = 'Заявка на вывод не найдена. Убедитесь, что вы создали заявку на вывод в казино Mostbet.'
    } else if (errorMessage.toLowerCase().includes('active') || errorMessage.toLowerCase().includes('актив')) {
      errorMessage = 'У этого игрока нет активной заявки на вывод в казино Mostbet. Пожалуйста, создайте новую заявку на вывод в казино.'
    }

    return {
      success: false,
      message: errorMessage,
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

    // Обработка ошибок с улучшенными сообщениями
    if (response.status === 400) {
      let errorMessage = data.errorMessage || data.message || 'Неверный код, превышение лимитов или в процессе обработки'
      if (errorMessage.toLowerCase().includes('not found') || errorMessage.toLowerCase().includes('не найден')) {
        errorMessage = 'У этого игрока нет активной заявки на вывод в казино 1win. Пожалуйста, создайте новую заявку на вывод в казино.'
      }
      return {
        success: false,
        message: errorMessage,
      }
    }
    if (response.status === 403) {
      return {
        success: false,
        message: 'Вывод не допускается. Убедитесь, что у игрока есть активная заявка на вывод в казино 1win.',
      }
    }
    if (response.status === 404) {
      return {
        success: false,
        message: 'У этого игрока нет активной заявки на вывод в казино 1win. Пожалуйста, создайте новую заявку на вывод в казино.',
      }
    }

    let errorMessage = data.errorMessage || data.message || `Не удалось получить сумму вывода (Статус: ${response.status})`
    if (errorMessage.toLowerCase().includes('not found') || errorMessage.toLowerCase().includes('не найден')) {
      errorMessage = 'У этого игрока нет активной заявки на вывод в казино 1win. Пожалуйста, создайте новую заявку на вывод в казино.'
    }

    return {
      success: false,
      message: errorMessage,
    }
  } catch (error: any) {
    console.error(`[1win Check Withdraw] Error for userId: ${userId}:`, error)
    return {
      success: false,
      message: error.message || 'Failed to check withdrawal amount',
    }
  }
}

