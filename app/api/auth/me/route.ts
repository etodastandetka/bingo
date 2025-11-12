import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'

export async function GET(request: NextRequest) {
  try {
    requireAuth(request)

    // В упрощенной системе получаем пользователя по токену из cookie
    // Для полной реализации нужно хранить маппинг токен -> userId
    // Пока что возвращаем первого активного админа (временное решение)
    const user = await prisma.adminUser.findFirst({
      where: { isActive: true },
      select: {
        id: true,
        username: true,
        email: true,
        isSuperAdmin: true,
        isActive: true,
      },
    })

    if (!user) {
      return NextResponse.json(
        createApiResponse(null, 'User not found'),
        { status: 404 }
      )
    }

    return NextResponse.json(createApiResponse(user))
  } catch (error: any) {
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to get user'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

