import { prisma } from './prisma'
import { getPlatformLimits } from './casino-api'

/**
 * Обновление лимита казино при обработке заявки
 * @param casino - название казино (1xbet, mostbet, и т.д.)
 * @param amount - сумма операции
 * @param requestType - тип заявки (deposit или withdraw)
 * @param requestId - ID заявки
 * @param userId - ID пользователя
 * @param accountId - ID счета казино
 * @param processedBy - кто обработал заявку
 */
export async function updateCasinoLimit(
  casino: string,
  amount: number,
  requestType: 'deposit' | 'withdraw',
  requestId?: number,
  userId?: bigint,
  accountId?: string,
  processedBy?: string
): Promise<{ success: boolean; limitBefore: number; limitAfter: number; isMismatch: boolean; mismatchReason?: string }> {
  try {
    // Получаем или создаем запись лимита для казино
    let casinoLimit = await prisma.casinoLimit.findUnique({
      where: { casino },
    })

    if (!casinoLimit) {
      // Если записи нет, получаем текущий лимит из API
      const platformLimits = await getPlatformLimits()
      const platformLimit = platformLimits.find(p => p.key === casino)
      const initialLimit = platformLimit?.limit || 0

      casinoLimit = await prisma.casinoLimit.create({
        data: {
          casino,
          currentLimit: initialLimit,
          baseLimit: initialLimit,
        },
      })
    }

    const limitBefore = parseFloat(casinoLimit.currentLimit.toString())

    // Вычисляем новый лимит
    // При пополнении - минусуем (лимит уменьшается)
    // При выводе - плюсуем (лимит увеличивается)
    let limitAfter = limitBefore
    if (requestType === 'deposit') {
      limitAfter = limitBefore - amount
    } else if (requestType === 'withdraw') {
      limitAfter = limitBefore + amount
    }

    // Обновляем лимит
    const updatedLimit = await prisma.casinoLimit.update({
      where: { casino },
      data: { currentLimit: limitAfter },
    })

    // Проверяем нестыковку с реальным лимитом из API
    let isMismatch = false
    let mismatchReason: string | undefined

    try {
      const platformLimits = await getPlatformLimits()
      const platformLimit = platformLimits.find(p => p.key === casino)
      const realLimit = platformLimit?.limit || 0

      // Если разница больше 1000 сом - считаем это нестыковкой
      const difference = Math.abs(limitAfter - realLimit)
      if (difference > 1000) {
        isMismatch = true
        mismatchReason = `Расхождение с API: наш лимит ${limitAfter.toFixed(2)}, API лимит ${realLimit.toFixed(2)}, разница ${difference.toFixed(2)}`
        
        // Обновляем лимит на реальный из API
        await prisma.casinoLimit.update({
          where: { casino },
          data: { currentLimit: realLimit },
        })
        limitAfter = realLimit
      }
    } catch (error) {
      console.error(`[Casino Limits] Error checking mismatch for ${casino}:`, error)
    }

    // Логируем операцию
    await prisma.casinoLimitLog.create({
      data: {
        casino,
        requestId,
        requestType,
        amount,
        limitBefore,
        limitAfter,
        userId,
        accountId,
        processedBy,
        isMismatch,
        mismatchReason,
      },
    })

    return {
      success: true,
      limitBefore,
      limitAfter,
      isMismatch,
      mismatchReason,
    }
  } catch (error: any) {
    console.error(`[Casino Limits] Error updating limit for ${casino}:`, error)
    return {
      success: false,
      limitBefore: 0,
      limitAfter: 0,
      isMismatch: false,
    }
  }
}

/**
 * Получение текущего лимита казино
 */
export async function getCasinoLimit(casino: string): Promise<number> {
  try {
    const casinoLimit = await prisma.casinoLimit.findUnique({
      where: { casino },
    })

    if (casinoLimit) {
      return parseFloat(casinoLimit.currentLimit.toString())
    }

    // Если записи нет, получаем из API и создаем
    const platformLimits = await getPlatformLimits()
    const platformLimit = platformLimits.find(p => p.key === casino)
    const limit = platformLimit?.limit || 0

    await prisma.casinoLimit.create({
      data: {
        casino,
        currentLimit: limit,
        baseLimit: limit,
      },
    })

    return limit
  } catch (error: any) {
    console.error(`[Casino Limits] Error getting limit for ${casino}:`, error)
    return 0
  }
}

/**
 * Синхронизация всех лимитов с API
 */
export async function syncAllLimitsWithAPI(): Promise<void> {
  try {
    const platformLimits = await getPlatformLimits()

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
  } catch (error: any) {
    console.error('[Casino Limits] Error syncing limits with API:', error)
  }
}

