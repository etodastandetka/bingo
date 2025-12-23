import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    requireAuth(request)

    const { searchParams } = new URL(request.url)
    const amount = searchParams.get('amount')
    const exactAmount = searchParams.get('exactAmount') === 'true'
    const processedOnly = searchParams.get('processedOnly') === 'true'
    const requestId = searchParams.get('requestId')

    if (!amount) {
      return NextResponse.json(
        createApiResponse(null, 'Amount parameter is required'),
        { status: 400 }
      )
    }

    // Парсим сумму с поддержкой формата с запятыми (1,000.67)
    // Убираем все запятые, которые используются как разделители тысяч
    const cleanedAmount = amount.replace(/,/g, '')
    const amountValue = parseFloat(cleanedAmount)
    if (isNaN(amountValue)) {
      return NextResponse.json(
        createApiResponse(null, 'Invalid amount'),
        { status: 400 }
      )
    }

    // Строим условие для поиска
    const where: any = {}

    if (exactAmount) {
      // Точное совпадение суммы
      where.amount = amountValue
    } else {
      // Поиск по целой части суммы (например, все пополнения на 1000.XX)
      const wholePart = Math.floor(amountValue)
      where.amount = {
        gte: wholePart,
        lt: wholePart + 1,
      }
    }

    // Фильтр по обработанным: если checked (processedOnly=true), показываем только обработанные (isProcessed=true)
    // Если unchecked (processedOnly=false), показываем только необработанные (isProcessed=false)
    where.isProcessed = processedOnly

    // Исключаем текущую заявку, если указана
    if (requestId) {
      where.requestId = {
        not: parseInt(requestId),
      }
    }

    // Получаем похожие пополнения
    const payments = await prisma.incomingPayment.findMany({
      where,
      orderBy: { paymentDate: 'desc' },
      take: 50,
      include: {
        request: {
          select: {
            id: true,
            userId: true,
            username: true,
            firstName: true,
            lastName: true,
            requestType: true,
            status: true,
          },
        },
      },
    })

    return NextResponse.json(
      createApiResponse({
        payments: payments.map(p => ({
          id: p.id,
          amount: p.amount.toString(),
          bank: p.bank,
          paymentDate: p.paymentDate ? p.paymentDate.toISOString() : null,
          createdAt: p.createdAt ? p.createdAt.toISOString() : null,
          notificationText: p.notificationText,
          isProcessed: p.isProcessed,
          requestId: p.requestId,
          request: p.request ? {
            id: p.request.id,
            userId: p.request.userId.toString(),
            username: p.request.username,
            firstName: p.request.firstName,
            lastName: p.request.lastName,
            requestType: p.request.requestType,
            status: p.request.status,
          } : null,
        })),
      })
    )
  } catch (error: any) {
    console.error('Search incoming payments error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to search payments'),
      { status: 500 }
    )
  }
}

