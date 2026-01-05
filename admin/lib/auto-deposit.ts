import { prisma } from './prisma'

/**
 * Проверяет существующие необработанные платежи для заявки и вызывает автопополнение
 * Используется когда заявка создается ПОСЛЕ того, как платеж уже был обработан email-watcher'ом
 */
export async function checkAndProcessExistingPayment(requestId: number, amount: number) {
  const startTime = Date.now()
  console.log(`🔍 [Auto-Deposit] checkAndProcessExistingPayment called: requestId=${requestId}, amount=${amount}`)
  
  try {
    // КРИТИЧЕСКАЯ ЗАЩИТА: Проверяем статус заявки ПЕРЕД поиском платежей
    // Если заявка уже обработана - сразу выходим, не тратим время на поиск платежей
    const requestCheck = await prisma.request.findUnique({
      where: { id: requestId },
      select: { 
        status: true, 
        processedBy: true,
        incomingPayments: {
          where: { isProcessed: true },
          select: { id: true },
          take: 1,
        },
      },
    })
    
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
    
    // Ищем необработанные платежи с такой же суммой за последние 10 минут
    // 10 минут - больше чем 5 минут в matchAndProcessPayment, чтобы учесть задержки
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
    
    // ОПТИМИЗАЦИЯ: Фильтруем по сумме прямо в БД (приблизительно)
    // Используем очень маленький диапазон ±0.0001 только для ошибок округления при поиске в БД
    // В финальной проверке будет точное сравнение
    const amountMin = amount - 0.0001
    const amountMax = amount + 0.0001
    
    // ОГРАНИЧИВАЕМ количество записей для производительности
    // За 10 минут вряд ли будет больше 50 необработанных платежей с такой суммой
    // Если платеж был недавно, он будет среди последних (отсортированных по дате)
    const matchingPayments = await prisma.incomingPayment.findMany({
      where: {
        isProcessed: false,
        paymentDate: { gte: tenMinutesAgo },
        amount: {
          gte: amountMin,
          lte: amountMax,
        },
      },
      orderBy: { paymentDate: 'desc' },
      take: 50, // Уменьшено до 50, так как уже фильтруем по сумме в БД
      select: {
        id: true,
        amount: true,
        paymentDate: true,
      },
    })
    
    console.log(`🔍 [Auto-Deposit] Found ${matchingPayments.length} unprocessed payments in last 10 minutes (amount range: ${amountMin}-${amountMax}) for request ${requestId}`)
    
    // Фильтруем по ТОЧНОМУ совпадению суммы (без допуска)
    const exactMatches = matchingPayments.filter((payment) => {
      const paymentAmount = parseFloat(payment.amount.toString())
      // Точное сравнение: суммы должны совпадать полностью (включая копейки)
      // Используем очень маленький допуск (0.0001) только для ошибок округления float
      const diff = Math.abs(paymentAmount - amount)
      const matches = diff < 0.0001 // Только для ошибок округления, не для допуска копеек
      if (matches) {
        console.log(`✅ [Auto-Deposit] Exact match found: Payment ${payment.id} (${paymentAmount}) = Request ${requestId} (${amount}), diff: ${diff.toFixed(6)}`)
      }
      return matches
    })
    
    if (exactMatches.length === 0) {
      console.log(`ℹ️ [Auto-Deposit] No matching payments found for request ${requestId} (amount: ${amount}, checked ${matchingPayments.length} payments)`)
      return null
    }
    
    console.log(`🎯 [Auto-Deposit] Found ${exactMatches.length} matching payment(s) for request ${requestId}`)
    
    // Берем самый первый платеж (самый старый)
    const payment = exactMatches[exactMatches.length - 1]
    
    // ДОПОЛНИТЕЛЬНАЯ ЗАЩИТА: Проверяем статус заявки еще раз перед вызовом matchAndProcessPayment
    // Это защищает от race condition, когда два вызова checkAndProcessExistingPayment идут параллельно
    const finalCheck = await prisma.request.findUnique({
      where: { id: requestId },
      select: { status: true, processedBy: true },
    })
    
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
    const elapsedMs = Date.now() - startTime
    const elapsedSeconds = (elapsedMs / 1000).toFixed(2)
    console.error(`❌ [Auto-Deposit] Error checking existing payments for request ${requestId} (${elapsedSeconds}s):`, error.message)
    return null
  }
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
  
  // Ищем заявки на пополнение со статусом pending за последние 10 минут
  // Увеличено до 10 минут для учета задержек обработки email и создания заявок
  // Это защищает от случайного пополнения если пользователь не пополнял
  // И предотвращает обработку старых заявок с одинаковыми суммами
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)

  // Оптимизированный поиск заявок - минимум запросов для максимальной скорости
  // Ищем за последние 10 минут чтобы учесть возможные задержки
  // Обрабатываем ВСЕ заявки без ограничений
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
      incomingPayments: { select: { id: true, isProcessed: true } },
    },
  })

  // Быстрая фильтрация по точному совпадению суммы
  const exactMatches = matchingRequests.filter((req) => {
    if (req.status !== 'pending' || !req.amount) return false
    
    // Пропускаем заявки, у которых уже есть обработанный платеж
    const hasProcessedPayment = req.incomingPayments?.some(p => p.isProcessed === true)
    if (hasProcessedPayment) {
      console.log(`⚠️ [Auto-Deposit] Request ${req.id} already has processed payment, skipping`)
      return false
    }
    
    // Дополнительная проверка: заявка должна быть создана не более 10 минут назад
    const requestAge = Date.now() - req.createdAt.getTime()
    const maxAge = 10 * 60 * 1000 // 10 минут
    if (requestAge > maxAge) {
      console.log(`⚠️ [Auto-Deposit] Request ${req.id} is too old (${Math.floor(requestAge / 1000)}s), skipping`)
      return false
    }
    
    const reqAmount = parseFloat(req.amount.toString())
    // Точное сравнение: суммы должны совпадать полностью (включая копейки)
    // Используем очень маленький допуск (0.0001) только для ошибок округления float
    const diff = Math.abs(reqAmount - amount)
    const matches = diff < 0.0001 // Только для ошибок округления, не для допуска копеек
    
    if (matches) {
      console.log(`✅ [Auto-Deposit] Exact match: Request ${req.id} (${reqAmount}) = Payment ${amount} (diff: ${diff.toFixed(6)}, age: ${Math.floor(requestAge / 1000)}s)`)
    }
    
    return matches
  })

  if (exactMatches.length === 0) {
    console.log(`ℹ️ [Auto-Deposit] No exact matches found for payment ${paymentId} (amount: ${amount})`)
    return null
  }
  
  console.log(`🎯 [Auto-Deposit] Found ${exactMatches.length} exact match(es) for payment ${paymentId}`)

  // Берем самую первую заявку (самую старую по времени создания)
  const request = exactMatches[0]
  
  // Быстрая проверка обязательных полей
  if (!request.accountId || !request.bookmaker || !request.amount) {
    console.error(`❌ [Auto-Deposit] Request ${request.id} missing required fields`)
    return null
  }

  const requestAmount = parseFloat(request.amount.toString())
  
  console.log(`💸 [Auto-Deposit] Processing: Request ${request.id}, ${request.bookmaker}, Account ${request.accountId}, Amount ${requestAmount}`)

  // КРИТИЧЕСКАЯ ЗАЩИТА: Блокируем заявку через SELECT FOR UPDATE в транзакции
  // Это гарантирует, что только ОДИН процесс сможет обработать заявку
  // Другие процессы будут ждать завершения транзакции и увидят, что заявка уже обработана
  try {
    const depositResult = await prisma.$transaction(async (tx) => {
      // Блокируем заявку через SELECT FOR UPDATE - только один процесс может получить блокировку
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
      
      // Проверяем, что платеж еще не обработан
      const currentPayment = await tx.incomingPayment.findUnique({
        where: { id: paymentId },
        select: { isProcessed: true },
      })
      
      if (currentPayment?.isProcessed) {
        console.log(`⚠️ [Auto-Deposit] Payment ${paymentId} already processed, skipping`)
        return { success: false, message: 'Payment already processed', skipped: true }
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
      
      // Если API вызов неуспешен - возвращаем ошибку (транзакция откатится)
      if (!depositResult.success) {
        return { success: false, message: depositResult.message || 'Deposit failed', depositResult }
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
      timeout: 30000, // 30 секунд таймаут для транзакции
    })
    
    // Если транзакция вернула skipped - заявка уже обработана другим процессом
    if (depositResult.skipped) {
      console.log(`⚠️ [Auto-Deposit] Request ${request.id} was processed by another process, skipping`)
      return null
    }
    
    // Если API вызов неуспешен - обрабатываем ошибку
    if (!depositResult.success) {
      const errorMessage = depositResult.message || 'Deposit failed'
      
      // ВАЖНО: Если депозит уже был проведен - это успешный результат, а не ошибка
      const isAlreadyProcessed = errorMessage.toLowerCase().includes('уже был проведен') || 
                                  errorMessage.toLowerCase().includes('already processed') ||
                                  errorMessage.toLowerCase().includes('повторить платеж')
      
      if (isAlreadyProcessed) {
        console.log(`✅ [Auto-Deposit] Deposit already processed for request ${request.id}, marking as success`)
        // Помечаем заявку как успешную, так как депозит уже был проведен
        try {
          await prisma.request.update({
            where: { id: request.id },
            data: {
              status: 'autodeposit_success',
              statusDetail: null,
              processedBy: 'автопополнение' as any,
              processedAt: new Date(),
              updatedAt: new Date(),
            } as any,
          })
          console.log(`✅ [Auto-Deposit] Request ${request.id} marked as autodeposit_success (deposit already processed)`)
          
          // Помечаем платеж как обработанный
          try {
            await prisma.incomingPayment.update({
              where: { id: paymentId },
              data: {
                requestId: request.id,
                isProcessed: true,
              },
            })
          } catch (paymentError) {
            console.warn(`⚠️ [Auto-Deposit] Failed to mark payment ${paymentId} as processed:`, paymentError)
          }
          
          return {
            requestId: request.id,
            success: true,
          }
        } catch (dbError: any) {
          console.error(`❌ [Auto-Deposit] Failed to mark request as success:`, dbError.message)
          throw new Error(`Failed to update request status: ${dbError.message}`)
        }
      }
      
      // Для других ошибок обрабатываем как обычно
      console.error(`❌ [Auto-Deposit] Deposit failed: ${errorMessage}`)
      
      // ВАЖНО: Если пользователь не найден в системе казино - оставляем заявку в pending
      const isUserNotFound = errorMessage.toLowerCase().includes('not found user') ||
                             errorMessage.toLowerCase().includes('пользователь не найден') ||
                             errorMessage.toLowerCase().includes('user not found') ||
                             errorMessage.toLowerCase().includes('greenback')
      
      if (isUserNotFound) {
        console.warn(`⚠️ [Auto-Deposit] User not found in casino for request ${request.id}, leaving in pending for manual review`)
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
      
      // Для других ошибок помечаем как api_error
      try {
        await prisma.request.update({
          where: { id: request.id },
          data: {
            status: 'api_error',
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
  } catch (error: any) {
    // Обработка ошибок, которые не были обработаны внутри транзакции
    if (error.message && !error.message.includes('Request already processed')) {
      console.error(`❌ [Auto-Deposit] Error processing payment ${paymentId} for request ${request.id}:`, error.message)
    }
    
    // Если это ошибка "Request already processed" - это нормально, просто возвращаем null
    if (error.message?.includes('Request already processed') || error.message?.includes('already processed')) {
      return null
    }
    
    throw error
  }
}

// Старый код удален - теперь все делается в одной транзакции с SELECT FOR UPDATE

