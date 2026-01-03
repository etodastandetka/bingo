import { prisma } from './prisma'

/**
 * Универсальная функция для синхронизации данных пользователя
 * Собирает данные из всех источников (Request, ChatMessage) и сохраняет в BotUser
 * 
 * @param userId - ID пользователя
 * @param userData - Опциональные данные пользователя (username, firstName, lastName)
 *                  Если не переданы, будут собраны из всех источников
 */
export async function ensureUserExists(
  userId: bigint,
  userData?: {
    username?: string | null
    firstName?: string | null
    lastName?: string | null
  }
) {
  try {
    // Собираем данные из всех источников
    const [latestRequest, latestMessage] = await Promise.all([
      // Последняя заявка
      prisma.request.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          username: true,
          firstName: true,
          lastName: true,
        },
      }),
      // Последнее сообщение
      prisma.chatMessage.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
        },
      }),
    ])

    // Определяем самые актуальные данные пользователя
    // Приоритет: переданные данные > последняя заявка > существующий пользователь
    let finalUsername: string | null = null
    let finalFirstName: string | null = null
    let finalLastName: string | null = null

    // Если данные переданы явно - используем их
    if (userData) {
      finalUsername = userData.username ?? null
      finalFirstName = userData.firstName ?? null
      finalLastName = userData.lastName ?? null
    } else if (latestRequest) {
      // Иначе берем из последней заявки
      finalUsername = latestRequest.username ?? null
      finalFirstName = latestRequest.firstName ?? null
      finalLastName = latestRequest.lastName ?? null
    }

    // Если все еще нет данных, проверяем существующего пользователя
    if (!finalUsername && !finalFirstName && !finalLastName) {
      const existingUser = await prisma.botUser.findUnique({
        where: { userId },
        select: {
          username: true,
          firstName: true,
          lastName: true,
        },
      })

      if (existingUser) {
        finalUsername = existingUser.username ?? null
        finalFirstName = existingUser.firstName ?? null
        finalLastName = existingUser.lastName ?? null
      }
    }

    // Создаем или обновляем пользователя
    const user = await prisma.botUser.upsert({
      where: { userId },
      update: {
        // Обновляем только если есть новые данные
        ...(finalUsername !== null && { username: finalUsername }),
        ...(finalFirstName !== null && { firstName: finalFirstName }),
        ...(finalLastName !== null && { lastName: finalLastName }),
      },
      create: {
        userId,
        username: finalUsername,
        firstName: finalFirstName,
        lastName: finalLastName,
        language: 'ru',
        isActive: true,
      },
    })

    return user
  } catch (error) {
    console.error('Error ensuring user exists:', error)
    // Не бросаем ошибку, чтобы не ломать основной процесс
    return null
  }
}

/**
 * Синхронизирует данные пользователя из Request в BotUser (для обратной совместимости)
 */
export async function syncUserFromRequest(userId: bigint) {
  return ensureUserExists(userId)
}

