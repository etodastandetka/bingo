import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'

/**
 * API endpoint для привязки входящего платежа к заявке
 * POST /api/incoming-payment/[id]/link
 * Body: { requestId }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    requireAuth(request)

    const paymentId = parseInt(params.id)
    const body = await request.json()
    const { requestId } = body

    if (!requestId) {
      return NextResponse.json(
        createApiResponse(null, 'requestId is required'),
        { status: 400 }
      )
    }

    // Проверяем, что платеж существует
    const payment = await prisma.incomingPayment.findUnique({
      where: { id: paymentId },
    })

    if (!payment) {
      return NextResponse.json(
        createApiResponse(null, 'Payment not found'),
        { status: 404 }
      )
    }

    // Проверяем, что платеж еще не обработан для другой заявки
    if (payment.isProcessed && payment.requestId && payment.requestId !== requestId) {
      return NextResponse.json(
        createApiResponse(null, 'Payment is already processed for another request'),
        { status: 400 }
      )
    }

    // Привязываем платеж к заявке
    const updatedPayment = await prisma.incomingPayment.update({
      where: { id: paymentId },
      data: {
        requestId: parseInt(requestId),
        isProcessed: true,
      },
    })

    // Проверяем, совпадает ли сумма платежа с суммой заявки
    const linkedRequest = await prisma.request.findUnique({
      where: { id: parseInt(requestId) },
    })

    if (linkedRequest) {
      const paymentAmount = parseFloat(updatedPayment.amount.toString())
      const requestAmount = parseFloat(linkedRequest.amount?.toString() || '0')
      
      // Если сумма совпадает (с точностью до 1 копейки), автоматически обновляем статус заявки
      if (Math.abs(paymentAmount - requestAmount) < 0.01) {
        // Обновляем статус заявки на completed (успешно)
        await prisma.request.update({
          where: { id: parseInt(requestId) },
          data: {
            status: 'completed',
            statusDetail: null, // "успешно" - без statusDetail
            processedAt: new Date(),
            updatedAt: new Date(),
          },
        })
        
        // Если это депозит, пополняем баланс через казино API
        if (linkedRequest.requestType === 'deposit' && linkedRequest.bookmaker && linkedRequest.accountId) {
          try {
            const { depositToCasino } = await import('@/lib/deposit-balance')
            await depositToCasino(
              linkedRequest.bookmaker,
              linkedRequest.accountId,
              requestAmount
            )
            console.log(`✅ Auto-deposit successful after linking payment: Request ${requestId}, Account ${linkedRequest.accountId}`)
          } catch (error: any) {
            console.error(`❌ Auto-deposit failed after linking payment:`, error)
            // Не возвращаем ошибку, т.к. платеж уже привязан
          }
        }
      }
    }

    return NextResponse.json(
      createApiResponse({
        id: updatedPayment.id,
        requestId: updatedPayment.requestId,
        isProcessed: updatedPayment.isProcessed,
      }, 'Payment linked to request')
    )
  } catch (error: any) {
    console.error('❌ Error linking payment:', error)
    return NextResponse.json(
      createApiResponse(null, `Error: ${error.message}`),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

