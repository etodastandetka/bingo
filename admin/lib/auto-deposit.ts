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

  // КРИТИЧЕСКАЯ ЗАЩИТА: Проверяем статус ПЕРЕД вызовом API казино
  // Это предотвращает двойное зачисление, если два вызова идут параллельно
  const preCheck = await prisma.request.findUnique({
    where: { id: request.id },
    select: { status: true, processedBy: true },
  })
  
  if (preCheck?.status !== 'pending' || preCheck?.processedBy === 'автопополнение') {
    console.log(`⚠️ [Auto-Deposit] Request ${request.id} already processed before API call (status: ${preCheck?.status}), skipping`)
    return null
  }

  // Оптимизированная обработка: все в одной транзакции для максимальной скорости
  try {
    const { depositToCasino } = await import('./deposit-balance')
    
    // Сразу пополняем баланс через казино API (самое важное - делаем мгновенно)
    const depositResult = await depositToCasino(
      request.bookmaker,
      request.accountId,
      requestAmount
    )

    if (!depositResult.success) {
      const errorMessage = depositResult.message || 'Deposit failed'
      
      // ВАЖНО: Если депозит уже был проведен - это успешный результат, а не ошибка
      const isAlreadyProcessed = errorMessage.toLowerCase().includes('уже был проведен') || 
                                  errorMessage.toLowerCase().includes('already processed') ||
                                  errorMessage.toLowerCase().includes('повторить платеж')
      
      if (isAlreadyProcessed) {
        console.log(`✅ [Auto-Deposit] Deposit already processed for request ${request.id}, marking as success`)
        // Помечаем заявку как успешную, так как депозит уже был проведен
        // Это означает, что заявка уже обработана ранее
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
      // для ручной проверки администратором (возможно, неправильный accountId или пользователь не зарегистрирован)
      const isUserNotFound = errorMessage.toLowerCase().includes('not found user') ||
                             errorMessage.toLowerCase().includes('пользователь не найден') ||
                             errorMessage.toLowerCase().includes('user not found') ||
                             errorMessage.toLowerCase().includes('greenback')
      
      if (isUserNotFound) {
        console.warn(`⚠️ [Auto-Deposit] User not found in casino for request ${request.id}, leaving in pending for manual review`)
        // Оставляем заявку в pending, но добавляем пометку об ошибке в statusDetail
        try {
          await prisma.request.update({
            where: { id: request.id },
            data: {
              status: 'pending', // Оставляем в pending для ручной проверки
              statusDetail: `Автопополнение: ${errorMessage.length > 40 ? errorMessage.substring(0, 40) : errorMessage}`,
              updatedAt: new Date(),
            } as any,
          })
          console.log(`⚠️ [Auto-Deposit] Request ${request.id} left in pending with error note: ${errorMessage}`)
        } catch (dbError: any) {
          console.error(`❌ [Auto-Deposit] Failed to update request status:`, dbError.message)
        }
        // НЕ помечаем платеж как обработанный, чтобы можно было попробовать снова
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
    
    // После успешного пополнения - атомарно обновляем все в одной транзакции
    // ВАЖНО: Проверяем что заявка все еще pending и не была обработана автопополнением
    // ВАЖНО: Используем транзакцию чтобы гарантировать что статус ОБЯЗАТЕЛЬНО обновится
    const updateResult = await prisma.$transaction(async (tx) => {
      // Проверяем что заявка все еще pending и платеж не обработан
      const [currentRequest, currentPayment] = await Promise.all([
        tx.request.findUnique({
          where: { id: request.id },
          select: { status: true, processedBy: true },
        }),
        tx.incomingPayment.findUnique({
          where: { id: paymentId },
          select: { isProcessed: true },
        }),
      ])
      
      // Если уже обработано - пропускаем (защита от двойного пополнения)
      if (currentRequest?.status !== 'pending' || currentPayment?.isProcessed) {
        console.log(`⚠️ [Auto-Deposit] Request ${request.id} already processed (status: ${currentRequest?.status}), skipping`)
        return { skipped: true }
      }
      
      // Дополнительная проверка: если заявка уже обработана автопополнением - не трогаем
      if (currentRequest?.processedBy === 'автопополнение') {
        console.log(`⚠️ [Auto-Deposit] Request ${request.id} already processed by autodeposit, skipping`)
        return { skipped: true }
      }
      
      // Обновляем заявку и платеж атомарно - ВАЖНО: это должно обязательно выполниться
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
      
      return { updatedRequest, updatedPayment, skipped: false }
    })
    
    // Проверяем что транзакция действительно обновила статус
    if (updateResult?.skipped) {
      console.log(`⚠️ [Auto-Deposit] Transaction skipped for request ${request.id} (already processed by another process)`)
      
      // ВАЖНО: Если API вызов был успешен, но транзакция пропущена (заявка уже обработана),
      // все равно помечаем платеж как обработанный, чтобы избежать повторной обработки
      // Это защита от race condition, когда два процесса обрабатывают одну заявку
      try {
        const currentPayment = await prisma.incomingPayment.findUnique({
          where: { id: paymentId },
          select: { isProcessed: true, requestId: true },
        })
        
        // Помечаем платеж как обработанный только если он еще не обработан
        if (currentPayment && !currentPayment.isProcessed) {
          await prisma.incomingPayment.update({
            where: { id: paymentId },
            data: {
              isProcessed: true,
              requestId: request.id, // Связываем с заявкой, даже если она уже обработана
            },
          })
          console.log(`✅ [Auto-Deposit] Payment ${paymentId} marked as processed (request ${request.id} was already processed by another process)`)
        } else if (currentPayment?.isProcessed) {
          console.log(`ℹ️ [Auto-Deposit] Payment ${paymentId} already marked as processed`)
        }
      } catch (paymentError: any) {
        console.warn(`⚠️ [Auto-Deposit] Failed to mark payment ${paymentId} as processed:`, paymentError.message)
      }
      
      return null
    }
    
    if (!updateResult?.updatedRequest) {
      console.error(`❌ [Auto-Deposit] Transaction failed to update request ${request.id}`)
      throw new Error('Failed to update request status in transaction')
    }
    
    // Дополнительная проверка что статус действительно обновился
    const verifyRequest = await prisma.request.findUnique({
      where: { id: request.id },
      select: { status: true, processedBy: true },
    })
    
    if (verifyRequest?.status !== 'autodeposit_success') {
      console.error(`❌ [Auto-Deposit] CRITICAL: Request ${request.id} status is ${verifyRequest?.status}, expected autodeposit_success`)
      throw new Error(`Failed to update request status: current status is ${verifyRequest?.status}`)
    }
    
    const elapsedMs = Date.now() - startTime
    const elapsedSeconds = (elapsedMs / 1000).toFixed(2)
    console.log(`✅ [Auto-Deposit] SUCCESS: Request ${request.id} → autodeposit_success (verified) in ${elapsedSeconds}s`)

    // Отправляем уведомление пользователю в правильный бот с правильным текстом
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
        // Импортируем функции для отправки уведомления
        const { formatDepositMessage, getAdminUsername, sendMessageWithMainMenuButton } = await import('./send-notification')
        
        const amount = parseFloat(fullRequest.amount?.toString() || '0')
        const casino = fullRequest.bookmaker || 'Неизвестно'
        const accountId = fullRequest.accountId || ''
        const processingTime = '1s' // Для автопополнения всегда 1 секунда
        const lang = 'ru' // Дефолтный язык
        
        // Получаем username админа для сообщения
        const adminUsername = await getAdminUsername()
        
        // Форматируем сообщение
        const notificationMessage = formatDepositMessage(amount, casino, accountId, adminUsername, lang, processingTime)
        
        // Определяем botType из заявки
        let botType = fullRequest.botType || null
        
        // Если botType не указан, пытаемся определить из bookmaker
        if (!botType && fullRequest.bookmaker) {
          const bookmakerLower = fullRequest.bookmaker.toLowerCase()
          if (bookmakerLower.includes('mostbet')) {
            botType = 'mostbet'
          } else if (bookmakerLower.includes('1xbet') || bookmakerLower.includes('xbet')) {
            botType = '1xbet'
          }
        }
        
        console.log(`📨 [Auto-Deposit] Sending notification to user ${fullRequest.userId.toString()}, botType: ${botType || 'main'}, requestId: ${request.id}`)
        
        // Отправляем уведомление в правильный бот
        const notificationResult = await sendMessageWithMainMenuButton(
          fullRequest.userId,
          notificationMessage,
          botType ? null : fullRequest.bookmaker, // bookmaker только если botType не указан
          botType
        )
        
        if (notificationResult.success) {
          console.log(`✅ [Auto-Deposit] Notification sent successfully to user ${fullRequest.userId.toString()} for request ${request.id}`)
        } else {
          console.error(`❌ [Auto-Deposit] Failed to send notification for request ${request.id}: ${notificationResult.error}`)
        }
      }
    } catch (notificationError: any) {
      // Не блокируем выполнение если уведомление не отправилось
      console.error(`❌ Error sending notification for request ${request.id}:`, notificationError)
    }

    const totalElapsedMs = Date.now() - startTime
    const totalElapsedSeconds = (totalElapsedMs / 1000).toFixed(2)
    console.log(`⏱️ [Auto-Deposit] Total processing time: ${totalElapsedSeconds}s for payment ${paymentId} → request ${request.id}`)
    
    return {
      requestId: request.id,
      success: true,
    }
  } catch (error: any) {
    const elapsedMs = Date.now() - startTime
    const elapsedSeconds = (elapsedMs / 1000).toFixed(2)
    console.error(`❌ [Auto-Deposit] FAILED for request ${request.id} (${elapsedSeconds}s):`, error.message)
    throw error
  }
}

