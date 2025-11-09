import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createApiResponse } from '@/lib/api-helpers'

/**
 * API endpoint для ручного запуска сопоставления платежей
 * POST /api/auto-deposit/match
 * Body: { paymentId } или пустой для проверки всех необработанных платежей
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { paymentId } = body

    if (paymentId) {
      // Обрабатываем конкретный платеж
      const payment = await prisma.incomingPayment.findUnique({
        where: { id: paymentId },
      })

      if (!payment) {
        return NextResponse.json(
          createApiResponse(null, 'Payment not found'),
          { status: 404 }
        )
      }

      if (payment.isProcessed) {
        return NextResponse.json(
          createApiResponse(null, 'Payment already processed'),
          { status: 400 }
        )
      }

      const result = await matchAndProcessPayment(paymentId, parseFloat(payment.amount.toString()))
      return NextResponse.json(createApiResponse(result, 'Processing completed'))
    } else {
      // Проверяем все необработанные платежи за последний час
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
      const unprocessedPayments = await prisma.incomingPayment.findMany({
        where: {
          isProcessed: false,
          paymentDate: {
            gte: oneHourAgo,
          },
        },
        orderBy: {
          paymentDate: 'desc',
        },
      })

      const results = []
      for (const payment of unprocessedPayments) {
        try {
          const result = await matchAndProcessPayment(
            payment.id,
            parseFloat(payment.amount.toString())
          )
          results.push({ paymentId: payment.id, result })
        } catch (error: any) {
          results.push({ paymentId: payment.id, error: error.message })
        }
      }

      return NextResponse.json(
        createApiResponse(
          {
            processed: results.filter((r) => !r.error).length,
            failed: results.filter((r) => r.error).length,
            results,
          },
          'Batch processing completed'
        )
      )
    }
  } catch (error: any) {
    console.error('❌ Error in auto-deposit match:', error)
    return NextResponse.json(
      createApiResponse(null, `Error: ${error.message}`),
      { status: 500 }
    )
  }
}

/**
 * Функция для сопоставления входящего платежа с заявкой и автоматического пополнения
 */
async function matchAndProcessPayment(paymentId: number, amount: number) {
  // Ищем заявки на пополнение со статусом pending за последние 5 минут
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)

  // Ищем заявки с точным совпадением суммы (с точностью до копеек)
  const matchingRequests = await prisma.request.findMany({
    where: {
      requestType: 'deposit',
      status: 'pending',
      createdAt: {
        gte: fiveMinutesAgo,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  // Фильтруем вручную, т.к. Prisma может иметь проблемы с точным сравнением Decimal
  const exactMatches = matchingRequests.filter((req) => {
    if (!req.amount) return false
    const reqAmount = parseFloat(req.amount.toString())
    return Math.abs(reqAmount - amount) < 0.01 // Точность до 1 копейки
  })

  if (exactMatches.length === 0) {
    return null
  }

  const request = exactMatches[0]

  if (!request.accountId || !request.bookmaker) {
    return null
  }

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

    return {
      requestId: request.id,
      success: true,
    }
  } catch (error: any) {
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

