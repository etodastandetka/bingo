import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'
import { getPlatformLimits } from '@/lib/casino-api'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    requireAuth(request)

    // Получаем реальные лимиты из API
    const platformLimits = await getPlatformLimits()

    // Синхронизируем все лимиты с API
    for (const platform of platformLimits) {
      const existing = await prisma.casinoLimit.findUnique({
        where: { casino: platform.key },
      })

      if (existing) {
        await prisma.casinoLimit.update({
          where: { casino: platform.key },
          data: {
            currentLimit: platform.limit,
          },
        })
      } else {
        await prisma.casinoLimit.create({
          data: {
            casino: platform.key,
            currentLimit: platform.limit,
            baseLimit: platform.limit,
          },
        })
      }
    }

    return NextResponse.json(
      createApiResponse({ 
        success: true, 
        message: 'Лимиты синхронизированы с API',
        synced: platformLimits.length
      })
    )
  } catch (error: any) {
    console.error('Sync casino limits error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to sync limits'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

