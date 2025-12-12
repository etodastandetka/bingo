import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createApiResponse } from '@/lib/api-helpers'

// Тестовый endpoint для проверки заявок (без авторизации для отладки)
export async function GET(request: NextRequest) {
  try {
    // Получаем все заявки
    const allRequests = await prisma.request.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    const total = await prisma.request.count({})
    const pending = await prisma.request.count({ where: { status: 'pending' } })

    return NextResponse.json(
      createApiResponse(
        {
          total,
          pending,
          recent: allRequests.map(r => ({
            id: r.id,
            userId: r.userId.toString(),
            requestType: r.requestType,
            status: r.status,
            amount: r.amount?.toString(),
            bookmaker: r.bookmaker,
            createdAt: r.createdAt,
          })),
        },
        undefined,
        'Test endpoint - all requests'
      )
    )
  } catch (error: any) {
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to fetch requests'),
      { status: 500 }
    )
  }
}

