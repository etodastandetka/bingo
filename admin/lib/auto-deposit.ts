/**
 * Автоматическое пополнение баланса при совпадении входящих платежей с заявками
 */
import { prisma } from './prisma'
import { depositToCasino } from './deposit-balance'
import { formatDepositMessage, getAdminUsername, sendMessageWithMainMenuButton } from './send-notification'

interface MatchResult {
  success: boolean
  requestId?: number
  message?: string
}

/**
 * Проверка заявок младше 5 минут и поиск платежей для них
 * Вызывается каждую секунду для мгновенного автопополнения
 * Заявки старше 5 минут пропускаются (не обрабатываются автопополнением)
 */
export async function checkPendingRequestsForPayments(): Promise<void> {
  try {
    // Проверяем, включено ли автопополнение
    // Сначала проверяем BotConfiguration (новый способ), затем BotSetting (старый способ для совместимости)
    let autodepositValue: string | null = null
    
    const botConfigSetting = await prisma.botConfiguration.findUnique({
      where: { key: 'autodeposit_enabled' },
    })
    
    if (botConfigSetting) {
      autodepositValue = botConfigSetting.value
    } else {
      const botSetting = await prisma.botSetting.findUnique({
        where: { key: 'autodeposit_enabled' },
      })
      if (botSetting) {
        autodepositValue = botSetting.value
      }
    }
    
    const isAutodepositEnabled = autodepositValue && (
      (typeof autodepositValue === 'string' && (autodepositValue.toLowerCase() === 'true' || autodepositValue === '1')) ||
      (autodepositValue !== null && String(autodepositValue).toLowerCase() === 'true') ||
      (autodepositValue !== null && String(autodepositValue) === '1')
    )
    
    if (!isAutodepositEnabled) {
      return
    }

    // Ищем заявки на пополнение со статусом pending МЛАДШЕ 5 минут
    // Заявки старше 5 минут пропускаются (не обрабатываются автопополнением)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    const now = new Date()

    const pendingRequests = await prisma.request.findMany({
      where: {
        requestType: 'deposit',
        status: 'pending',
        createdAt: {
          gte: fiveMinutesAgo, // Не старше 5 минут (младше 5 минут)
          lte: now,            // Но не в будущем
        },
        // Исключаем заявки, которые уже имеют связанный обработанный платеж
        incomingPayments: {
          none: {
            isProcessed: true,
          },
        },
      },
      include: {
        incomingPayments: {
          where: {
            isProcessed: true,
          },
        },
      },
    })

    if (pendingRequests.length === 0) {
      return
    }

    console.log(`🔍 [Auto-Deposit Check] Found ${pendingRequests.length} pending requests younger than 5 minutes`)

    // Для каждой заявки ищем платежи по сумме
    for (const request of pendingRequests) {
      if (!request.amount) {
        console.log(`⚠️ [Auto-Deposit Check] Request ${request.id} skipped: no amount`)
        continue
      }
      if (request.incomingPayments && request.incomingPayments.length > 0) {
        console.log(`⚠️ [Auto-Deposit Check] Request ${request.id} skipped: already has processed payment`)
        continue
      }

      const requestAmount = parseFloat(request.amount.toString())
      const requestAge = Date.now() - request.createdAt.getTime()
      const requestAgeSeconds = Math.floor(requestAge / 1000)
      
      console.log(`🔍 [Auto-Deposit Check] Checking request ${request.id}: amount=${requestAmount}, age=${requestAgeSeconds}s`)

      // Ищем необработанные платежи с такой же суммой
      // Используем более широкий временной диапазон для поиска платежей
      const matchingPayments = await prisma.incomingPayment.findMany({
        where: {
          isProcessed: false,
          requestId: null,
          amount: requestAmount,
          paymentDate: {
            gte: new Date(request.createdAt.getTime() - 10 * 60 * 1000), // Платежи за 10 минут до создания заявки (на случай если платеж пришел раньше)
            lte: new Date(),
          },
        },
        orderBy: {
          paymentDate: 'asc',
        },
      })

      console.log(`🔍 [Auto-Deposit Check] Found ${matchingPayments.length} potential matching payments for request ${request.id}`)

      if (matchingPayments.length > 0) {
        // Берем первый платеж (самый старый)
        const payment = matchingPayments[0]
        const paymentAge = Date.now() - payment.paymentDate.getTime()
        const paymentAgeSeconds = Math.floor(paymentAge / 1000)
        
        console.log(`🎯 [Auto-Deposit Check] Found matching payment ${payment.id} for request ${request.id}`)
        console.log(`   Payment amount: ${payment.amount}, age: ${paymentAgeSeconds}s`)
        console.log(`   Request amount: ${requestAmount}, age: ${requestAgeSeconds}s`)
        console.log(`   Processing...`)
        
        // Обрабатываем платеж
        try {
          const result = await matchAndProcessPayment(payment.id, requestAmount)
          if (result.success) {
            console.log(`✅ [Auto-Deposit Check] Successfully processed payment ${payment.id} for request ${request.id}`)
          } else {
            console.log(`⚠️ [Auto-Deposit Check] Failed to process payment ${payment.id} for request ${request.id}: ${result.message}`)
          }
        } catch (error: any) {
          console.error(`❌ [Auto-Deposit Check] Exception processing payment ${payment.id} for request ${request.id}:`, error)
        }
      } else {
        console.log(`ℹ️ [Auto-Deposit Check] No matching payments found for request ${request.id} (amount: ${requestAmount})`)
      }
    }
  } catch (error: any) {
    console.error(`❌ [Auto-Deposit Check] Error checking pending requests:`, error)
  }
}

