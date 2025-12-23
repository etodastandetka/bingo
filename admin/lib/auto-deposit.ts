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
  // Ищем заявки на пополнение со статусом pending за последние 5 минут
  // Уменьшено до 5 минут для более точного сопоставления
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)

  console.log(
    `🔍 Matching payment ${paymentId}: looking for requests with amount ${amount} created after ${fiveMinutesAgo.toISOString()}`
  )

  const matchingRequests = await prisma.request.findMany({
    where: {
      requestType: 'deposit',
      status: 'pending',
      createdAt: {
        gte: fiveMinutesAgo,
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
    `📋 Found ${matchingRequests.length} pending deposit requests in the last 5 minutes (without processed payments)`
  )

  // Фильтруем вручную, т.к. Prisma может иметь проблемы с точным сравнением Decimal
  // И дополнительно проверяем, что у заявки нет обработанных платежей
  const exactMatches = matchingRequests.filter((req) => {
    // Пропускаем заявки, у которых уже есть обработанный платеж
    if (req.incomingPayments && req.incomingPayments.length > 0) {
      return false
    }

    if (!req.amount) return false
    const reqAmount = parseFloat(req.amount.toString())
    return Math.abs(reqAmount - amount) < 0.01 // Точность до 1 копейки
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
  const existingProcessedPayment = await prisma.incomingPayment.findFirst({
    where: {
      id: paymentId,
      isProcessed: true,
    },
  })

  if (existingProcessedPayment) {
    console.log(`⚠️ Payment ${paymentId} is already processed, skipping`)
    return {
      success: false,
      message: 'Payment already processed',
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

  // Обновляем статус платежа - связываем с заявкой
  await prisma.incomingPayment.update({
    where: { id: paymentId },
    data: {
      requestId: request.id,
      isProcessed: true,
    },
  })

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
      
      await sendNotificationToUser(request.userId, notificationMessage)
      console.log(`📨 Notification sent to user ${request.userId.toString()}`)
    } catch (notificationError) {
      // Игнорируем ошибки отправки уведомлений
      console.warn('Failed to send notification after autodeposit:', notificationError)
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

