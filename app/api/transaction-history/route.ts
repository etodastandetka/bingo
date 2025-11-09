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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('user_id')
    const type = searchParams.get('type') // deposit, withdraw, or empty for all

    const where: any = {}
    if (userId) {
      where.userId = BigInt(userId)
    }
    if (type) {
      where.requestType = type
    }

    const requests = await prisma.request.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: userId ? 50 : 100,
    })

    const transactions = requests.map((r) => ({
      id: r.id.toString(),
      user_id: r.userId.toString(),
      account_id: r.accountId || '',
      user_display_name: r.username
        ? `@${r.username}`
        : r.firstName && r.lastName
        ? `${r.firstName} ${r.lastName}`
        : r.firstName || 'Unknown',
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
    }))

    const response = NextResponse.json(createApiResponse({ transactions }))
    response.headers.set('Access-Control-Allow-Origin', '*')
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

