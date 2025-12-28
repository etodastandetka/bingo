/**
 * Автоматическое пополнение баланса при совпадении входящих платежей с заявками
 */
import { prisma } from './prisma'
import { depositToCasino } from './deposit-balance'
import { sendNotificationToUser, formatDepositMessage, getAdminUsername } from './send-notification'

interface MatchResult {
  success: boolean
  requestId?: number
  message?: string
}

/**
 * Сопоставление платежа с заявкой и автоматическое пополнение
 * Ищет заявки на пополнение со статусом pending за последние 5 минут
 */
export async function matchAndProcessPayment(
  paymentId: number,
  amount: number
): Promise<MatchResult> {
  // Проверяем, включено ли автопополнение
  const autodepositSetting = await prisma.botSetting.findUnique({
    where: { key: 'autodeposit_enabled' },
  })
  
  console.log(`[Auto-Deposit] Checking autodeposit setting:`, {
    found: !!autodepositSetting,
    value: autodepositSetting?.value,
    valueType: typeof autodepositSetting?.value,
    valueString: autodepositSetting?.value ? String(autodepositSetting.value) : null
  })
  
  const isAutodepositEnabled = autodepositSetting && (
    (typeof autodepositSetting.value === 'string' && (autodepositSetting.value.toLowerCase() === 'true' || autodepositSetting.value === '1')) ||
    (typeof autodepositSetting.value === 'boolean' && autodepositSetting.value) ||
    (typeof autodepositSetting.value === 'number' && autodepositSetting.value === 1) ||
    (autodepositSetting.value !== null && String(autodepositSetting.value).toLowerCase() === 'true') ||
    (autodepositSetting.value !== null && String(autodepositSetting.value) === '1')
  )
  
  console.log(`[Auto-Deposit] Autodeposit enabled: ${isAutodepositEnabled}`)
  
  if (!isAutodepositEnabled) {
    console.log(`⚠️ Auto-deposit is disabled, skipping payment ${paymentId}`)
    return {
      success: false,
      message: 'Auto-deposit is disabled',
    }
  }

  // Ищем заявки на пополнение со статусом pending за последние 10 минут (увеличено)
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)

  console.log(
    `🔍 Matching payment ${paymentId}: looking for requests with amount ${amount} created after ${tenMinutesAgo.toISOString()}`
  )

  const matchingRequests = await prisma.request.findMany({
    where: {
      requestType: 'deposit',
      status: 'pending',
      createdAt: {
        gte: tenMinutesAgo,
      },
      // Исключаем заявки, которые уже имеют связанный обработанный платеж
      incomingPayments: {
        none: {
          isProcessed: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc', // Берем самую старую заявку (первую по времени)
    },
    include: {
      incomingPayments: {
        where: {
          isProcessed: true,
        },
      },
    },
  })

  console.log(
    `📋 Found ${matchingRequests.length} pending deposit requests in the last 10 minutes (without processed payments)`
  )

  // Фильтруем вручную, т.к. Prisma может иметь проблемы с точным сравнением Decimal
  // И дополнительно проверяем, что у заявки нет обработанных платежей
  console.log(`[Auto-Deposit] Filtering ${matchingRequests.length} requests for exact amount match: ${amount}`)
  
  const exactMatches = matchingRequests.filter((req) => {
    // Пропускаем заявки, у которых уже есть обработанный платеж
    if (req.incomingPayments && req.incomingPayments.length > 0) {
      console.log(`[Auto-Deposit] Request ${req.id} skipped: already has processed payment`)
      return false
    }

    if (!req.amount) {
      console.log(`[Auto-Deposit] Request ${req.id} skipped: no amount`)
      return false
    }
    
    const reqAmount = parseFloat(req.amount.toString())
    const diff = Math.abs(reqAmount - amount)
    const isMatch = diff < 0.01 // Точность до 1 копейки
    
    console.log(`[Auto-Deposit] Request ${req.id}: amount=${reqAmount}, diff=${diff}, match=${isMatch}`)
    
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
  try {
    const depositResult = await depositToCasino(
      request.bookmaker,
      request.accountId,
      parseFloat(request.amount?.toString() || '0')
    )

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

    // Отправляем уведомление пользователю
    try {
      const user = await prisma.botUser.findUnique({
        where: { userId: request.userId },
        select: { language: true },
      }).catch(() => null)
      const lang = user?.language || 'ru'

      const adminUsername = await getAdminUsername()
      const amount = parseFloat(request.amount?.toString() || '0')
      const casino = request.bookmaker || 'Неизвестно'
      const accountId = request.accountId || ''

      const notificationMessage = formatDepositMessage(amount, casino, accountId, adminUsername, lang)
      
      console.log(`📨 [Auto-Deposit] Attempting to send notification to user ${request.userId.toString()}, bookmaker: ${request.bookmaker}, requestId: ${request.id}`)
      
      // Передаем bookmaker и requestId для правильной отправки уведомления
      const notificationResult = await sendNotificationToUser(request.userId, notificationMessage, request.bookmaker, request.id)
      
      if (notificationResult.success) {
        console.log(`✅ [Auto-Deposit] Notification sent successfully to user ${request.userId.toString()} for request ${request.id}`)
      } else {
        console.error(`❌ [Auto-Deposit] Failed to send notification to user ${request.userId.toString()} for request ${request.id}: ${notificationResult.error}`)
      }
      
      // Отправляем главное меню после уведомления
      const { sendMainMenuToUser } = await import('./send-notification')
      await sendMainMenuToUser(request.userId, request.bookmaker).catch((error) => {
        console.warn('⚠️ [Auto-Deposit] Failed to send main menu after autodeposit:', error)
      })
    } catch (notificationError) {
      // Логируем ошибки отправки уведомлений с деталями
      console.error(`❌ [Auto-Deposit] Exception while sending notification after autodeposit for request ${request.id}:`, notificationError)
    }

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

