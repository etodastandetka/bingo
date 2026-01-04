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
    const processedOnlyParam = searchParams.get('processedOnly')
    // Если параметр не передан или пустой - undefined (показываем все)
    // Если 'true' - true (только обработанные)
    // Если 'false' - false (только необработанные, но сейчас не используется)
    const processedOnly = processedOnlyParam === null || processedOnlyParam === '' ? undefined : processedOnlyParam === 'true'
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
      // Когда "Точная сумма" включена - ищем ТОЧНОЕ совпадение суммы (400.63 = 400.63)
      where.amount = amountValue
    } else {
      // Когда "Точная сумма" выключена - ищем по целой части (например, все пополнения на 400.XX)
      const wholePart = Math.floor(amountValue)
      where.amount = {
        gte: wholePart,
        lt: wholePart + 1,
      }
    }

    // Фильтр по обработанным: 
    // - Если processedOnly=true, показываем только обработанные (isProcessed=true)
    // - Если processedOnly=undefined (параметр не передан), показываем все пополнения (не добавляем фильтр)
    if (processedOnly === true) {
      where.isProcessed = true
    }
    // Если processedOnly === undefined, не добавляем фильтр - показываем все пополнения

    // Исключаем текущую заявку, если указана
    if (requestId) {
      where.requestId = {
        not: parseInt(requestId),
      }
    }

    // Получаем похожие пополнения (без лимита, чтобы показать все пополнения на эту сумму)
    const payments = await prisma.incomingPayment.findMany({
      where,
      orderBy: { paymentDate: 'desc' },
      // Убрали take: 50, чтобы показать все пополнения на эту сумму
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

