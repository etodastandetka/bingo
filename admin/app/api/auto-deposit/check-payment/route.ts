import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'
import { matchAndProcessPayment } from '@/lib/auto-deposit'

export const dynamic = 'force-dynamic'

/**
 * API endpoint для автоматической проверки и обработки поступлений для заявки
 * Проверяет наличие необработанного поступления с точной суммой в окне ±5 минут от createdAt
 */
export async function POST(request: NextRequest) {
  try {
    requireAuth(request)

    const body = await request.json()
    const { requestId, amount, createdAt } = body

    if (!requestId || !amount || !createdAt) {
      return NextResponse.json(
        createApiResponse(null, 'requestId, amount, and createdAt are required'),
        { status: 400 }
      )
    }

    // Проверяем статус заявки
    const requestData = await prisma.request.findUnique({
      where: { id: parseInt(requestId) },
      select: {
        id: true,
        status: true,
        processedBy: true,
        amount: true,
        createdAt: true,
        incomingPayments: {
          where: { isProcessed: true },
          select: { id: true },
          take: 1,
        },
      },
    })

    // Если заявка уже обработана - возвращаем успех (уже обработано)
    if (!requestData || requestData.status !== 'pending') {
      return NextResponse.json(
        createApiResponse({ processed: false, reason: 'Request already processed' }),
        { status: 200 }
      )
    }

    // Если уже есть обработанный платеж - возвращаем успех
    if (requestData.incomingPayments.length > 0) {
      return NextResponse.json(
        createApiResponse({ processed: false, reason: 'Payment already processed' }),
        { status: 200 }
      )
    }

    // Если заявка уже обработана автопополнением - возвращаем успех
    if (requestData.processedBy === 'автопополнение') {
      return NextResponse.json(
        createApiResponse({ processed: false, reason: 'Already processed by autodeposit' }),
        { status: 200 }
      )
    }

    // Проверяем окно ±5 минут от createdAt
    const requestCreatedAt = new Date(createdAt)
    const windowStart = new Date(requestCreatedAt.getTime() - 5 * 60 * 1000) // 5 минут до
    const windowEnd = new Date(requestCreatedAt.getTime() + 5 * 60 * 1000) // 5 минут после

    // Ищем необработанные платежи с точной суммой в окне ±5 минут
    const amountValue = parseFloat(amount.toString())
    const tolerance = 0.001 // Точность для сравнения Decimal

    const matchingPayments = await prisma.incomingPayment.findMany({
      where: {
        isProcessed: false,
        amount: {
          gte: amountValue - tolerance,
          lte: amountValue + tolerance,
        },
        paymentDate: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
      orderBy: { paymentDate: 'asc' },
      take: 1, // Берем самое первое поступление
      select: {
        id: true,
        amount: true,
        paymentDate: true,
      },
    })

    if (matchingPayments.length === 0) {
      return NextResponse.json(
        createApiResponse({ processed: false, reason: 'No matching payment found' }),
        { status: 200 }
      )
    }

    const payment = matchingPayments[0]
    const paymentAmount = parseFloat(payment.amount.toString())

    // Проверяем точное совпадение суммы (включая копейки)
    const diff = Math.abs(paymentAmount - amountValue)
    if (diff >= 0.01) {
      return NextResponse.json(
        createApiResponse({ processed: false, reason: 'Amount mismatch' }),
        { status: 200 }
      )
    }

    // Вызываем автопополнение
    try {
      await matchAndProcessPayment(payment.id, paymentAmount)
      return NextResponse.json(
        createApiResponse({ processed: true, paymentId: payment.id }),
        { status: 200 }
      )
    } catch (error: any) {
      console.error(`❌ Error processing payment ${payment.id} for request ${requestId}:`, error)
      return NextResponse.json(
        createApiResponse(null, error.message || 'Failed to process payment'),
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('Auto-deposit check-payment error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to check payment'),
      { status: 500 }
    )
  }
}
