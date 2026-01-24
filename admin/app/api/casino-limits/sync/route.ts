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

    // Получаем текущие лимиты из БД
    const casinoLimits = await prisma.casinoLimit.findMany()

    let mismatchesLogged = 0

    // Перед синхронизацией проверяем нестыковки и логируем их
    for (const platform of platformLimits) {
      const existing = casinoLimits.find(cl => cl.casino === platform.key)
      
      if (existing) {
        const currentLimit = parseFloat(existing.currentLimit.toString())
        const realLimit = platform.limit
        const difference = Math.abs(currentLimit - realLimit)
        
        // Если есть нестыковка - создаем лог
        if (difference > 100) {
          const stolenAmount = currentLimit - realLimit
          const mismatchReason = `⚠️ Обнаружена нестыковка при синхронизации! Наш лимит ${currentLimit.toFixed(2)}, API лимит ${realLimit.toFixed(2)}. Разница: ${stolenAmount.toFixed(2)} сом.`
          
          await prisma.casinoLimitLog.create({
            data: {
              casino: platform.key,
              requestType: 'sync',
              amount: 0,
              limitBefore: currentLimit,
              limitAfter: realLimit,
              processedBy: 'system',
              isMismatch: true,
              mismatchReason,
            },
          })
          mismatchesLogged++
        }
      }
    }

    // Теперь синхронизируем все лимиты с API
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
        message: `Лимиты синхронизированы с API. Обнаружено нестыковок: ${mismatchesLogged}`,
        synced: platformLimits.length,
        mismatchesLogged
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

