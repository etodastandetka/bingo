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

// Флаг для предотвращения параллельных вызовов checkPendingRequestsForPayments
let isCheckingPendingRequests = false

// Map для отслеживания активных ожиданий для конкретных заявок
// Key: requestId, Value: { intervalId, amount, stopFlag }
const activeRequestWatchers = new Map<number, { intervalId: NodeJS.Timeout; amount: number; stopFlag: boolean }>()

// Примечание: Set processingPayments удален - транзакции решают проблему race condition

/**
 * Запускает ожидание для конкретной заявки - проверяет почту каждые 100ms на наличие платежа
 * Останавливается автоматически, если заявка отменена или обработана
 */
export function startRequestWatcher(requestId: number, amount: number): void {
  // Если уже есть ожидание для этой заявки, останавливаем его
  stopRequestWatcher(requestId)

  console.log(`🚀 [Request Watcher] Starting watcher for request ${requestId}, amount: ${amount}`)

  let stopFlag = false

  // Проверяем каждые 50ms для максимальной скорости (практически мгновенно)
  const intervalId = setInterval(async () => {
    if (stopFlag) {
      clearInterval(intervalId)
      activeRequestWatchers.delete(requestId)
      return
    }

    try {
      // Проверяем статус заявки - если не pending, останавливаем
      const request = await prisma.request.findUnique({
        where: { id: requestId },
        select: { status: true, amount: true },
      })

      if (!request || request.status !== 'pending') {
        console.log(`🛑 [Request Watcher] Request ${requestId} is no longer pending (status: ${request?.status}), stopping watcher`)
        stopRequestWatcher(requestId)
        return
      }

      // Проверяем, есть ли уже обработанный платеж для этой заявки
      const hasProcessedPayment = await prisma.incomingPayment.findFirst({
        where: {
          requestId: requestId,
          isProcessed: true,
        },
      })

      if (hasProcessedPayment) {
        console.log(`✅ [Request Watcher] Request ${requestId} already has processed payment, stopping watcher`)
        stopRequestWatcher(requestId)
        return
      }

      // Ищем необработанные платежи с точной суммой
      const amountRounded = Math.round(amount * 100) / 100
      const matchingPayments = await prisma.incomingPayment.findMany({
        where: {
          amount: amountRounded,
          isProcessed: false,
          requestId: null,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 1,
      })

      // Фильтруем для точного совпадения
      const exactMatch = matchingPayments.find((payment) => {
        const paymentAmount = parseFloat(payment.amount.toString())
        const paymentAmountRounded = Math.round(paymentAmount * 100) / 100
        return paymentAmountRounded === amountRounded
      })

      if (exactMatch) {
        // ВАЖНО: Проверяем, что платеж еще не обработан перед обработкой
        // Это предотвращает race condition, если платеж уже обрабатывается другим процессом
        const currentPayment = await prisma.incomingPayment.findUnique({
          where: { id: exactMatch.id },
          select: { isProcessed: true, requestId: true },
        })
        
        if (!currentPayment || currentPayment.isProcessed || currentPayment.requestId !== null) {
          console.log(`⚠️ [Request Watcher] Payment ${exactMatch.id} already processed (isProcessed: ${currentPayment?.isProcessed}, requestId: ${currentPayment?.requestId}), skipping`)
          // Если платеж уже обработан, проверяем, не для нашей ли заявки
          if (currentPayment?.requestId === requestId) {
            console.log(`✅ [Request Watcher] Payment ${exactMatch.id} already processed for request ${requestId}, stopping watcher`)
            stopRequestWatcher(requestId)
          }
          return
        }
        
        console.log(`🎯 [Request Watcher] Found matching payment ${exactMatch.id} for request ${requestId}, processing...`)
        stopRequestWatcher(requestId)
        
        // Обрабатываем платеж
        matchAndProcessPayment(exactMatch.id, amount)
          .then((result) => {
            if (result.success) {
              console.log(`✅ [Request Watcher] Auto-deposit completed for request ${requestId}`)
            } else {
              console.log(`⚠️ [Request Watcher] Auto-deposit failed for request ${requestId}: ${result.message}`)
            }
          })
          .catch((error) => {
            console.error(`❌ [Request Watcher] Error processing payment for request ${requestId}:`, error)
          })
      }
    } catch (error: any) {
      console.error(`❌ [Request Watcher] Error checking request ${requestId}:`, error.message)
    }
  }, 50) // Проверка каждые 50ms для максимальной скорости (практически мгновенно)

  activeRequestWatchers.set(requestId, { intervalId, amount, stopFlag: false })
}

/**
 * Останавливает ожидание для конкретной заявки
 */
export function stopRequestWatcher(requestId: number): void {
  const watcher = activeRequestWatchers.get(requestId)
  if (watcher) {
    clearInterval(watcher.intervalId)
    activeRequestWatchers.delete(requestId)
    console.log(`🛑 [Request Watcher] Stopped watcher for request ${requestId}`)
  }
}

/**
 * Проверка всех pending заявок и поиск платежей для них
 * Вызывается каждые 100ms для мгновенного автопополнения
 * Обрабатываются все pending заявки без ограничения по времени
 */
export async function checkPendingRequestsForPayments(): Promise<void> {
  // Предотвращаем параллельные вызовы
  if (isCheckingPendingRequests) {
    return
  }
  
  isCheckingPendingRequests = true
  
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

    // Ищем заявки на пополнение со статусом pending за последние 5 минут
    // Это ускоряет поиск и предотвращает обработку старых заявок
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    const pendingRequests = await prisma.request.findMany({
      where: {
        requestType: 'deposit',
        status: 'pending',
        createdAt: { gte: fiveMinutesAgo }, // ✅ Только последние 5 минут
        // Исключаем заявки, которые уже имеют связанный обработанный платеж
        incomingPayments: {
          none: {
            isProcessed: true,
          },
        },
      },
      select: {
        id: true,
        userId: true,
        accountId: true,
        bookmaker: true,
        amount: true,
        status: true,
        createdAt: true,
        botType: true,
        incomingPayments: {
          where: {
            isProcessed: true,
          },
          select: {
            id: true,
            isProcessed: true,
          },
        },
      },
    })

    if (pendingRequests.length === 0) {
      return
    }

    console.log(`🔍 [Auto-Deposit Check] Found ${pendingRequests.length} pending requests`)

    // Обрабатываем все заявки ПАРАЛЛЕЛЬНО для быстрой обработки множественных платежей
    // Сначала проверяем активные request watchers - они могут найти платеж быстрее
    const processingPromises = pendingRequests.map(async (request) => {
      if (!request.amount) {
        console.log(`⚠️ [Auto-Deposit Check] Request ${request.id} skipped: no amount`)
        return
      }
      if (request.incomingPayments && request.incomingPayments.length > 0) {
        console.log(`⚠️ [Auto-Deposit Check] Request ${request.id} skipped: already has processed payment`)
        return
      }

      const requestAmount = parseFloat(request.amount.toString())
      const requestAge = Date.now() - request.createdAt.getTime()
      const requestAgeSeconds = Math.floor(requestAge / 1000)
      
      // Дополнительная проверка возраста заявки (максимум 5 минут)
      const maxAge = 5 * 60 * 1000
      if (requestAge > maxAge) {
        console.log(`⚠️ [Auto-Deposit Check] Request ${request.id} is too old (${requestAgeSeconds}s), skipping`)
        return
      }
      
      console.log(`🔍 [Auto-Deposit Check] Checking request ${request.id}: amount=${requestAmount}, age=${requestAgeSeconds}s`)

      // Ищем необработанные платежи с ТОЧНО такой же суммой (без допуска)
      // Округляем до 2 знаков для точного сравнения
      const requestAmountRounded = Math.round(requestAmount * 100) / 100
      
      const matchingPayments = await prisma.incomingPayment.findMany({
        where: {
          isProcessed: false,
          requestId: null,
          amount: requestAmountRounded, // Точное сравнение
          paymentDate: {
            gte: new Date(request.createdAt.getTime() - 60 * 60 * 1000), // Платежи за час до создания заявки (на случай если платеж пришел раньше)
            lte: new Date(),
          },
        },
        orderBy: {
          paymentDate: 'asc',
        },
        select: {
          id: true,
          amount: true,
          paymentDate: true,
          isProcessed: true,
          requestId: true,
        },
      })
      
      // Фильтруем вручную для ТОЧНОГО сравнения (1 к 1, без разницы)
      const exactMatchingPayments = matchingPayments.filter((payment) => {
        const paymentAmount = parseFloat(payment.amount.toString())
        const paymentAmountRounded = Math.round(paymentAmount * 100) / 100
        // Точное сравнение: суммы должны быть абсолютно равны
        return paymentAmountRounded === requestAmountRounded
      })

      console.log(`🔍 [Auto-Deposit Check] Found ${matchingPayments.length} potential matching payments (before exact filter), ${exactMatchingPayments.length} exact matches for request ${request.id}`)

      if (exactMatchingPayments.length > 0) {
        // Берем первый платеж (самый старый)
        const payment = exactMatchingPayments[0]
        
        // ВАЖНО: Проверяем, что платеж еще не обработан перед обработкой
        // Это предотвращает двойную обработку, если платеж уже обрабатывается через email watcher
        const currentPayment = await prisma.incomingPayment.findUnique({
          where: { id: payment.id },
        })
        
        if (!currentPayment || currentPayment.isProcessed || currentPayment.requestId !== null) {
          console.log(`⚠️ [Auto-Deposit Check] Payment ${payment.id} already processed (isProcessed: ${currentPayment?.isProcessed}, requestId: ${currentPayment?.requestId}), skipping`)
          return
        }
        
        const paymentAge = Date.now() - payment.paymentDate.getTime()
        const paymentAgeSeconds = Math.floor(paymentAge / 1000)
        
        console.log(`🎯 [Auto-Deposit Check] Found matching payment ${payment.id} for request ${request.id}`)
        console.log(`   Payment amount: ${payment.amount}, age: ${paymentAgeSeconds}s`)
        console.log(`   Request amount: ${requestAmount}, age: ${requestAgeSeconds}s`)
        console.log(`   Processing...`)
        
        // Обрабатываем платеж (await внутри Promise.all обрабатывает все параллельно)
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
    })

    // Ждем завершения всех обработок параллельно
    await Promise.allSettled(processingPromises)
  } catch (error: any) {
    console.error(`❌ [Auto-Deposit Check] Error checking pending requests:`, error)
  } finally {
    isCheckingPendingRequests = false
  }
}

/**
 * Сопоставление платежа с заявкой и автоматическое пополнение
 * Ищет все заявки на пополнение со статусом pending (без ограничения по времени)
 */
export async function matchAndProcessPayment(
  paymentId: number,
  amount: number
): Promise<MatchResult> {
  console.log(`🚀 [Auto-Deposit] matchAndProcessPayment called: paymentId=${paymentId}, amount=${amount}`)
  
  // СНАЧАЛА проверяем в БД, может платеж уже обработан (быстрее чем проверка Set)
  const dbPaymentCheck = await prisma.incomingPayment.findUnique({
    where: { id: paymentId },
    select: { isProcessed: true, requestId: true },
  })
  
  if (dbPaymentCheck && (dbPaymentCheck.isProcessed || dbPaymentCheck.requestId !== null)) {
    console.log(`⚠️ [Auto-Deposit] Payment ${paymentId} already processed in DB (isProcessed: ${dbPaymentCheck.isProcessed}, requestId: ${dbPaymentCheck.requestId}), skipping`)
    return {
      success: false,
      message: 'Payment already processed',
    }
  }

  // Функция cleanup больше не нужна (транзакции решают проблему race condition)
  const cleanup = () => {
    // Пустая функция для совместимости
  }
  
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
    cleanup()
    return {
      success: false,
      message: 'Auto-deposit is disabled',
    }
  }

  // Ищем заявки на пополнение со статусом pending за последние 5 минут
  // Это ускоряет поиск и предотвращает обработку старых заявок
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)

  console.log(
    `🔍 Matching payment ${paymentId}: looking for requests with amount ${amount} (last 5 minutes)`
  )

  // Получаем только нужные поля для оптимизации
  const matchingRequests = await prisma.request.findMany({
    where: {
      requestType: 'deposit',
      status: 'pending',
      createdAt: { gte: fiveMinutesAgo }, // ✅ Только последние 5 минут
    },
    orderBy: {
      createdAt: 'asc', // Берем самую старую заявку (первую по времени)
    },
    select: {
      id: true,
      userId: true,
      accountId: true,
      bookmaker: true,
      amount: true,
      status: true,
      createdAt: true,
      botType: true,
      incomingPayments: {
        where: {
          isProcessed: true,
        },
        select: {
          id: true,
          isProcessed: true,
        },
      },
    },
  })

  console.log(
    `📋 Found ${matchingRequests.length} pending deposit requests (without processed payments)`
  )

  // Фильтруем вручную, т.к. Prisma может иметь проблемы с точным сравнением Decimal
  // И дополнительно проверяем, что у заявки нет обработанных платежей
  console.log(`[Auto-Deposit] Filtering ${matchingRequests.length} requests for exact amount match: ${amount}`)
  
  const exactMatches = matchingRequests.filter((req) => {
    // Простая и быстрая фильтрация
    if (req.status !== 'pending' || !req.amount) {
      return false
    }
    
    const hasProcessedPayment = req.incomingPayments && req.incomingPayments.length > 0
    if (hasProcessedPayment) {
      return false
    }
    
    // Дополнительная проверка возраста заявки (максимум 5 минут)
    const requestAge = Date.now() - req.createdAt.getTime()
    const maxAge = 5 * 60 * 1000
    if (requestAge > maxAge) {
      return false
    }
    
    // ТОЧНОЕ сравнение суммы (1 к 1, без разницы)
    const reqAmount = parseFloat(req.amount.toString())
    const reqAmountRounded = Math.round(reqAmount * 100) / 100
    const amountRounded = Math.round(amount * 100) / 100
    const isMatch = reqAmountRounded === amountRounded // Точное сравнение: суммы должны быть абсолютно равны
    
    return isMatch
  })

  console.log(`🎯 Found ${exactMatches.length} exact match(es) for payment ${paymentId}`)

  if (exactMatches.length === 0) {
    console.log(
      `ℹ️ No matching request found for payment ${paymentId} (amount: ${amount})`
    )
    cleanup()
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
    cleanup()
    return {
      success: false,
      message: 'Payment not found',
    }
  }

  if (currentPayment.isProcessed || currentPayment.requestId !== null) {
    console.log(`⚠️ Payment ${paymentId} is already processed or linked (isProcessed: ${currentPayment.isProcessed}, requestId: ${currentPayment.requestId}), skipping`)
    cleanup()
    return {
      success: false,
      message: 'Payment already processed or linked',
    }
  }

  if (!request.accountId || !request.bookmaker) {
    console.warn(`⚠️ Request ${request.id} missing accountId or bookmaker`)
    cleanup()
    return {
      success: false,
      message: 'Request missing accountId or bookmaker',
    }
  }

  console.log(
    `🔍 Found matching request: ID ${request.id}, Account: ${request.accountId}, Bookmaker: ${request.bookmaker}`
  )

  // Используем транзакцию для атомарности - все обновления в одной транзакции
  // Это предотвращает race condition и двойные пополнения
  const transactionResult = await prisma.$transaction(async (tx) => {
    // Проверяем текущее состояние заявки и платежа в транзакции
    const [currentRequest, currentPayment] = await Promise.all([
      tx.request.findUnique({
        where: { id: request.id },
        select: {
          id: true,
          status: true,
          accountId: true,
          bookmaker: true,
          amount: true,
          userId: true,
          botType: true,
          incomingPayments: {
            where: { isProcessed: true },
            select: { id: true },
          },
        },
      }),
      tx.incomingPayment.findUnique({
        where: { id: paymentId },
        select: {
          id: true,
          isProcessed: true,
          requestId: true,
        },
      }),
    ])

    // Проверяем, что заявка все еще pending и не имеет обработанных платежей
    if (!currentRequest || currentRequest.status !== 'pending') {
      return { skipped: true, reason: 'Request is no longer pending' }
    }

    if (currentRequest.incomingPayments && currentRequest.incomingPayments.length > 0) {
      return { skipped: true, reason: 'Request already has processed payment' }
    }

    // Проверяем, что платеж еще не обработан
    if (!currentPayment || currentPayment.isProcessed || currentPayment.requestId !== null) {
      return { skipped: true, reason: 'Payment already processed or linked' }
    }

    // Обновляем заявку и платеж атомарно в одной транзакции
    const [updatedRequest, updatedPayment] = await Promise.all([
      tx.request.update({
        where: { id: request.id },
        data: {
          status: 'autodeposit_success',
          statusDetail: null,
          processedBy: 'автопополнение' as any,
          casinoError: null,
          processedAt: new Date(),
          updatedAt: new Date(),
        } as any,
        select: {
          id: true,
          userId: true,
          accountId: true,
          bookmaker: true,
          amount: true,
          botType: true,
        },
      }),
      tx.incomingPayment.update({
        where: { id: paymentId },
        data: {
          requestId: request.id,
          isProcessed: true,
        },
        select: {
          id: true,
          requestId: true,
          isProcessed: true,
        },
      }),
    ])

    return { updatedRequest, updatedPayment }
  })

  // Если транзакция пропустила обновление, значит заявка или платеж уже обработаны
  if (transactionResult.skipped) {
    console.log(`⚠️ Transaction skipped: ${transactionResult.reason}`)
    cleanup()
    return {
      success: false,
      message: transactionResult.reason || 'Transaction skipped',
    }
  }

  const { updatedRequest, updatedPayment } = transactionResult

  // Используем updatedRequest из транзакции вместо исходного request
  if (!updatedRequest) {
    console.log(`⚠️ Transaction did not return updatedRequest, skipping`)
    cleanup()
    return {
      success: false,
      message: 'Transaction did not return updatedRequest',
    }
  }

  const requestToUse = updatedRequest

  // Защита от дублирования: проверяем недавние пополнения перед вызовом API
  const fiveMinutesAgoForDupCheck = new Date(Date.now() - 5 * 60 * 1000)
  const requestAmount = parseFloat(requestToUse.amount?.toString() || '0')
  
  const recentDeposits = await prisma.request.findMany({
    where: {
      accountId: requestToUse.accountId,
      bookmaker: requestToUse.bookmaker,
      status: { in: ['completed', 'autodeposit_success', 'approved', 'auto_completed'] },
      processedAt: {
        gte: fiveMinutesAgoForDupCheck,
      },
    },
    select: {
      id: true,
      amount: true,
      processedAt: true,
    },
  })

  // Проверяем на дубликат по сумме (ТОЧНОЕ сравнение, 1 к 1)
  const requestAmountRounded = Math.round(requestAmount * 100) / 100
  const duplicate = recentDeposits.find((deposit) => {
    if (!deposit.amount) return false
    const depositAmount = parseFloat(deposit.amount.toString())
    const depositAmountRounded = Math.round(depositAmount * 100) / 100
    return depositAmountRounded === requestAmountRounded // Точное сравнение: суммы должны быть абсолютно равны
  })

  if (duplicate) {
    console.log(`⚠️ [Auto-Deposit] Duplicate deposit detected: Request ${duplicate.id} with same amount (${requestAmount}) was processed ${Math.floor((Date.now() - (duplicate.processedAt?.getTime() || 0)) / 1000)}s ago`)
    cleanup()
    return {
      success: false,
      requestId: requestToUse.id,
      message: `Депозит уже был проведен (заявка #${duplicate.id})`,
    }
  }

  // Пополняем баланс через казино API (использует localhost API)
  const depositStartTime = Date.now()
  try {
    console.log(`⏱️ [Auto-Deposit] Starting deposit for request ${requestToUse.id} at ${new Date().toISOString()}`)
    const depositResult = await depositToCasino(
      requestToUse.bookmaker!,
      requestToUse.accountId!,
      requestAmount
    )
    const depositDuration = Date.now() - depositStartTime
    console.log(`⏱️ [Auto-Deposit] Deposit completed for request ${requestToUse.id} in ${depositDuration}ms`)

    if (!depositResult.success) {
      // Сохраняем ошибку казино в базе данных перед выбросом исключения
      await prisma.request.update({
        where: { id: requestToUse.id },
        data: {
          casinoError: depositResult.message || 'Deposit failed',
        },
      })
      throw new Error(depositResult.message || 'Deposit failed')
    }

    console.log(
      `✅ Auto-deposit successful: Request ${requestToUse.id}, Account ${requestToUse.accountId}`
    )

    // ОТПРАВЛЯЕМ УВЕДОМЛЕНИЕ СРАЗУ ПОСЛЕ УСПЕШНОГО ПОПОЛНЕНИЯ
    // Статус уже обновлен в транзакции, так что заявка уже обработана
    const amount = parseFloat(requestToUse.amount?.toString() || '0')
    const casino = requestToUse.bookmaker || 'Неизвестно'
    const accountId = requestToUse.accountId || ''
    const processingTime = '1s' // Для автопополнения всегда используем 1s
    const lang = 'ru' // Дефолтный язык для мгновенной отправки
    const adminUsername = '@helperbingo_bot' // Дефолтный username для мгновенной отправки

    // Формируем сообщение сразу, без ожидания запросов к БД
    const notificationMessage = formatDepositMessage(amount, casino, accountId, adminUsername, lang, processingTime)
    
    console.log(`📨 [Auto-Deposit] Sending notification IMMEDIATELY for user ${requestToUse.userId.toString()}, requestId: ${requestToUse.id}`)
    console.log(`📨 [Auto-Deposit] Bookmaker: ${requestToUse.bookmaker}`)
    
    // Определяем botType ДО отправки уведомления
    let botType = requestToUse.botType || null
    
    // Если botType не указан, пытаемся определить из bookmaker
    if (!botType && requestToUse.bookmaker) {
      const bookmakerLower = requestToUse.bookmaker.toLowerCase()
      if (bookmakerLower.includes('mostbet')) {
        botType = 'mostbet'
      } else if (bookmakerLower.includes('1xbet') || bookmakerLower.includes('xbet')) {
        botType = '1xbet'
      }
    }
    
    console.log(`📱 [Auto-Deposit] Using botType: ${botType} for request ${requestToUse.id}`)
    console.log(`📱 [Auto-Deposit] Request bookmaker: ${requestToUse.bookmaker}`)
    
    // Определяем bookmaker для fallback (если botType все еще не указан)
    const bookmakerForFallback = botType ? null : requestToUse.bookmaker

    // ОТПРАВЛЯЕМ УВЕДОМЛЕНИЕ (в фоне, не блокируя)
    // Статус уже обновлен в транзакции, так что заявка уже обработана
    const notificationPromise = sendMessageWithMainMenuButton(requestToUse.userId, notificationMessage, bookmakerForFallback, botType)
    
    // Запускаем отправку уведомления в фоне
    notificationPromise
      .then((result) => {
        if (result.success) {
          console.log(`✅ [Auto-Deposit] Notification sent successfully to user ${requestToUse.userId.toString()} for request ${requestToUse.id}`)
        } else {
          console.error(`❌ [Auto-Deposit] Failed to send notification for request ${requestToUse.id}: ${result.error}`)
          // Если отправка с кнопкой не удалась, пробуем отправить без кнопки
          import('./send-notification')
            .then(({ sendNotificationToUser }) => sendNotificationToUser(requestToUse.userId, notificationMessage, bookmakerForFallback, null, botType))
            .then((fallbackResult) => {
              if (fallbackResult.success) {
                console.log(`✅ [Auto-Deposit] Fallback notification sent successfully to user ${requestToUse.userId.toString()} for request ${requestToUse.id}`)
              } else {
                console.error(`❌ [Auto-Deposit] Fallback notification also failed for request ${requestToUse.id}: ${fallbackResult.error}`)
              }
            })
            .catch((fallbackError) => {
              console.error(`❌ [Auto-Deposit] Fallback notification exception for request ${requestToUse.id}:`, fallbackError)
            })
        }
      })
      .catch((error) => {
        console.error(`❌ [Auto-Deposit] Exception sending notification for request ${requestToUse.id}:`, error)
        // Пробуем отправить через sendNotificationToUser как запасной вариант
        import('./send-notification')
          .then(({ sendNotificationToUser }) => sendNotificationToUser(requestToUse.userId, notificationMessage, bookmakerForFallback, null, botType))
          .then((fallbackResult) => {
            if (fallbackResult.success) {
              console.log(`✅ [Auto-Deposit] Fallback notification sent successfully to user ${requestToUse.userId.toString()} for request ${requestToUse.id}`)
            } else {
              console.error(`❌ [Auto-Deposit] Fallback notification also failed for request ${requestToUse.id}: ${fallbackResult.error}`)
            }
          })
          .catch((fallbackError) => {
            console.error(`❌ [Auto-Deposit] Fallback notification exception for request ${requestToUse.id}:`, fallbackError)
          })
      })

    // Очищаем cleanup (пустая функция, но вызываем для совместимости)
    cleanup()

    return {
      success: true,
      requestId: requestToUse.id,
      message: 'Auto-deposit completed successfully',
    }
  } catch (error: any) {
    console.error(`❌ Auto-deposit failed for request ${requestToUse.id}:`, error)

    // Очищаем cleanup при ошибке
    cleanup()

    // В случае ошибки API казино, ставим статус profile-5 и сохраняем ошибку
    await prisma.request.update({
      where: { id: requestToUse.id },
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
      requestId: requestToUse.id,
      message: error.message || 'Deposit failed',
    }
  }
}

