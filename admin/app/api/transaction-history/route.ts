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

// Отключаем кеширование для реального времени
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('user_id')
    const type = searchParams.get('type') // deposit, withdraw, or empty for all
    const skip = parseInt(searchParams.get('skip') || '0')
    const take = parseInt(searchParams.get('take') || '50') // По умолчанию 50 за раз

    const where: any = {}
    if (userId) {
      where.userId = BigInt(userId)
    }
    if (type) {
      where.requestType = type
    }

    // Пагинация для бесконечной прокрутки
    const requests = await prisma.request.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        userId: true,
        accountId: true,
        username: true,
        firstName: true,
        lastName: true,
        requestType: true,
        amount: true,
        status: true,
        statusDetail: true,
        bookmaker: true,
        bank: true,
        phone: true,
        createdAt: true,
        processedAt: true,
        processedBy: true,
      },
    })

    const transactions = requests.map((r) => {
      // Приоритет: firstName/lastName > username
      let displayName = 'Unknown'
      if (r.firstName && r.lastName) {
        displayName = `${r.firstName} ${r.lastName}`
      } else if (r.firstName) {
        displayName = r.firstName
      } else if (r.lastName) {
        displayName = r.lastName
      } else if (r.username) {
        displayName = `@${r.username}`
      }

      return {
        id: r.id.toString(),
        user_id: r.userId.toString(),
        account_id: r.accountId || '',
        user_display_name: displayName,
        username: r.username || '',
        first_name: r.firstName || '',
        last_name: r.lastName || '',
      type: r.requestType,
      amount: r.amount ? parseFloat(r.amount.toString()) : 0,
      status: r.status,
      status_detail: r.statusDetail || null,
      bookmaker: r.bookmaker || '',
      bank: r.bank || '',
      phone: r.phone || '',
      date: r.createdAt.toISOString(),
      created_at: r.createdAt.toISOString(),
      processed_at: r.processedAt?.toISOString() || null,
      processed_by: r.processedBy || null,
      }
    })

    // Получаем общее количество для информации (опционально, можно убрать для производительности)
    const total = await prisma.request.count({ where })

    const response = NextResponse.json(createApiResponse({ 
      transactions,
      pagination: {
        skip,
        take,
        total,
        hasMore: skip + take < total
      }
    }))
    response.headers.set('Access-Control-Allow-Origin', '*')
    // Отключаем кеширование для актуальных данных
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    return response
  } catch (error: any) {
    console.error('Transaction history error:', error)
    const errorResponse = NextResponse.json(
      createApiResponse(null, error.message || 'Failed to fetch transaction history'),
      { status: 500 }
    )
    errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return errorResponse
  }
}

