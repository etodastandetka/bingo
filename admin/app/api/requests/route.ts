import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'
import { addLog } from '@/lib/logs'

// Отключаем кеширование для реального времени (автообновление каждые 3 секунды)
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    requireAuth(request)

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') // deposit or withdraw
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    
    // Для главной страницы (pending/deferred) показываем все заявки без лимита
    const isMainPage = status === 'pending' || status === 'deferred'
    const limit = isMainPage 
      ? 10000 // Очень большой лимит для главной страницы (показываем все)
      : parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    const where: any = {}
    if (type) where.requestType = type
    if (status && status !== 'left') {
      if (status === 'pending') {
        // Для "Ожидающие" показываем все незавершенные заявки
        // Исключаем завершенные статусы: completed, approved, auto_completed, autodeposit_success, rejected, declined
        where.status = {
          notIn: ['completed', 'approved', 'auto_completed', 'autodeposit_success', 'rejected', 'declined']
        }
      } else {
        // Для других статусов (например, 'deferred') используем точное совпадение
        where.status = status
      }
    } else if (status === 'left') {
      // Для "Оставленные" фильтруем все кроме pending - включая autodeposit_success
      where.status = { not: 'pending' }
    }
    
    // Показываем все заявки (pending и pending_check) даже без чека
    // Заявки на проверке (statusDetail = 'pending_check') и ожидающие (status = 'pending') 
    // отображаются независимо от наличия чека

    // Убрали лишние логи и запросы для оптимизации

    const [requests, total] = await Promise.all([
      prisma.request.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          userId: true,
          username: true,
          firstName: true,
          lastName: true,
          bookmaker: true,
          accountId: true,
          bank: true,
          amount: true,
          requestType: true,
          status: true,
          statusDetail: true,
          processedBy: true,
          createdAt: true,
          // Исключаем большие поля, которые не нужны для списка
          // photoFileUrl: false, // Не загружаем фото в списке
          // phone: false, // Не загружаем телефон в списке
        },
      }),
      prisma.request.count({ where }),
    ])

    // Убрали лишние логи для оптимизации

    const response = NextResponse.json(
      createApiResponse({
        requests: requests.map(r => ({
          ...r,
          userId: r.userId.toString(), // Преобразуем BigInt в строку
          amount: r.amount ? r.amount.toString() : null,
          createdAt: r.createdAt ? r.createdAt.toISOString() : null,
          status_detail: r.statusDetail ?? null, // для совместимости с UI (snake_case)
          processedBy: r.processedBy ?? null,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      })
    )
    
    // Отключаем кеширование для актуальных данных
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    
    return response
  } catch (error: any) {
    console.error('❌ Requests API - Error fetching requests:', {
      error: error.message,
      stack: error.stack,
      name: error.name
    })
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to fetch requests'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    requireAuth(request)

    const body = await request.json()
    const {
      userId,
      username,
      firstName,
      lastName,
      bookmaker,
      accountId,
      amount,
      requestType,
      bank,
      phone,
    } = body

    // Валидация типа - должен быть 'deposit' или 'withdraw'
    const validRequestType = (requestType === 'deposit' || requestType === 'withdraw') 
      ? requestType 
      : 'deposit'

    if (!userId || !amount) {
      return NextResponse.json(
        createApiResponse(null, 'Missing required fields: userId, amount'),
        { status: 400 }
      )
    }

    if (!requestType || (requestType !== 'deposit' && requestType !== 'withdraw')) {
      console.warn('⚠️ Requests API: Invalid or missing requestType, using "deposit" as default', { 
        receivedType: requestType 
      })
    }

    const userIdBigInt = BigInt(userId)

    // Синхронизируем пользователя в BotUser при создании заявки
    const { ensureUserExists } = await import('@/lib/sync-user')
    await ensureUserExists(userIdBigInt, {
      username: username || null,
      firstName: firstName || null,
      lastName: lastName || null,
    })

    // Проверяем активные заявки на пополнение для этого пользователя
    if (validRequestType === 'deposit') {
      const activeDepositRequest = await prisma.request.findFirst({
        where: {
          userId: userIdBigInt,
          requestType: 'deposit',
          status: {
            in: ['pending', 'pending_check']
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      })

      if (activeDepositRequest) {
        const timeAgo = Math.floor((Date.now() - activeDepositRequest.createdAt.getTime()) / 1000 / 60) // минуты назад
        const errorMessage = `У вас уже есть активная заявка на пополнение (ID: #${activeDepositRequest.id}, создана ${timeAgo} мин. назад). Пожалуйста, дождитесь обработки первой заявки перед созданием новой.`
        
        return NextResponse.json(
          createApiResponse(
            null,
            errorMessage
          ),
          { status: 400 }
        )
      }
    }

    // КРИТИЧНО: Проверяем и исправляем сумму для deposit - не должна заканчиваться на .00
    let amountDecimal = new Prisma.Decimal(parseFloat(amount))
    if (validRequestType === 'deposit') {
      const amountNum = parseFloat(amount)
      const cents = Math.round((amountNum % 1) * 100)
      if (cents === 0) {
        // Сумма заканчивается на .00 - генерируем случайные копейки от 1 до 99
        const randomCents = Math.floor(Math.random() * 99) + 1
        const correctedAmount = Math.floor(amountNum) + randomCents / 100
        amountDecimal = new Prisma.Decimal(correctedAmount.toFixed(2))
        console.error(`❌ Requests API - CRITICAL: Amount ended with .00, corrected to:`, correctedAmount.toFixed(2))
      }
    }

    const newRequest = await prisma.request.create({
      data: {
        userId: userIdBigInt,
        username: username || null,
        firstName: firstName || null,
        lastName: lastName || null,
        bookmaker: bookmaker || null,
        accountId: accountId || null,
        amount: amountDecimal,
        requestType: validRequestType, // Используем валидированный тип
        bank: bank || null,
        phone: phone || null,
        status: 'pending',
      },
    })

    return NextResponse.json(
      createApiResponse({
        ...newRequest,
        amount: newRequest.amount ? newRequest.amount.toString() : null,
      })
    )
  } catch (error: any) {
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to create request'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

