import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { createApiResponse } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

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

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || ''
    const rawBody = await request.text()
    let body: any = {}
    if (rawBody) {
      if (contentType.includes('application/json')) {
        try {
          body = JSON.parse(rawBody)
        } catch {
          body = {}
        }
      }

      if (!body || Object.keys(body).length === 0) {
        const params = new URLSearchParams(rawBody)
        if (Array.from(params.keys()).length > 0) {
          body = Object.fromEntries(params.entries())
        }
      }
    }
    const {
      amount,
      userId,
      accountId,
      bookmaker,
      bank,
      requestType = 'deposit',
    } = body || {}

    const baseAmount = parseFloat(String(amount || 0))
    if (isNaN(baseAmount) || baseAmount <= 0) {
      return NextResponse.json(createApiResponse(null, 'Invalid amount'), { status: 400 })
    }

    if (!userId) {
      return NextResponse.json(createApiResponse(null, 'userId is required'), { status: 400 })
    }

    let userIdBigInt: bigint
    try {
      userIdBigInt = BigInt(userId)
    } catch {
      return NextResponse.json(createApiResponse(null, 'Invalid userId'), { status: 400 })
    }

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
    const uncreatedModel = (prisma as any).uncreatedRequest

    const baseFloor = Math.floor(baseAmount)

    const isAmountBlocked = async (amountToCheck: Prisma.Decimal): Promise<boolean> => {
      const blockedRequest = await prisma.request.findFirst({
        where: {
          amount: amountToCheck,
          requestType: 'deposit',
          createdAt: { gte: tenMinutesAgo },
        },
        orderBy: { createdAt: 'desc' },
      })

      if (blockedRequest) return true

      if (uncreatedModel) {
        const blockedReservation = await uncreatedModel.findFirst({
          where: {
            amount: amountToCheck,
            requestType: 'deposit',
            createdAt: { gte: tenMinutesAgo },
          },
          orderBy: { createdAt: 'desc' },
        })
        return !!blockedReservation
      }

      return false
    }

    let attempts = 0
    const startCents = Math.floor(Math.random() * 99) + 1
    let currentCents = startCents
    let foundUnique = false
    let selectedAmount = new Prisma.Decimal((baseFloor + currentCents / 100).toFixed(2))

    while (attempts < 99 && !foundUnique) {
      const candidate = baseFloor + currentCents / 100
      const candidateDecimal = new Prisma.Decimal(candidate.toFixed(2))
      const candidateBlocked = await isAmountBlocked(candidateDecimal)
      if (!candidateBlocked) {
        selectedAmount = candidateDecimal
        foundUnique = true
        break
      }

      currentCents++
      if (currentCents > 99) currentCents = 1
      attempts++
    }

    if (!foundUnique) {
      const fallbackCents = Math.floor(Math.random() * 99) + 1
      selectedAmount = new Prisma.Decimal((baseFloor + fallbackCents / 100).toFixed(2))
    }

    let reservationId: number | null = null
    if (uncreatedModel) {
      const reservation = await uncreatedModel.create({
        data: {
          userId: userIdBigInt,
          username: body?.username,
          firstName: body?.firstName,
          lastName: body?.lastName,
          bookmaker: bookmaker ? String(bookmaker) : null,
          accountId: accountId ? String(accountId) : null,
          bank: bank ? String(bank) : null,
          amount: selectedAmount,
          requestType,
          status: 'reserved',
        },
      })
      reservationId = reservation.id
    }

    const response = NextResponse.json(
      createApiResponse({
        amount: selectedAmount.toString(),
        reservationId,
      })
    )
    response.headers.set('Access-Control-Allow-Origin', '*')
    return response
  } catch (error: any) {
    console.error('unique-amount error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to generate unique amount'),
      { status: 500 }
    )
  }
}

