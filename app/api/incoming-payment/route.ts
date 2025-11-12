import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createApiResponse } from '@/lib/api-helpers'

/**
 * API endpoint для сохранения входящих платежей из email watcher или Android приложения
 * POST /api/incoming-payment
 * Body: { amount, bank, paymentDate, notificationText }
 */

// CORS handler
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const { amount, bank, paymentDate, notificationText } = body

    if (!amount) {
      return NextResponse.json(
        createApiResponse(null, 'Amount is required'),
        { status: 400 }
      )
    }

    // Создаем запись о входящем платеже
    const incomingPayment = await prisma.incomingPayment.create({
      data: {
        amount: parseFloat(amount),
        bank: bank || null,
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        notificationText: notificationText || null,
        isProcessed: false,
      },
    })

    console.log(`✅ IncomingPayment saved: ID ${incomingPayment.id}, Amount: ${amount} ${bank || ''}`)

    // Пытаемся найти совпадение по сумме и автоматически пополнить баланс
    // Делаем это асинхронно, чтобы не блокировать ответ
    matchAndProcessPayment(incomingPayment.id, parseFloat(amount)).catch((error) => {
      console.error(`⚠️ Auto-match failed for payment ${incomingPayment.id}:`, error)
      // Не возвращаем ошибку, т.к. платеж уже сохранен
    })

    const response = NextResponse.json(
      createApiResponse(
        {
          id: incomingPayment.id,
          amount: incomingPayment.amount.toString(),
          bank: incomingPayment.bank,
          paymentDate: incomingPayment.paymentDate.toISOString(),
        },
        'Incoming payment saved'
      )
    )
    
    // Добавляем CORS заголовки
    response.headers.set('Access-Control-Allow-Origin', '*')
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    
    return response
  } catch (error: any) {
    console.error('❌ Error saving incoming payment:', error)
    const errorResponse = NextResponse.json(
      createApiResponse(null, `Error: ${error.message}`),
      { status: 500 }
    )
    errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return errorResponse
  }
}

/**
 * Функция для сопоставления входящего платежа с заявкой и автоматического пополнения
 */
async function matchAndProcessPayment(paymentId: number, amount: number) {
  // Ищем заявки на пополнение со статусом pending за последние 30 минут (увеличено с 5 минут)
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)

  console.log(`🔍 Matching payment ${paymentId}: looking for requests with amount ${amount} created after ${thirtyMinutesAgo.toISOString()}`)

  // Ищем заявки с точным совпадением суммы (с точностью до копеек)
  const matchingRequests = await prisma.request.findMany({
    where: {
      requestType: 'deposit',
      status: 'pending',
      createdAt: {
        gte: thirtyMinutesAgo,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  console.log(`📋 Found ${matchingRequests.length} pending deposit requests in the last 30 minutes`)

  // Фильтруем вручную, т.к. Prisma может иметь проблемы с точным сравнением Decimal
  const exactMatches = matchingRequests.filter((req) => {
    if (!req.amount) {
      console.log(`⚠️ Request ${req.id} has no amount`)
      return false
    }
    const reqAmount = parseFloat(req.amount.toString())
    const diff = Math.abs(reqAmount - amount)
    const matches = diff < 0.01 // Точность до 1 копейки
    if (matches) {
      console.log(`✅ Exact match found: Request ${req.id}, amount ${reqAmount} ≈ payment ${amount} (diff: ${diff})`)
    }
    return matches
  })

  if (exactMatches.length === 0) {
    console.log(`ℹ️ No matching request found for payment ${paymentId} (amount: ${amount})`)
    console.log(`   Searched ${matchingRequests.length} requests. Amounts found: ${matchingRequests.map(r => r.amount?.toString() || 'N/A').join(', ')}`)
    return null
  }

  console.log(`🎯 Found ${exactMatches.length} exact match(es) for payment ${paymentId}`)

  const request = exactMatches[0]

  if (!request.accountId || !request.bookmaker) {
    console.warn(`⚠️ Request ${request.id} missing accountId or bookmaker`)
    console.warn(`   accountId: ${request.accountId}, bookmaker: ${request.bookmaker}`)
    return null
  }

  console.log(`🔍 Found matching request: ID ${request.id}, Account: ${request.accountId}, Bookmaker: ${request.bookmaker}`)
  console.log(`   Request amount: ${request.amount}, Payment amount: ${amount}`)

  // Обновляем статус платежа - связываем с заявкой
  await prisma.incomingPayment.update({
    where: { id: paymentId },
    data: {
      requestId: request.id,
      isProcessed: true,
    },
  })

  // Пополняем баланс через казино API
  try {
    const { depositToCasino } = await import('@/lib/deposit-balance')
    const depositResult = await depositToCasino(
      request.bookmaker!,
      request.accountId,
      parseFloat(request.amount?.toString() || '0')
    )

    if (!depositResult.success) {
      throw new Error(depositResult.message || 'Deposit failed')
    }

    // Успешное пополнение - обновляем статус заявки
    await prisma.request.update({
      where: { id: request.id },
      data: {
        status: 'autodeposit_success',
        statusDetail: 'auto_completed',
        processedAt: new Date(),
        updatedAt: new Date(),
      },
    })

    console.log(`✅ Auto-deposit successful: Request ${request.id}, Account ${request.accountId}`)

    // Отправляем уведомление пользователю
    if (request.userId && request.bookmaker && request.accountId && request.amount) {
      const { sendDepositSuccessNotification } = await import('@/lib/telegram-notifications')
      await sendDepositSuccessNotification(
        request.userId,
        parseFloat(request.amount.toString()),
        request.bookmaker,
        request.accountId
      )
    }

    return {
      requestId: request.id,
      success: true,
    }
  } catch (error: any) {
    console.error(`❌ Auto-deposit failed for request ${request.id}:`, error)

    // В случае ошибки API казино, ставим статус profile-5
    await prisma.request.update({
      where: { id: request.id },
      data: {
        status: 'profile-5',
        statusDetail: 'api_error',
        processedAt: new Date(),
        updatedAt: new Date(),
      },
    })

    throw error
  }
}

