import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Получение статистики для рассылки (количество пользователей)
export async function GET(request: NextRequest) {
  try {
    requireAuth(request)

    const totalUsers = await prisma.botUser.count()

    return NextResponse.json(
      createApiResponse({
        totalUsers,
      })
    )
  } catch (error: any) {
    console.error('Broadcast stats API error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to fetch broadcast stats'),
      { status: 500 }
    )
  }
}

