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

    // КРИТИЧНО: Проверяем и исправляем сумму для deposit - не должна заканчиваться на .00
    let amountDecimal: Prisma.Decimal | null = null
    if (amount) {
      const amountNum = parseFloat(amount.toString())
      amountDecimal = new Prisma.Decimal(amountNum)
      
      if (requestType === 'deposit') {
        const cents = Math.round((amountNum % 1) * 100)
        if (cents === 0) {
          // Сумма заканчивается на .00 - генерируем случайные копейки от 1 до 99
          const randomCents = Math.floor(Math.random() * 99) + 1
          const correctedAmount = Math.floor(amountNum) + randomCents / 100
          amountDecimal = new Prisma.Decimal(correctedAmount.toFixed(2))
          console.error(`❌ Uncreated Requests API - CRITICAL: Amount ended with .00, corrected to:`, correctedAmount.toFixed(2))
        }
      }
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
        amount: amountDecimal,
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

