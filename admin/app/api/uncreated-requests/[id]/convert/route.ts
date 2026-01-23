import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    requireAuth(request)

    const id = parseInt(params.id, 10)
    if (Number.isNaN(id)) {
      return NextResponse.json(createApiResponse(null, 'Invalid id'), { status: 400 })
    }

    // @ts-ignore prisma client needs regenerate after schema change
    const uncreated = await prisma.uncreatedRequest.findUnique({ where: { id } })
    if (!uncreated) {
      return NextResponse.json(createApiResponse(null, 'Uncreated request not found'), { status: 404 })
    }

    // КРИТИЧНО: Проверяем и исправляем сумму для deposit - не должна заканчиваться на .00
    let amountDecimal = uncreated.amount
    if (uncreated.requestType === 'deposit' && uncreated.amount) {
      const amountNum = parseFloat(uncreated.amount.toString())
      const cents = Math.round((amountNum % 1) * 100)
      if (cents === 0) {
        // Сумма заканчивается на .00 - генерируем случайные копейки от 1 до 99
        const randomCents = Math.floor(Math.random() * 99) + 1
        const correctedAmount = Math.floor(amountNum) + randomCents / 100
        amountDecimal = new Prisma.Decimal(correctedAmount.toFixed(2))
        console.error(`❌ Convert Uncreated Request API - CRITICAL: Amount ended with .00, corrected to:`, correctedAmount.toFixed(2))
      }
    }

    // Создаем обычную заявку со статусом "pending" и statusDetail "pending_check" чтобы она отображалась в дашборде
    const createdRequest = await prisma.request.create({
      data: {
        userId: uncreated.userId,
        username: uncreated.username,
        firstName: uncreated.firstName,
        lastName: uncreated.lastName,
        bookmaker: uncreated.bookmaker,
        accountId: uncreated.accountId,
        amount: amountDecimal,
        requestType: uncreated.requestType,
        status: 'pending',
        statusDetail: 'pending_check',
        bank: uncreated.bank,
      },
    })

    // @ts-ignore prisma client needs regenerate after schema change
    await prisma.uncreatedRequest.update({
      where: { id },
      data: {
        status: 'converted',
        createdRequestId: createdRequest.id,
      },
    })

    return NextResponse.json(
      createApiResponse({
        request: {
          ...createdRequest,
          userId: createdRequest.userId.toString(),
          amount: createdRequest.amount?.toString() || '0',
          createdAt: createdRequest.createdAt.toISOString(),
          updatedAt: createdRequest.updatedAt.toISOString(),
        },
      })
    )
  } catch (error: any) {
    console.error('convert uncreated request error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to convert uncreated request'),
      { status: 500 }
    )
  }
}

