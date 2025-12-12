import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'

// Отключаем кеширование для актуальных данных
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    requireAuth(request)

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const skip = (page - 1) * limit
    const search = searchParams.get('search')

    const where: any = {}
    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [users, total] = await Promise.all([
      prisma.botUser.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          _count: {
            select: {
              transactions: true,
              referralMade: true,
            },
          },
        },
      }),
      prisma.botUser.count({ where }),
    ])

    return NextResponse.json(
      createApiResponse({
        users: users.map(u => ({
          userId: u.userId.toString(),
          username: u.username,
          firstName: u.firstName,
          lastName: u.lastName,
          language: u.language,
          selectedBookmaker: u.selectedBookmaker,
          createdAt: u.createdAt,
          transactionsCount: u._count.transactions,
          referralsCount: u._count.referralMade,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      })
    )
  } catch (error: any) {
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to fetch users'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

