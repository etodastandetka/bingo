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

    // КРИТИЧНО: Проверяем нестыковку ДО обновления лимита
    // Это нужно, чтобы обнаружить случаи, когда кто-то пополнил через левое API без заявки
    let isMismatch = false
    let mismatchReason: string | undefined
    let realLimitFromAPI = 0
    let stolenAmount = 0  // Сколько "украли" через левое API

    try {
      const platformLimits = await getPlatformLimits()
      const platformLimit = platformLimits.find(p => p.key === casino)
      realLimitFromAPI = platformLimit?.limit || 0

      // Вычисляем, каким ДОЛЖЕН быть лимит в БД перед этой операцией
      // Пополнение УМЕНЬШАЕТ лимит: если API показывает 90,000, а мы пополняем 5,000, то ДО было 95,000
      // Вывод УВЕЛИЧИВАЕТ лимит: если API показывает 100,000, а мы выводим 5,000, то ДО было 95,000
      const expectedLimitBefore = requestType === 'deposit'
        ? realLimitFromAPI + amount  // При пополнении: API лимит ПОСЛЕ пополнения + сумма = лимит ДО пополнения
        : realLimitFromAPI - amount   // При выводе: API лимит ПОСЛЕ вывода - сумма = лимит ДО вывода

      // Проверяем нестыковку: наш лимит в БД должен совпадать с ожидаемым
      const difference = Math.abs(limitBefore - expectedLimitBefore)
      if (difference > 100) {
        isMismatch = true
        
        // Вычисляем сколько "украли"
        if (requestType === 'deposit') {
          // При пополнении: если наш лимит больше ожидаемого - значит кто-то уже пополнил через левое API
          stolenAmount = limitBefore - expectedLimitBefore
          mismatchReason = `⚠️ Обнаружена нестыковка! Наш лимит ${limitBefore.toFixed(2)}, ожидаемый ${expectedLimitBefore.toFixed(2)}. Разница: ${stolenAmount.toFixed(2)} сом. Возможно, кто-то пополнил через левое API без заявки.`
        } else {
          // При выводе: если наш лимит меньше ожидаемого - возможно кто-то вывел через левое API
          stolenAmount = expectedLimitBefore - limitBefore
          mismatchReason = `⚠️ Обнаружена нестыковка! Наш лимит ${limitBefore.toFixed(2)}, ожидаемый ${expectedLimitBefore.toFixed(2)}. Разница: ${stolenAmount.toFixed(2)} сом.`
        }
        
        console.warn(`[Casino Limits] Mismatch detected for ${casino} (${requestType}): ${mismatchReason}`)
      }
    } catch (error) {
      console.error(`[Casino Limits] Error checking mismatch for ${casino}:`, error)
    }

    // Вычисляем новый лимит после операции
    // При пополнении - минусуем (лимит уменьшается)
    // При выводе - плюсуем (лимит увеличивается)
    let limitAfter = limitBefore
    if (requestType === 'deposit') {
      limitAfter = limitBefore - amount
    } else if (requestType === 'withdraw') {
      limitAfter = limitBefore + amount
    }

    // Обновляем лимит
    await prisma.casinoLimit.update({
      where: { casino },
      data: { currentLimit: limitAfter },
    })

    // Логируем операцию ТОЛЬКО если есть нестыковка
    // Если все работает нормально - не засоряем логи
    if (isMismatch) {
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
    }

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

