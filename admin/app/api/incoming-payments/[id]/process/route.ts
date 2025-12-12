import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    requireAuth(request)

    const id = parseInt(params.id)
    const body = await request.json()
    const requestId = body.requestId

    // Обновляем пополнение: помечаем как обработанное и связываем с заявкой
    const updatedPayment = await prisma.incomingPayment.update({
      where: { id },
      data: {
        isProcessed: true,
        requestId: requestId ? parseInt(requestId) : null,
      },
    })

    return NextResponse.json(
      createApiResponse({
        id: updatedPayment.id,
        amount: updatedPayment.amount.toString(),
        isProcessed: updatedPayment.isProcessed,
        requestId: updatedPayment.requestId,
      })
    )
  } catch (error: any) {
    console.error('Process payment error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to process payment'),
      { status: 500 }
    )
  }
}








