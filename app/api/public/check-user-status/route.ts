import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createApiResponse } from '@/lib/api-helpers'

// Публичный эндпоинт для проверки статуса пользователя (для клиентского сайта)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('user_id')

    if (!userId) {
      return NextResponse.json(
        createApiResponse(null, 'User ID is required'),
        { status: 400 }
      )
    }

    let userIdBigInt: bigint
    try {
      userIdBigInt = BigInt(userId)
    } catch (e) {
      return NextResponse.json(
        createApiResponse(null, 'Invalid user ID'),
        { status: 400 }
      )
    }

    const user = await prisma.botUser.findUnique({
      where: { userId: userIdBigInt },
      select: {
        isActive: true,
      },
    })

    // Если пользователь не найден, считаем его активным (по умолчанию)
    const isActive = user?.isActive !== false

    return NextResponse.json(
      createApiResponse({
        isActive,
        isBlocked: !isActive,
      })
    )
  } catch (error: any) {
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to check user status'),
      { status: 500 }
    )
  }
}

export const dynamic = 'force-dynamic'

