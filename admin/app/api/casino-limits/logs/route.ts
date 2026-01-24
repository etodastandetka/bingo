import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    requireAuth(request)

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const casino = searchParams.get('casino')
    const showMismatchesOnly = searchParams.get('mismatches') === 'true'
    const startDate = searchParams.get('start')
    const endDate = searchParams.get('end')

    const skip = (page - 1) * limit

    const where: any = {}
    if (casino) {
      where.casino = casino
    }
    if (showMismatchesOnly) {
      where.isMismatch = true
    }
    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) {
        where.createdAt.gte = new Date(startDate)
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate)
      }
    }

    const [logs, total] = await Promise.all([
      prisma.casinoLimitLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.casinoLimitLog.count({ where }),
    ])

    return NextResponse.json(
      createApiResponse({
        logs: logs.map(log => ({
          ...log,
          amount: log.amount.toString(),
          limitBefore: log.limitBefore.toString(),
          limitAfter: log.limitAfter.toString(),
          userId: log.userId?.toString() || null,
          createdAt: log.createdAt.toISOString(),
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
    console.error('Casino limits logs error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to fetch logs'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

