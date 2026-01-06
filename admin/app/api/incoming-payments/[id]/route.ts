import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createApiResponse } from '@/lib/api-helpers'

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id)

    if (isNaN(id)) {
      return NextResponse.json(
        createApiResponse(null, 'Invalid payment ID'),
        { status: 400 }
      )
    }

    // Проверяем, существует ли пополнение
    const payment = await prisma.incomingPayment.findUnique({
      where: { id },
    })

    if (!payment) {
      return NextResponse.json(
        createApiResponse(null, 'Payment not found'),
        { status: 404 }
      )
    }

    // Проверяем, не обработано ли уже пополнение
    if (payment.isProcessed) {
      return NextResponse.json(
        createApiResponse(null, 'Cannot delete processed payment'),
        { status: 400 }
      )
    }

    // Удаляем пополнение
    await prisma.incomingPayment.delete({
      where: { id },
    })

    console.log(`✅ Deleted incoming payment ${id}`)

    return NextResponse.json(
      createApiResponse({ id }, undefined, 'Payment deleted successfully'),
      {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  } catch (error: any) {
    console.error('Delete incoming payment error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to delete payment'),
      {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  }
}

export const dynamic = 'force-dynamic'

