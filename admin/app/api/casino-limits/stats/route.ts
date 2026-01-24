import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'
import { getPlatformLimits } from '@/lib/casino-api'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    requireAuth(request)

    // Получаем текущие лимиты из БД
    const casinoLimits = await prisma.casinoLimit.findMany({
      orderBy: { casino: 'asc' },
    })

    // Получаем реальные лимиты из API
    const platformLimits = await getPlatformLimits()

    // Объединяем данные
    const limits = platformLimits.map(platform => {
      const dbLimit = casinoLimits.find(cl => cl.casino === platform.key)
      const currentLimit = dbLimit ? parseFloat(dbLimit.currentLimit.toString()) : platform.limit
      const realLimit = platform.limit
      const difference = currentLimit - realLimit
      const isMismatch = Math.abs(difference) > 1000

      return {
        casino: platform.key,
        name: platform.name,
        currentLimit: currentLimit,
        realLimit: realLimit,
        difference: difference,
        isMismatch: isMismatch,
      }
    })

    // Статистика нестыковок (только активные, не удаленные)
    // Считаем нестыковки на основе текущих лимитов, а не из логов
    const activeMismatchesCount = limits.filter(l => l.isMismatch).length

    // Последние нестыковки из логов (только существующие записи)
    const recentMismatches = await prisma.casinoLimitLog.findMany({
      where: { isMismatch: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        casino: true,
        requestId: true,
        requestType: true,
        amount: true,
        limitBefore: true,
        limitAfter: true,
        mismatchReason: true,
        createdAt: true,
      },
    })

    return NextResponse.json(
      createApiResponse({
        limits,
        mismatchesCount: activeMismatchesCount, // Используем количество активных нестыковок
        recentMismatches: recentMismatches.map(m => ({
          ...m,
          amount: m.amount.toString(),
          limitBefore: m.limitBefore.toString(),
          limitAfter: m.limitAfter.toString(),
          createdAt: m.createdAt.toISOString(),
        })),
      })
    )
  } catch (error: any) {
    console.error('Casino limits stats error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to fetch stats'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

