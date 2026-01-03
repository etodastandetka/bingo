import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { createApiResponse } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

// Public endpoint to create "not created" requests when user opens mini-app
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      userId,
      username,
      firstName,
      lastName,
      bookmaker,
      accountId,
      bank,
      amount,
      requestType = 'deposit',
    } = body || {}

    if (!userId) {
      return NextResponse.json(createApiResponse(null, 'userId is required'), { status: 400 })
    }

    let userIdBigInt: bigint
    try {
      userIdBigInt = BigInt(userId)
    } catch {
      return NextResponse.json(createApiResponse(null, 'Invalid userId'), { status: 400 })
    }

    // Ищем уже существующую "не созданную" для этого пользователя/аккаунта
    // @ts-ignore prisma client needs regenerate after schema change
    const existing = await prisma.uncreatedRequest.findFirst({
      where: {
        userId: userIdBigInt,
        accountId: accountId || undefined,
        requestType,
        status: { in: ['not_created', 'pending_check'] },
        createdRequestId: null,
      },
      orderBy: { createdAt: 'desc' },
    })

    if (existing) {
      return NextResponse.json(
        createApiResponse({
          id: existing.id,
          status: existing.status,
          userId: existing.userId.toString(),
          createdAt: existing.createdAt.toISOString(),
        })
      )
    }

    // @ts-ignore prisma client needs regenerate after schema change
    const record = await prisma.uncreatedRequest.create({
      data: {
        userId: userIdBigInt,
        username,
        firstName,
        lastName,
        bookmaker,
        accountId,
        bank,
        amount: amount ? new Prisma.Decimal(amount) : null,
        requestType,
        status: 'not_created',
      },
    })

    return NextResponse.json(
      createApiResponse({
        id: record.id,
        userId: record.userId.toString(),
        createdAt: record.createdAt.toISOString(),
      })
    )
  } catch (error: any) {
    console.error('public/uncreated-requests error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to create uncreated request'),
      { status: 500 }
    )
  }
}

