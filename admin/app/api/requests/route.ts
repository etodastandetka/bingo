import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
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
    // Уменьшаем лимит для быстрой загрузки
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    const where: any = {}
    if (type) where.requestType = type
    if (status && status !== 'left') {
      // Статус 'left' не существует в БД, это специальный фильтр для UI
      where.status = status
    } else if (status === 'left') {
      // Для "Оставленные" фильтруем все кроме pending - включая autodeposit_success
      where.status = { not: 'pending' }
    }
    
    // ВАЖНО: Показываем только заявки с фото чека в дашборде (чтобы заявки без чека не мешались)
    // Исключение: обработанные заявки (не pending) показываем всегда, даже без чека
    // Автопополнение работает в фоне для всех заявок, но pending заявки без чека не показываем
    if (status !== 'left' && (!status || status === 'pending')) {
      // Для pending заявок показываем только с чеком
      where.photoFileUrl = { not: null }
    }
    // Для обработанных заявок (left) показываем все, даже без чека

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

    const newRequest = await prisma.request.create({
      data: {
        userId: userIdBigInt,
        username: username || null,
        firstName: firstName || null,
        lastName: lastName || null,
        bookmaker: bookmaker || null,
        accountId: accountId || null,
        amount: parseFloat(amount),
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

