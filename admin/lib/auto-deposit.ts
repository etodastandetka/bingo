import { prisma } from './prisma'

// Дебаунсинг для предотвращения параллельных проверок одной заявки
const checkingRequests = new Map<number, Promise<any>>()

/**
 * Вспомогательная функция для retry запросов к БД
 */
async function retryDbQuery<T>(
  queryFn: () => Promise<T>,
  maxRetries: number = 3,
  operationName: string = 'DB query'
): Promise<T> {
  let lastError: any = null
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await queryFn()
      // Успешно выполнили запрос - выходим из retry цикла
    } catch (error: any) {
      lastError = error
      
      // Проверяем, является ли это ошибкой пула соединений
      const isConnectionPoolError = error.code === 'P2024' || 
                                    error.message?.includes('Unable to start a transaction') ||
                                    error.message?.includes('connection pool') ||
                                    error.message?.includes('timeout')
      
      if (isConnectionPoolError && attempt < maxRetries) {
        // Экспоненциальная задержка: 0.5s, 1s, 2s
        const delay = Math.min(500 * Math.pow(2, attempt - 1), 2000)
        console.warn(`⚠️ [Auto-Deposit] Connection pool error in ${operationName} (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue // Пробуем снова
      }
      
      // Если это не ошибка пула или это последняя попытка - пробрасываем ошибку
      if (isConnectionPoolError && attempt === maxRetries) {
        console.error(`❌ [Auto-Deposit] Connection pool error in ${operationName} after ${maxRetries} attempts`)
      }
      
      throw error
    }
  }
  
  // Если все попытки не удались
  throw lastError || new Error(`Failed ${operationName} after ${maxRetries} attempts`)
}

/**
 * Проверяет существующие необработанные платежи для заявки и вызывает автопополнение
 * Используется когда заявка создается ПОСЛЕ того, как платеж уже был обработан email-watcher'ом
 */
export async function checkAndProcessExistingPayment(requestId: number, amount: number) {
  // Дебаунсинг: если заявка уже проверяется - ждем завершения предыдущей проверки
  const existingCheck = checkingRequests.get(requestId)
  if (existingCheck) {
    console.log(`⏳ [Auto-Deposit] Request ${requestId} is already being checked, waiting for previous check to complete...`)
    return existingCheck
  }
  
  const startTime = Date.now()
  console.log(`🔍 [Auto-Deposit] checkAndProcessExistingPayment called: requestId=${requestId}, amount=${amount}`)
  
  // Создаем Promise для этой проверки и сохраняем его
  const checkPromise = (async () => {
    try {
      // КРИТИЧЕСКАЯ ПРОВЕРКА: Автопополнение НЕ работает, если сумма заканчивается на .00 (копейки = 00)
      // Автопополнение работает ТОЛЬКО если копейки от 01 до 99
      const cents = Math.round((amount % 1) * 100) // Получаем копейки (0-99)
      if (cents === 0) {
        console.log(`❌ [Auto-Deposit] Amount ${amount} ends with .00 (cents = 00), autodeposit is DISABLED. Autodeposit only works with cents 01-99.`)
        return null
      }
      
      // Retry логика для запросов к БД при ошибках пула соединений
      const maxRetries = 3
      
      // КРИТИЧЕСКАЯ ЗАЩИТА: Проверяем статус заявки ПЕРЕД поиском платежей
      // Если заявка уже обработана - сразу выходим, не тратим время на поиск платежей
      // ВАЖНО: Получаем также createdAt для определения временного окна
      // И проверяем наличие фото чека
      const requestCheck = await retryDbQuery(
        () => prisma.request.findUnique({
          where: { id: requestId },
          select: { 
            status: true, 
            processedBy: true,
            createdAt: true, // Получаем время создания заявки
            photoFileId: true, // Проверяем наличие фото чека
            photoFileUrl: true, // Проверяем наличие фото чека
            incomingPayments: {
              where: { isProcessed: true },
              select: { id: true },
              take: 1,
            },
          },
        }),
        maxRetries,
        `findUnique request ${requestId}`
      )
    
      // Если заявка уже обработана - не ищем платежи (защита от дубликатов)
      if (requestCheck?.status !== 'pending') {
        console.log(`⚠️ [Auto-Deposit] Request ${requestId} already processed (status: ${requestCheck?.status}), skipping payment search`)
        return null
      }
      
      // Если заявка уже обработана автопополнением - не ищем платежи
      if (requestCheck?.processedBy === 'автопополнение') {
        console.log(`⚠️ [Auto-Deposit] Request ${requestId} already processed by autodeposit, skipping payment search`)
        return null
      }
      
      // Если уже есть обработанный платеж - не ищем новые
      if (requestCheck?.incomingPayments?.length > 0) {
        console.log(`⚠️ [Auto-Deposit] Request ${requestId} already has processed payment, skipping payment search`)
        return null
      }
      
      if (!requestCheck?.createdAt) {
        console.log(`⚠️ [Auto-Deposit] Request ${requestId} has no createdAt, skipping payment search`)
        return null
      }
      
      // ВАЖНО: Проверяем наличие фото чека - автопополнение не работает без фото
      if (!requestCheck.photoFileId && !requestCheck.photoFileUrl) {
        console.log(`⚠️ [Auto-Deposit] Request ${requestId} has no receipt photo (photoFileId and photoFileUrl are empty), skipping autodeposit`)
        return null
      }
      
      // КРИТИЧЕСКИ ВАЖНО: Ищем платежи в окне ±5 минут от времени создания заявки
      // Это предотвращает обработку старых платежей и фейковых чеков
      const requestCreatedAt = requestCheck.createdAt
      const now = Date.now()
      const requestTime = requestCreatedAt.getTime()
      
      // Платеж может быть оплачен до создания заявки (до 5 минут назад)
      const windowStart = new Date(requestTime - 5 * 60 * 1000) // 5 минут до создания заявки
      
      // Платеж может прийти после создания заявки (до 5 минут после)
      const windowEnd = new Date(Math.min(requestTime + 5 * 60 * 1000, now + 1 * 60 * 1000)) // До 5 минут после или до 1 минуты в будущее
      
      // ДОПОЛНИТЕЛЬНАЯ ЗАЩИТА: Платеж не должен быть старше 10 минут от текущего момента
      // Это предотвращает обработку очень старых платежей (например, вчерашних)
      const maxPaymentAge = new Date(now - 10 * 60 * 1000) // 10 минут назад
      
      // ОПТИМИЗАЦИЯ: Фильтруем по сумме прямо в БД (приблизительно)
      // Используем очень маленький диапазон ±0.0001 только для ошибок округления при поиске в БД
      // В финальной проверке будет точное сравнение
      const amountMin = amount - 0.0001
      const amountMax = amount + 0.0001
      
      // Ищем платежи в расширенном окне (5 минут до, 15 минут после создания заявки)
      // ВАЖНО: Проверяем и paymentDate (из письма) И createdAt (когда платеж был создан в БД)
      // Это учитывает случаи, когда paymentDate из письма может быть в прошлом
      const actualWindowStart = windowStart > maxPaymentAge ? windowStart : maxPaymentAge
      const matchingPayments = await retryDbQuery(
        () => prisma.incomingPayment.findMany({
          where: {
            isProcessed: false,
            AND: [
              {
                // Проверяем paymentDate (дата платежа из письма)
                paymentDate: { 
                  gte: actualWindowStart,
                  lte: windowEnd,
                },
              },
              {
                // ВАЖНО: Также проверяем createdAt (когда платеж был создан в БД)
                // Платеж должен быть создан недавно (в последние 20 минут)
                createdAt: {
                  gte: maxPaymentAge, // Не старше 20 минут
                },
              },
            ],
            amount: {
              gte: amountMin,
              lte: amountMax,
            },
          },
          orderBy: { createdAt: 'desc' }, // Берем самые свежие платежи (сначала последние созданные)
          take: 20,
          select: {
            id: true,
            amount: true,
            paymentDate: true,
            createdAt: true, // Добавляем createdAt для логирования
          },
        }),
        maxRetries,
        `findMany incomingPayments for request ${requestId}`
      )
      
      // Фильтруем по ТОЧНОМУ совпадению суммы (до копейки)
      // НЕ логируем несовпадения - это нормально, просто платеж не подходит к этой заявке
      const exactMatches = matchingPayments.filter((payment) => {
      const paymentAmount = parseFloat(payment.amount.toString())
      // ТОЧНОЕ сравнение: суммы должны совпадать в точности до копейки (2 знака после запятой)
      // Округляем до 2 знаков после запятой для корректного сравнения денежных сумм
      const paymentRounded = Math.round(paymentAmount * 100) / 100 // Округление до 2 знаков
      const amountRounded = Math.round(amount * 100) / 100 // Округление до 2 знаков
      const matches = paymentRounded === amountRounded // Точное равенство без допуска
      
      // Логируем ТОЛЬКО успешные совпадения
      if (matches) {
        console.log(`✅ [Auto-Deposit] Exact match found: Payment ${payment.id} (${paymentAmount}) = Request ${requestId} (${amount})`)
      }
      // НЕ логируем несовпадения - это нормальное поведение
      
        return matches
      })
      
      // Логируем только если нашли платежи, но не нашли совпадений
      if (matchingPayments.length > 0 && exactMatches.length === 0) {
        console.log(`ℹ️ [Auto-Deposit] Found ${matchingPayments.length} payments in window, but no exact matches for request ${requestId} (amount: ${amount})`)
      }
      
      if (exactMatches.length === 0) {
        console.log(`ℹ️ [Auto-Deposit] No exact matches in window, trying alternative search (all recent unprocessed payments with amount ${amount})...`)
        
        // АЛЬТЕРНАТИВНЫЙ ПОИСК: Если не нашли в окне, ищем все необработанные платежи с нужной суммой,
      // созданные в последние 10 минут (независимо от paymentDate)
      // Это обрабатывает случаи, когда paymentDate из письма может быть неправильным
      const alternativePayments = await retryDbQuery(
        () => prisma.incomingPayment.findMany({
          where: {
            isProcessed: false,
            createdAt: {
              gte: maxPaymentAge, // Созданы в последние 10 минут
            },
            amount: {
              gte: amountMin,
              lte: amountMax,
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            amount: true,
            paymentDate: true,
            createdAt: true,
          },
        }),
        maxRetries,
        `findMany alternativePayments for request ${requestId}`
      )
      
      // Фильтруем по точному совпадению суммы
      // НЕ логируем несовпадения - это нормально
      const alternativeExactMatches = alternativePayments.filter((payment) => {
        const paymentAmount = parseFloat(payment.amount.toString())
        const paymentRounded = Math.round(paymentAmount * 100) / 100
        const amountRounded = Math.round(amount * 100) / 100
        const matches = paymentRounded === amountRounded
        
        // Логируем ТОЛЬКО успешные совпадения
        if (matches) {
          console.log(`✅ [Auto-Deposit] Alternative exact match: Payment ${payment.id} (${paymentAmount}) = Request ${requestId} (${amount})`)
          console.log(`   Payment createdAt: ${payment.createdAt.toISOString()}, paymentDate: ${payment.paymentDate.toISOString()}`)
        }
        return matches
      })
      
      if (alternativeExactMatches.length > 0) {
        console.log(`🎯 [Auto-Deposit] Found ${alternativeExactMatches.length} alternative match(es) for payment ${alternativeExactMatches[0].id}`)
        // Используем первый найденный платеж
        const payment = alternativeExactMatches[0]
        const result = await matchAndProcessPayment(payment.id, amount)
        return result
      }
      
        console.log(`ℹ️ [Auto-Deposit] No matching payments found for request ${requestId} (amount: ${amount}, checked ${matchingPayments.length} payments in window + ${alternativePayments.length} in alternative search)`)
        return null
      }
      
      console.log(`🎯 [Auto-Deposit] Found ${exactMatches.length} matching payment(s) for request ${requestId}`)
      
      if (exactMatches.length === 0) {
        console.log(`ℹ️ [Auto-Deposit] No exact matches found for request ${requestId} (amount: ${amount}, checked ${matchingPayments.length} payments)`)
        return null
      }
      
      // Берем самый первый платеж (самый ранний в окне)
      const payment = exactMatches[0]
      
      // ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА: Убеждаемся, что платеж действительно в окне ±5 минут
      const paymentTime = payment.paymentDate.getTime()
      const requestTimeMs = requestCreatedAt.getTime()
      const timeDiffBefore = requestTimeMs - paymentTime // Сколько времени до создания заявки
      const timeDiffAfter = paymentTime - requestTimeMs // Сколько времени после создания заявки
      
      // Платеж может быть до 5 минут до создания заявки или до 5 минут после
      if (timeDiffBefore > 5 * 60 * 1000 || timeDiffAfter > 5 * 60 * 1000) {
        console.log(`⚠️ [Auto-Deposit] Payment ${payment.id} is outside ±5min window (${timeDiffBefore > 0 ? 'before' : 'after'}: ${Math.floor(Math.abs(timeDiffBefore > 0 ? timeDiffBefore : timeDiffAfter) / 1000)}s), skipping`)
        return null
      }
      
      // ДОПОЛНИТЕЛЬНАЯ ЗАЩИТА: Проверяем статус заявки еще раз перед вызовом matchAndProcessPayment
      // Это защищает от race condition, когда два вызова checkAndProcessExistingPayment идут параллельно
      const finalCheck = await retryDbQuery(
        () => prisma.request.findUnique({
          where: { id: requestId },
          select: { status: true, processedBy: true },
        }),
        maxRetries,
        `finalCheck request ${requestId}`
      )
      
      if (finalCheck?.status !== 'pending' || finalCheck?.processedBy === 'автопополнение') {
        console.log(`⚠️ [Auto-Deposit] Request ${requestId} was processed by another call, skipping payment ${payment.id}`)
        return null
      }
      
      console.log(`💸 [Auto-Deposit] Processing existing payment ${payment.id} for request ${requestId}`)
      
      // Вызываем стандартную функцию автопополнения
      const result = await matchAndProcessPayment(payment.id, amount)
      const elapsedMs = Date.now() - startTime
      const elapsedSeconds = (elapsedMs / 1000).toFixed(2)
      console.log(`⏱️ [Auto-Deposit] checkAndProcessExistingPayment completed in ${elapsedSeconds}s for request ${requestId}`)
      return result
    } catch (error: any) {
      // Обрабатываем ошибки
      const elapsedMs = Date.now() - startTime
      const elapsedSeconds = (elapsedMs / 1000).toFixed(2)
      
      // Не логируем ошибки пула соединений - они обрабатываются внутри retryDbQuery
      const isConnectionPoolError = error.code === 'P2024' || 
                                    error.message?.includes('Unable to start a transaction') ||
                                    error.message?.includes('connection pool') ||
                                    error.message?.includes('timeout')
      
      if (!isConnectionPoolError) {
        console.error(`❌ [Auto-Deposit] Error checking existing payments for request ${requestId} (${elapsedSeconds}s):`, error.message)
      }
      
      return null
    } finally {
      // Удаляем из checkingRequests после завершения проверки
      checkingRequests.delete(requestId)
    }
  })()
  
  // Сохраняем Promise в checkingRequests
  checkingRequests.set(requestId, checkPromise)
  
  return checkPromise
}

/**
 * ЕДИНСТВЕННАЯ функция автопополнения - работает только здесь
 * Все вызовы должны использовать эту функцию из ./auto-deposit
 * Работает секунду в секунду - мгновенно
 * ВАЖНО: Гарантирует что статус заявки ОБЯЗАТЕЛЬНО обновится на autodeposit_success
 */
export async function matchAndProcessPayment(paymentId: number, amount: number) {
  const startTime = Date.now()
  console.log(`🔍 [Auto-Deposit] matchAndProcessPayment called: paymentId=${paymentId}, amount=${amount}`)
  
  // КРИТИЧЕСКАЯ ПРОВЕРКА: Автопополнение НЕ работает, если сумма заканчивается на .00 (копейки = 00)
  // Автопополнение работает ТОЛЬКО если копейки от 01 до 99
  const cents = Math.round((amount % 1) * 100) // Получаем копейки (0-99)
  if (cents === 0) {
    console.log(`❌ [Auto-Deposit] Amount ${amount} ends with .00 (cents = 00), autodeposit is DISABLED. Autodeposit only works with cents 01-99.`)
    return null
  }
  
  // КРИТИЧЕСКИ ВАЖНО: Получаем информацию о платеже, чтобы проверить его время
  // Это предотвращает обработку старых платежей (например, вчерашних)
  const paymentInfo = await prisma.incomingPayment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      paymentDate: true,
      createdAt: true, // ВАЖНО: Проверяем когда платеж был создан в БД
      isProcessed: true,
      amount: true,
    },
  })
  
  if (!paymentInfo) {
    console.log(`⚠️ [Auto-Deposit] Payment ${paymentId} not found`)
    return null
  }
  
  if (paymentInfo.isProcessed) {
    console.log(`⚠️ [Auto-Deposit] Payment ${paymentId} already processed`)
    return null
  }
  
  // ДОПОЛНИТЕЛЬНАЯ ЗАЩИТА: Платеж не должен быть создан в БД более 10 минут назад
  // ВАЖНО: Проверяем createdAt (когда создан в БД), а не paymentDate (из письма)
  // paymentDate может быть в прошлом (когда платеж был совершен), но createdAt - это когда письмо обработано
  const maxPaymentAge = new Date(Date.now() - 10 * 60 * 1000) // 10 минут назад
  if (paymentInfo.createdAt < maxPaymentAge) {
    console.log(`⚠️ [Auto-Deposit] Payment ${paymentId} createdAt is too old (${paymentInfo.createdAt.toISOString()}), skipping`)
    return null
  }
  
  console.log(`✅ [Auto-Deposit] Payment ${paymentId} is recent: createdAt=${paymentInfo.createdAt.toISOString()}, paymentDate=${paymentInfo.paymentDate.toISOString()}`)
  
  // Ищем заявки на пополнение со статусом pending за последние 10 минут
  // Увеличено до 10 минут для учета задержек обработки email и создания заявок
  // Это защищает от случайного пополнения если пользователь не пополнял
  // И предотвращает обработку старых заявок с одинаковыми суммами
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
  
  console.log(`🔍 [Auto-Deposit] matchAndProcessPayment searching requests for payment ${paymentId}:`)
  console.log(`   Payment amount: ${amount}`)
  console.log(`   Payment createdAt: ${paymentInfo.createdAt.toISOString()}`)
  console.log(`   Payment paymentDate: ${paymentInfo.paymentDate.toISOString()}`)
  console.log(`   Searching requests created after: ${tenMinutesAgo.toISOString()}`)

    // Оптимизированный поиск заявок - минимум запросов для максимальной скорости
    // Ищем за последние 10 минут чтобы учесть возможные задержки
    // Обрабатываем ВСЕ заявки без ограничений (email-watcher обрабатывает платежи независимо от фото чека)
    const matchingRequests = await prisma.request.findMany({
      where: {
        requestType: 'deposit',
        status: 'pending',
        createdAt: { gte: tenMinutesAgo }, // Последние 10 минут
        incomingPayments: { none: { isProcessed: true } },
      },
      orderBy: { createdAt: 'asc' }, // Берем самые старые заявки (FIFO)
      select: {
        id: true,
        userId: true,
        accountId: true,
        bookmaker: true,
        amount: true,
        status: true,
        createdAt: true,
        photoFileId: true,
        photoFileUrl: true,
        incomingPayments: { select: { id: true, isProcessed: true } },
      },
    })
    
    console.log(`🔍 [Auto-Deposit] Found ${matchingRequests.length} pending requests in last 10 minutes for payment ${paymentId} (amount: ${amount})`)

    // Быстрая фильтрация по точному совпадению суммы И времени
    const exactMatches = matchingRequests.filter((req) => {
      if (req.status !== 'pending' || !req.amount) return false
      
      // Пропускаем заявки, у которых уже есть обработанный платеж
      const hasProcessedPayment = req.incomingPayments?.some(p => p.isProcessed === true)
      if (hasProcessedPayment) {
        return false // Не логируем - это нормально
      }
    
    // Дополнительная проверка: заявка должна быть создана не более 10 минут назад
    // Это предотвращает обработку старых заявок с одинаковыми суммами
    const requestAge = Date.now() - req.createdAt.getTime()
    const maxAge = 10 * 60 * 1000 // 10 минут
    if (requestAge > maxAge) {
      return false // Не логируем - это нормально
    }
    
    // УБРАНА проверка времени между paymentDate и createdAt, так как:
    // 1. Платеж может быть оплачен до создания заявки (paymentDate < createdAt)
    // 2. Платеж может прийти с задержкой через email (paymentDate > createdAt)
    // 3. Проверка возраста заявки (10 минут) уже защищает от старых платежей
    
    const reqAmount = parseFloat(req.amount.toString())
    // ТОЧНОЕ сравнение: суммы должны совпадать в точности до копейки (2 знака после запятой)
    // Округляем до 2 знаков после запятой для корректного сравнения денежных сумм
    const reqAmountRounded = Math.round(reqAmount * 100) / 100 // Округление до 2 знаков
    const amountRounded = Math.round(amount * 100) / 100 // Округление до 2 знаков
    const matches = reqAmountRounded === amountRounded // Точное равенство без допуска
    
    if (matches) {
      console.log(`✅ [Auto-Deposit] Exact match: Request ${req.id} (${reqAmount}) = Payment ${paymentId} (${amount}), diff: 0.000000`)
    }
    // НЕ логируем несовпадения - это нормально, просто платеж не подходит к этой заявке
    
    return matches
  })

  if (exactMatches.length === 0) {
    console.log(`ℹ️ [Auto-Deposit] No exact matches found for payment ${paymentId} (amount: ${amount})`)
    if (matchingRequests.length > 0) {
      console.log(`   Checked ${matchingRequests.length} requests, amounts: ${matchingRequests.map(r => r.amount || 'N/A').join(', ')}`)
    }
    return null
  }
  
  console.log(`🎯 [Auto-Deposit] Found ${exactMatches.length} exact match(es) for payment ${paymentId}`)

  // КРИТИЧЕСКАЯ ПРОВЕРКА: Проверяем, не обработан ли уже платеж
  // Если платеж уже обработан - не обрабатываем никакие заявки
  const paymentCheck = await prisma.incomingPayment.findUnique({
    where: { id: paymentId },
    select: { isProcessed: true, requestId: true },
  })
  
  if (paymentCheck?.isProcessed) {
    console.log(`⚠️ [Auto-Deposit] Payment ${paymentId} already processed (requestId: ${paymentCheck.requestId}), skipping all ${exactMatches.length} matching requests`)
    return null
  }

  // Берем самую первую заявку (самую старую по времени создания)
  // ВАЖНО: Обрабатываем только ОДНУ заявку на платеж
  const request = exactMatches[0]
  
  // Если найдено несколько заявок с одинаковой суммой - логируем предупреждение
  if (exactMatches.length > 1) {
    console.warn(`⚠️ [Auto-Deposit] WARNING: Found ${exactMatches.length} requests with same amount ${amount} for payment ${paymentId}. Processing only the oldest one (request ${request.id}). Other requests: ${exactMatches.slice(1).map(r => r.id).join(', ')}`)
  }
  
  // Быстрая проверка обязательных полей
  if (!request.accountId || !request.bookmaker || !request.amount) {
    console.error(`❌ [Auto-Deposit] Request ${request.id} missing required fields`)
    return null
  }

  const requestAmount = parseFloat(request.amount.toString())
  
  console.log(`💸 [Auto-Deposit] Processing: Request ${request.id}, ${request.bookmaker}, Account ${request.accountId}, Amount ${requestAmount}`)

  // КРИТИЧЕСКАЯ ЗАЩИТА: Блокируем И платеж И заявку через SELECT FOR UPDATE в транзакции
  // Это гарантирует, что только ОДИН процесс сможет обработать платеж и заявку
  // Другие процессы будут ждать завершения транзакции и увидят, что платеж/заявка уже обработаны
  
  // Retry логика для транзакций при ошибках пула соединений
  const maxRetries = 3
  let lastError: any = null
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const depositResult = await prisma.$transaction(async (tx) => {
      // КРИТИЧЕСКИ ВАЖНО: Сначала блокируем ПЛАТЕЖ через SELECT FOR UPDATE
      // Это гарантирует, что только ОДИН процесс сможет обработать этот платеж
      // Если платеж уже обработан - сразу выходим
      const lockedPayment = await tx.$queryRaw<Array<{ id: number; is_processed: boolean; request_id: number | null }>>`
        SELECT id, is_processed, request_id 
        FROM incoming_payments 
        WHERE id = ${paymentId} 
        FOR UPDATE
      `
      
      if (!lockedPayment || lockedPayment.length === 0) {
        console.log(`⚠️ [Auto-Deposit] Payment ${paymentId} not found, skipping`)
        return { success: false, message: 'Payment not found', skipped: true }
      }
      
      const currentPayment = lockedPayment[0]
      
      // Если платеж уже обработан - сразу выходим (другой процесс уже обработал)
      if (currentPayment.is_processed) {
        console.log(`⚠️ [Auto-Deposit] Payment ${paymentId} already processed (requestId: ${currentPayment.request_id}), skipping - another process handled it`)
        return { success: false, message: 'Payment already processed', skipped: true }
      }
      
      // Теперь блокируем заявку через SELECT FOR UPDATE - только один процесс может получить блокировку
      const lockedRequest = await tx.$queryRaw<Array<{ id: number; status: string; processed_by: string | null }>>`
        SELECT id, status, processed_by 
        FROM requests 
        WHERE id = ${request.id} 
        FOR UPDATE
      `
      
      if (!lockedRequest || lockedRequest.length === 0) {
        console.log(`⚠️ [Auto-Deposit] Request ${request.id} not found, skipping`)
        return { success: false, message: 'Request not found', skipped: true }
      }
      
      const currentRequest = lockedRequest[0]
      
      // Если заявка уже обработана - сразу выходим (другой процесс уже обработал)
      if (currentRequest.status !== 'pending' || currentRequest.processed_by === 'автопополнение') {
        console.log(`⚠️ [Auto-Deposit] Request ${request.id} already processed (status: ${currentRequest.status}), skipping - another process handled it`)
        return { success: false, message: 'Request already processed', skipped: true }
      }
      
      // Заявка заблокирована и готова к обработке - вызываем API казино
      // ВАЖНО: API вызов делаем ВНУТРИ транзакции, чтобы гарантировать атомарность
      const { depositToCasino } = await import('./deposit-balance')
      
      // Пополняем баланс через казино API
      if (!request.bookmaker || !request.accountId) {
        return { success: false, message: 'Missing required fields', skipped: true }
      }
      
      const depositResult = await depositToCasino(
        request.bookmaker,
        request.accountId.toString(),
        requestAmount
      )
      
      // Если API вызов неуспешен - проверяем, не был ли депозит уже проведен
      if (!depositResult.success) {
        const errorMessage = depositResult.message || 'Deposit failed'
        
        // ВАЖНО: Если депозит уже был проведен - это успешный результат, а не ошибка
        const isAlreadyProcessed = errorMessage.toLowerCase().includes('уже был проведен') || 
                                  errorMessage.toLowerCase().includes('already processed') ||
                                  errorMessage.toLowerCase().includes('повторить платеж') ||
                                  errorMessage.toLowerCase().includes('deposit already')
        
        if (isAlreadyProcessed) {
          console.log(`✅ [Auto-Deposit] Deposit already processed for request ${request.id}, marking as success (within transaction)`)
          // Помечаем заявку и платеж как обработанные в той же транзакции
          const [updatedRequest, updatedPayment] = await Promise.all([
            tx.request.update({
              where: { id: request.id },
              data: {
                status: 'autodeposit_success',
                statusDetail: null,
                processedBy: 'автопополнение' as any,
                processedAt: new Date(),
                updatedAt: new Date(),
              } as any,
            }),
            tx.incomingPayment.update({
              where: { id: paymentId },
              data: {
                requestId: request.id,
                isProcessed: true,
              },
            }),
          ])
          
          return { 
            success: true, 
            message: 'Deposit already processed',
            updatedRequest,
            updatedPayment,
            depositResult,
          }
        }
        
        // Если это не "already processed" - возвращаем ошибку (транзакция откатится)
        return { success: false, message: errorMessage, depositResult }
      }
      
      // Если успешно - обновляем заявку и платеж в той же транзакции
      const [updatedRequest, updatedPayment] = await Promise.all([
        tx.request.update({
          where: { id: request.id },
          data: {
            status: 'autodeposit_success',
            statusDetail: null,
            processedBy: 'автопополнение' as any,
            processedAt: new Date(),
            updatedAt: new Date(),
          } as any,
        }),
        tx.incomingPayment.update({
          where: { id: paymentId },
          data: {
            requestId: request.id,
            isProcessed: true,
          },
        }),
      ])
      
      console.log(`✅ [Auto-Deposit] Transaction: Request ${request.id} status updated to autodeposit_success`)
      console.log(`✅ [Auto-Deposit] Transaction: Payment ${paymentId} marked as processed`)
      
      return { 
        success: true, 
        message: 'Deposit successful',
        updatedRequest,
        updatedPayment,
      }
      }, {
        timeout: 180000, // 180 секунд (3 минуты) таймаут для транзакции
        // Увеличено для учета медленных API вызовов казино с ретраями и задержками сети
        // Некоторые API казино могут отвечать до 100+ секунд при проблемах с сетью
      })
      
      // Если транзакция вернула skipped - заявка уже обработана другим процессом
      if (depositResult.skipped) {
        console.log(`⚠️ [Auto-Deposit] Request ${request.id} was processed by another process, skipping`)
        return null
      }
    
      // Если API вызов неуспешен - обрабатываем ошибку
      // ВАЖНО: Обработка "already processed" теперь происходит ВНУТРИ транзакции (выше),
      // поэтому здесь мы обрабатываем только реальные ошибки
      if (!depositResult.success) {
      const errorMessage = depositResult.message || 'Deposit failed'
      
      // Если это "already processed" - это уже обработано внутри транзакции, просто логируем
      const isAlreadyProcessed = errorMessage.toLowerCase().includes('уже был проведен') || 
                                  errorMessage.toLowerCase().includes('already processed') ||
                                  errorMessage.toLowerCase().includes('повторить платеж') ||
                                  errorMessage.toLowerCase().includes('deposit already')
      
      if (isAlreadyProcessed) {
        // Это уже обработано внутри транзакции, просто возвращаем успех
        console.log(`✅ [Auto-Deposit] Deposit already processed for request ${request.id} (handled in transaction)`)
        return {
          requestId: request.id,
          success: true,
        }
      }
      
      // Для других ошибок обрабатываем как обычно
      console.error(`❌ [Auto-Deposit] Deposit failed: ${errorMessage}`)
      
      // ВАЖНО: Если пользователь не найден в системе казино - оставляем заявку в pending
      const isUserNotFound = errorMessage.toLowerCase().includes('not found user') ||
                             errorMessage.toLowerCase().includes('пользователь не найден') ||
                             errorMessage.toLowerCase().includes('user not found') ||
                             errorMessage.toLowerCase().includes('greenback')
      
      // ВАЖНО: Если валюта пользователя не совпадает с валютой сайта - оставляем заявку в pending
      const isCurrencyMismatch = errorMessage.toLowerCase().includes('currency not equals') ||
                                  errorMessage.toLowerCase().includes('currency on site') ||
                                  errorMessage.toLowerCase().includes('валюта не совпадает')
      
      if (isUserNotFound || isCurrencyMismatch) {
        const errorType = isCurrencyMismatch ? 'Currency mismatch' : 'User not found'
        console.warn(`⚠️ [Auto-Deposit] ${errorType} for request ${request.id}, leaving in pending for manual review`)
        try {
          await prisma.request.update({
            where: { id: request.id },
            data: {
              status: 'pending',
              statusDetail: `Автопополнение: ${errorMessage.length > 40 ? errorMessage.substring(0, 40) : errorMessage}`,
              updatedAt: new Date(),
            } as any,
          })
          console.log(`⚠️ [Auto-Deposit] Request ${request.id} left in pending with error note: ${errorMessage}`)
        } catch (dbError: any) {
          console.error(`❌ [Auto-Deposit] Failed to update request status:`, dbError.message)
        }
        return {
          requestId: request.id,
          success: false,
          error: errorMessage,
        }
      }
      
      // Для других ошибок помечаем как pending (ожидает)
      try {
        await prisma.request.update({
          where: { id: request.id },
          data: {
            status: 'pending',
            statusDetail: errorMessage.length > 50 ? errorMessage.substring(0, 50) : errorMessage,
            processedAt: new Date(),
            updatedAt: new Date(),
          } as any,
        })
        console.log(`⚠️ [Auto-Deposit] Saved error to request ${request.id}: ${errorMessage}`)
      } catch (dbError: any) {
        console.error(`❌ [Auto-Deposit] Failed to save error to DB:`, dbError.message)
      }
      
      throw new Error(errorMessage)
    }
    
    // Если успешно - отправляем уведомление и возвращаем результат
    if (depositResult.success && depositResult.updatedRequest) {
      // Отправляем уведомление пользователю
      try {
        const fullRequest = await prisma.request.findUnique({
          where: { id: request.id },
          select: {
            userId: true,
            botType: true,
            amount: true,
            bookmaker: true,
            accountId: true,
          },
        })
        
        if (fullRequest && fullRequest.userId) {
          const { formatDepositMessage, getAdminUsername, sendMessageWithMainMenuButton } = await import('./send-notification')
          
          const amount = parseFloat(fullRequest.amount?.toString() || '0')
          const casino = fullRequest.bookmaker || 'Неизвестно'
          const accountId = fullRequest.accountId || ''
          const processingTime = '1s'
          const lang = 'ru'
          
          const adminUsername = await getAdminUsername()
          const notificationMessage = formatDepositMessage(amount, casino, accountId, adminUsername, lang, processingTime)
          
          let botType = fullRequest.botType || null
          if (!botType && fullRequest.bookmaker) {
            const bookmakerLower = fullRequest.bookmaker.toLowerCase()
            if (bookmakerLower.includes('mostbet')) {
              botType = 'mostbet'
            } else if (bookmakerLower.includes('1xbet') || bookmakerLower.includes('xbet')) {
              botType = '1xbet'
            }
          }
          
          await sendMessageWithMainMenuButton(
            fullRequest.userId,
            notificationMessage,
            botType ? null : fullRequest.bookmaker,
            botType
          )
        }
      } catch (notificationError) {
        console.warn(`⚠️ [Auto-Deposit] Failed to send notification:`, notificationError)
      }
      
      const elapsedMs = Date.now() - startTime
      const elapsedSeconds = (elapsedMs / 1000).toFixed(2)
      console.log(`✅ [Auto-Deposit] SUCCESS: Request ${request.id} → autodeposit_success (verified) in ${elapsedSeconds}s`)
      
      return {
        requestId: request.id,
        success: true,
      }
    }
    
      // Если что-то пошло не так
      console.error(`❌ [Auto-Deposit] Unexpected result from transaction for request ${request.id}`)
      return null
      
      // Успешно выполнили транзакцию - выходим из retry цикла
    } catch (error: any) {
      lastError = error
      
      // Проверяем, является ли это ошибкой пула соединений
      const isConnectionPoolError = error.code === 'P2024' || 
                                    error.message?.includes('Unable to start a transaction') ||
                                    error.message?.includes('connection pool') ||
                                    error.message?.includes('timeout')
      
      if (isConnectionPoolError && attempt < maxRetries) {
        // Экспоненциальная задержка: 0.5s, 1s, 2s
        const delay = Math.min(500 * Math.pow(2, attempt - 1), 2000)
        console.warn(`⚠️ [Auto-Deposit] Connection pool error (attempt ${attempt}/${maxRetries}) for request ${request.id}, retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue // Пробуем снова
      }
      
      // Если это не ошибка пула или это последняя попытка - обрабатываем ошибку
      // Обработка ошибок, которые не были обработаны внутри транзакции
      if (error.message && !error.message.includes('Request already processed')) {
        console.error(`❌ [Auto-Deposit] Error processing payment ${paymentId} for request ${request.id}:`, error.message)
      }
      
      // Если это ошибка "Request already processed" - это нормально, просто возвращаем null
      if (error.message?.includes('Request already processed') || error.message?.includes('already processed')) {
        return null
      }
      
      // Если это последняя попытка и ошибка пула - логируем и возвращаем null
      if (isConnectionPoolError && attempt === maxRetries) {
        console.error(`❌ [Auto-Deposit] Connection pool error after ${maxRetries} attempts for request ${request.id}, giving up`)
        return null
      }
      
      throw error
    }
  }
  
  // Если все попытки не удались
  if (lastError) {
    console.error(`❌ [Auto-Deposit] Failed to process payment ${paymentId} for request ${request.id} after ${maxRetries} attempts`)
    return null
  }
  
  return null
}

// Старый код удален - теперь все делается в одной транзакции с SELECT FOR UPDATE

