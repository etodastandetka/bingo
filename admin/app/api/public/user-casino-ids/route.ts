import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createApiResponse } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

// Получить сохраненные ID казино для пользователя
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const casinoId = searchParams.get('casinoId')

    if (!userId) {
      return NextResponse.json(
        createApiResponse(null, 'userId is required'),
        { status: 400 }
      )
    }

    const userIdBigInt = BigInt(userId)

    // Если указан casinoId, получаем только для этого казино
    if (casinoId) {
      const dataType = `casino_account_id_${casinoId.toLowerCase()}`
      const userData = await prisma.botUserData.findUnique({
        where: {
          userId_dataType: {
            userId: userIdBigInt,
            dataType,
          },
        },
      })

      return NextResponse.json(
        createApiResponse({
          accountId: userData?.dataValue || null,
          casinoId,
        })
      )
    }

    // Иначе получаем все сохраненные ID казино
    const allUserData = await prisma.botUserData.findMany({
      where: {
        userId: userIdBigInt,
        dataType: {
          startsWith: 'casino_account_id_',
        },
      },
    })

    const accountIds: Record<string, string> = {}
    allUserData.forEach((data) => {
      const casinoId = data.dataType.replace('casino_account_id_', '')
      if (data.dataValue) {
        accountIds[casinoId] = data.dataValue
      }
    })

    return NextResponse.json(createApiResponse({ accountIds }))
  } catch (error: any) {
    console.error('Error fetching casino account IDs:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to fetch casino account IDs'),
      { status: 500 }
    )
  }
}

// Сохранить ID казино для пользователя
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, casinoId, accountId } = body

    if (!userId || !casinoId || !accountId) {
      return NextResponse.json(
        createApiResponse(null, 'userId, casinoId and accountId are required'),
        { status: 400 }
      )
    }

    const userIdBigInt = BigInt(userId)
    const dataType = `casino_account_id_${casinoId.toLowerCase()}`
    const normalizedAccountId = accountId.trim()

    // Сохраняем или обновляем ID
    await prisma.botUserData.upsert({
      where: {
        userId_dataType: {
          userId: userIdBigInt,
          dataType,
        },
      },
      update: {
        dataValue: normalizedAccountId,
      },
      create: {
        userId: userIdBigInt,
        dataType,
        dataValue: normalizedAccountId,
      },
    })

    return NextResponse.json(
      createApiResponse({ success: true, message: 'Account ID saved successfully' })
    )
  } catch (error: any) {
    console.error('Error saving casino account ID:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to save casino account ID'),
      { status: 500 }
    )
  }
}

