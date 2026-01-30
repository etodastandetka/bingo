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

    // Проверяем, есть ли копейки в запросе (если сумма целая, например 3000, то копейки = 0)
    const hasCents = amountValue % 1 !== 0

    if (exactAmount) {
      // Когда "Точная сумма" включена - ищем ТОЧНОЕ совпадение суммы (500.52 = 500.52)
      // ОПТИМИЗАЦИЯ: Используем более точное сравнение для Decimal
      // Decimal(10, 2) хранит 2 знака после запятой, поэтому погрешность 0.0001 достаточна
      const tolerance = 0.0001
      where.amount = {
        gte: amountValue - tolerance,
        lte: amountValue + tolerance,
      }
    } else {
      // Когда "Точная сумма" выключена - ищем по целой части (например, все пополнения на 3000.XX)
      // Это позволяет найти все варианты с разными копейками (3000.00, 3000.01, 3000.82, 3000.99 и т.д.)
      const wholePart = Math.floor(amountValue)
      // ОПТИМИЗАЦИЯ: Используем более точный диапазон для лучшей производительности индекса
      // Используем диапазон, который включает все суммы от wholePart.00 до (wholePart+1).00 (не включая)
      // Это гарантирует, что суммы с .00 (например, 10.00, 1000.00) тоже будут найдены
      where.amount = {
        gte: wholePart, // Начинаем с целой части (включая .00)
        lt: wholePart + 1, // До следующего целого числа (не включая)
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

    // ОПТИМИЗАЦИЯ: Ограничиваем количество результатов для производительности
    // Показываем максимум 200 результатов (этого достаточно для большинства случаев)
    const MAX_RESULTS = 200
    
    // Получаем похожие пополнения с лимитом для производительности
    // Оптимизация: используем select вместо include для уменьшения объема данных
    const payments = await prisma.incomingPayment.findMany({
      where,
      orderBy: { paymentDate: 'desc' },
      take: MAX_RESULTS, // Ограничиваем количество результатов
      select: {
        id: true,
        amount: true,
        bank: true,
        paymentDate: true,
        createdAt: true,
        notificationText: true,
        isProcessed: true,
        requestId: true,
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

    // ОПТИМИЗАЦИЯ: Сортируем результаты только если нужно
    // Если exactAmount=false, сортируем результаты: сначала все варианты с разными копейками
    // Сортируем по сумме (чтобы варианты с разными копейками были вместе), затем по дате
    let sortedPayments = payments
    if (!exactAmount && payments.length > 0) {
      // ОПТИМИЗАЦИЯ: Используем более эффективную сортировку
      // Создаем массив только один раз
      sortedPayments = payments.sort((a, b) => {
        const amountA = parseFloat(a.amount.toString())
        const amountB = parseFloat(b.amount.toString())
        // Сначала сортируем по сумме (чтобы все 3000.XX были вместе)
        if (amountA !== amountB) {
          return amountA - amountB
        }
        // Если суммы равны, сортируем по дате (новые сначала)
        const dateA = a.paymentDate ? new Date(a.paymentDate).getTime() : 0
        const dateB = b.paymentDate ? new Date(b.paymentDate).getTime() : 0
        return dateB - dateA
      })
    }

    return NextResponse.json(
      createApiResponse({
        payments: sortedPayments.map(p => ({
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