/**
 * Сопоставление платежа с заявкой и автоматическое пополнение
 * Ищет заявки на пополнение со статусом pending за последние 5 минут
 */
export async function matchAndProcessPayment(
  paymentId: number,
  amount: number
): Promise<MatchResult> {
  console.log(`🚀 [Auto-Deposit] matchAndProcessPayment called: paymentId=${paymentId}, amount=${amount}`)
  
  // Проверяем, включено ли автопополнение
  // Сначала проверяем BotConfiguration (новый способ), затем BotSetting (старый способ для совместимости)
  let autodepositValue: string | null = null
  
  const botConfigSetting = await prisma.botConfiguration.findUnique({
    where: { key: 'autodeposit_enabled' },
  })
  
  if (botConfigSetting) {
    autodepositValue = botConfigSetting.value
  } else {
    const botSetting = await prisma.botSetting.findUnique({
      where: { key: 'autodeposit_enabled' },
    })
    if (botSetting) {
      autodepositValue = botSetting.value
    }
  }
  
  console.log(`[Auto-Deposit] Checking autodeposit setting:`, {
    found: !!autodepositValue,
    value: autodepositValue,
    valueType: typeof autodepositValue,
    valueString: autodepositValue ? String(autodepositValue) : null
  })
  
  const isAutodepositEnabled = autodepositValue && (
    (typeof autodepositValue === 'string' && (autodepositValue.toLowerCase() === 'true' || autodepositValue === '1')) ||
    (autodepositValue !== null && String(autodepositValue).toLowerCase() === 'true') ||
    (autodepositValue !== null && String(autodepositValue) === '1')
  )
  
  console.log(`[Auto-Deposit] Autodeposit enabled: ${isAutodepositEnabled}`)
  
  if (!isAutodepositEnabled) {
    console.log(`⚠️ Auto-deposit is disabled, skipping payment ${paymentId}`)
    return {
      success: false,
      message: 'Auto-deposit is disabled',
    }
  }

  // Ищем заявки на пополнение со статусом pending за последние 10 минут
  // Расширяем окно поиска для более надежного сопоставления
  // (платеж может прийти с задержкой, или заявка может быть создана раньше)
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
  const now = new Date()

  console.log(
    `🔍 Matching payment ${paymentId}: looking for requests with amount ${amount} created between ${tenMinutesAgo.toISOString()} and ${now.toISOString()} (last 10 minutes)`
  )

  // Сначала получаем все заявки без фильтрации по incomingPayments
  // (Prisma может иметь проблемы с вложенными фильтрами)
  const matchingRequests = await prisma.request.findMany({
    where: {
      requestType: 'deposit',
      status: 'pending',
      createdAt: {
        gte: tenMinutesAgo, // За последние 10 минут
        lte: now,            // Но не в будущем
      },
    },
    orderBy: {
      createdAt: 'asc', // Берем самую старую заявку (первую по времени)
    },
    include: {
      incomingPayments: true, // Получаем все платежи для проверки
    },
  })

  console.log(
    `📋 Found ${matchingRequests.length} pending deposit requests younger than 5 minutes (without processed payments)`
  )

  // Фильтруем вручную, т.к. Prisma может иметь проблемы с точным сравнением Decimal
  // И дополнительно проверяем, что у заявки нет обработанных платежей
  console.log(`[Auto-Deposit] Filtering ${matchingRequests.length} requests for exact amount match: ${amount}`)
  
  const exactMatches = matchingRequests.filter((req) => {
    // Пропускаем заявки, у которых уже есть обработанный платеж
    const hasProcessedPayment = req.incomingPayments && req.incomingPayments.some(p => p.isProcessed === true)
    if (hasProcessedPayment) {
      console.log(`[Auto-Deposit] Request ${req.id} skipped: already has processed payment`)
      return false
    }

    if (!req.amount) {
      console.log(`[Auto-Deposit] Request ${req.id} skipped: no amount`)
      return false
    }
    
    // Проверяем возраст заявки - должна быть не старше 10 минут
    const requestAge = Date.now() - req.createdAt.getTime()
    const requestAgeMinutes = requestAge / (60 * 1000)
    
    if (requestAgeMinutes > 10) {
      console.log(`[Auto-Deposit] Request ${req.id} skipped: too old (${requestAgeMinutes.toFixed(2)} minutes)`)
      return false
    }
    
    // Точное сравнение суммы (до 1 копейки)
    const reqAmount = parseFloat(req.amount.toString())
    const diff = Math.abs(reqAmount - amount)
    const isMatch = diff < 0.01 // Точность до 1 копейки
    
    console.log(`[Auto-Deposit] Request ${req.id}: amount=${reqAmount}, payment=${amount}, diff=${diff.toFixed(4)}, match=${isMatch}, age=${requestAgeMinutes.toFixed(2)}min, createdAt=${req.createdAt.toISOString()}, hasProcessedPayment=${hasProcessedPayment}`)
    
    return isMatch
  })

  console.log(`🎯 Found ${exactMatches.length} exact match(es) for payment ${paymentId}`)

  if (exactMatches.length === 0) {
    console.log(
      `ℹ️ No matching request found for payment ${paymentId} (amount: ${amount})`
    )
    return {
      success: false,
      message: 'No matching request found',
    }
  }

  // Берем самую первую заявку (самую старую по времени создания)
  const request = exactMatches[0]

  // Дополнительная проверка: убеждаемся, что платеж еще не обработан
  // Проверяем как isProcessed, так и requestId (платеж может быть связан, но еще не обработан)
  const currentPayment = await prisma.incomingPayment.findUnique({
    where: { id: paymentId },
  })

  if (!currentPayment) {
    console.log(`⚠️ Payment ${paymentId} not found, skipping`)
    return {
      success: false,
      message: 'Payment not found',
    }
  }

  if (currentPayment.isProcessed || currentPayment.requestId !== null) {
    console.log(`⚠️ Payment ${paymentId} is already processed or linked (isProcessed: ${currentPayment.isProcessed}, requestId: ${currentPayment.requestId}), skipping`)
    return {
      success: false,
      message: 'Payment already processed or linked',
    }
  }

  if (!request.accountId || !request.bookmaker) {
    console.warn(`⚠️ Request ${request.id} missing accountId or bookmaker`)
    return {
      success: false,
      message: 'Request missing accountId or bookmaker',
    }
  }

  console.log(
    `🔍 Found matching request: ID ${request.id}, Account: ${request.accountId}, Bookmaker: ${request.bookmaker}`
  )

  // Проверяем еще раз, что заявка все еще pending и не обрабатывается
  // Это предотвращает race condition при одновременной обработке нескольких платежей
  // Проверяем еще раз, что заявка все еще pending и не обрабатывается
  // Это предотвращает race condition при одновременной обработке нескольких платежей
  // Используем include для получения всех полей, включая botType и incomingPayments
  const currentRequest = await prisma.request.findUnique({
    where: { id: request.id },
    include: {
      incomingPayments: {
        where: {
          isProcessed: true,
        },
      },
    },
  })

  if (!currentRequest || currentRequest.status !== 'pending') {
    console.log(`⚠️ Request ${request.id} is no longer pending (status: ${currentRequest?.status}), skipping`)
    return {
      success: false,
      message: 'Request is no longer pending',
    }
  }

  if (currentRequest.incomingPayments && currentRequest.incomingPayments.length > 0) {
    console.log(`⚠️ Request ${request.id} already has processed payment, skipping`)
    return {
      success: false,
      message: 'Request already has processed payment',
    }
  }

  // Обновляем статус платежа - связываем с заявкой
  // Используем updateMany с условием для атомарности (предотвращает race condition)
  const updateResult = await prisma.incomingPayment.updateMany({
    where: {
      id: paymentId,
      isProcessed: false,
      requestId: null, // Только если еще не связан
    },
    data: {
      requestId: request.id,
      isProcessed: true,
    },
  })

  // Если updateMany вернул 0, значит платеж уже был обработан другим процессом
  if (updateResult.count === 0) {
    console.log(`⚠️ Payment ${paymentId} was already processed by another process, skipping`)
    return {
      success: false,
      message: 'Payment was already processed by another process',
    }
  }

  // Пополняем баланс через казино API (использует localhost API)
  const depositStartTime = Date.now()
  try {
    console.log(`⏱️ [Auto-Deposit] Starting deposit for request ${request.id} at ${new Date().toISOString()}`)
    const depositResult = await depositToCasino(
      request.bookmaker,
      request.accountId,
      parseFloat(request.amount?.toString() || '0')
    )
    const depositDuration = Date.now() - depositStartTime
    console.log(`⏱️ [Auto-Deposit] Deposit completed for request ${request.id} in ${depositDuration}ms`)

    if (!depositResult.success) {
      // Сохраняем ошибку казино в базе данных перед выбросом исключения
      await prisma.request.update({
        where: { id: request.id },
        data: {
          casinoError: depositResult.message || 'Deposit failed',
        },
      })
      throw new Error(depositResult.message || 'Deposit failed')
    }

    // Успешное пополнение - обновляем статус заявки
    // processedBy = "автопополнение" означает что заявка закрыта автоматически
    // Очищаем ошибку казино при успешном пополнении
    await prisma.request.update({
      where: { id: request.id },
      data: {
        status: 'autodeposit_success',
        statusDetail: null,
        processedBy: 'автопополнение' as any,
        casinoError: null,
        processedAt: new Date(),
        updatedAt: new Date(),
      } as any,
    })

    console.log(
      `✅ Auto-deposit successful: Request ${request.id}, Account ${request.accountId}`
    )

    // Отправляем уведомление пользователю СРАЗУ ЖЕ, не дожидаясь запросов к БД
    // Используем дефолтные значения для мгновенной отправки
    // Это обеспечивает отправку уведомления в ту же секунду, как автопополнение сработало
    const amount = parseFloat(request.amount?.toString() || '0')
    const casino = request.bookmaker || 'Неизвестно'
    const accountId = request.accountId || ''
    const processingTime = '1s' // Для автопополнения всегда используем 1s
    const lang = 'ru' // Дефолтный язык для мгновенной отправки
    const adminUsername = '@bingokg_boss' // Дефолтный username для мгновенной отправки

    // Формируем сообщение сразу, без ожидания запросов к БД
    const notificationMessage = formatDepositMessage(amount, casino, accountId, adminUsername, lang, processingTime)
    
    console.log(`📨 [Auto-Deposit] Sending notification immediately for user ${request.userId.toString()}, requestId: ${request.id}`)
    console.log(`📨 [Auto-Deposit] Bookmaker: ${request.bookmaker}`)
    
    if (!notificationMessage || notificationMessage.trim().length === 0) {
      console.error(`❌ [Auto-Deposit] Notification message is empty for request ${request.id}`)
      return {
        success: true,
        requestId: request.id,
        message: 'Auto-deposit completed successfully',
      }
    }
    
    // Отправляем сообщение СРАЗУ, не блокируя основной процесс
    // Используем botType из объекта request (исходный объект из БД, который точно существует)
    // currentRequest может быть null или устаревшим после обновления, поэтому используем request
    let botType = (request as any).botType || currentRequest?.botType || null
    
    // Если botType не указан, пытаемся определить из bookmaker
    if (!botType && request.bookmaker) {
      const bookmakerLower = request.bookmaker.toLowerCase()
      if (bookmakerLower.includes('mostbet')) {
        botType = 'mostbet'
      } else if (bookmakerLower.includes('1xbet') || bookmakerLower.includes('xbet')) {
        botType = '1xbet'
      }
    }
    
    console.log(`📱 [Auto-Deposit] Using botType from request: ${botType} for request ${request.id}`)
    console.log(`📱 [Auto-Deposit] Request botType: ${(request as any).botType}, currentRequest botType: ${currentRequest?.botType}, final: ${botType}`)
    console.log(`📱 [Auto-Deposit] Request bookmaker: ${request.bookmaker}`)
    
    // Определяем bookmaker для fallback (если botType все еще не указан)
    const bookmakerForFallback = botType ? null : request.bookmaker
    
    // Отправляем уведомление асинхронно, не ждем результата (fire-and-forget)
    // Это позволяет автопополнению завершиться мгновенно, уведомление отправится в фоне
    sendMessageWithMainMenuButton(request.userId, notificationMessage, bookmakerForFallback, botType)
      .then((result) => {
        if (result.success) {
          console.log(`✅ [Auto-Deposit] Notification sent successfully to user ${request.userId.toString()} for request ${request.id}`)
        } else {
          console.error(`❌ [Auto-Deposit] Failed to send notification for request ${request.id}: ${result.error}`)
          // Если отправка с кнопкой не удалась, пробуем отправить без кнопки
          import('./send-notification')
            .then(({ sendNotificationToUser }) => sendNotificationToUser(request.userId, notificationMessage, bookmakerForFallback, null, botType))
            .then((fallbackResult) => {
              if (fallbackResult.success) {
                console.log(`✅ [Auto-Deposit] Fallback notification sent successfully to user ${request.userId.toString()} for request ${request.id}`)
              } else {
                console.error(`❌ [Auto-Deposit] Fallback notification also failed for request ${request.id}: ${fallbackResult.error}`)
              }
            })
            .catch((fallbackError) => {
              console.error(`❌ [Auto-Deposit] Fallback notification exception for request ${request.id}:`, fallbackError)
            })
        }
      })
      .catch((error) => {
        console.error(`❌ [Auto-Deposit] Exception sending notification for request ${request.id}:`, error)
        // Пробуем отправить через sendNotificationToUser как запасной вариант
        import('./send-notification')
          .then(({ sendNotificationToUser }) => sendNotificationToUser(request.userId, notificationMessage, bookmakerForFallback, null, botType))
          .then((fallbackResult) => {
            if (fallbackResult.success) {
              console.log(`✅ [Auto-Deposit] Fallback notification sent successfully to user ${request.userId.toString()} for request ${request.id}`)
            } else {
              console.error(`❌ [Auto-Deposit] Fallback notification also failed for request ${request.id}: ${fallbackResult.error}`)
            }
          })
          .catch((fallbackError) => {
            console.error(`❌ [Auto-Deposit] Fallback notification exception for request ${request.id}:`, fallbackError)
          })
      })

    return {
      success: true,
      requestId: request.id,
      message: 'Auto-deposit completed successfully',
    }
  } catch (error: any) {
    console.error(`❌ Auto-deposit failed for request ${request.id}:`, error)

    // В случае ошибки API казино, ставим статус profile-5 и сохраняем ошибку
    await prisma.request.update({
      where: { id: request.id },
      data: {
        status: 'profile-5',
        statusDetail: 'api_error',
        casinoError: error.message || 'Deposit failed',
        processedAt: new Date(),
        updatedAt: new Date(),
      },
    })

    return {
      success: false,
      requestId: request.id,
      message: error.message || 'Deposit failed',
    }
  }
}

