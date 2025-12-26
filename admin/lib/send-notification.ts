import { prisma } from './prisma'

/**
 * Определяет токен бота по bookmaker
 * mostbet -> BOT_TOKEN_MOSTBET
 * 1xbet -> BOT_TOKEN_1XBET
 * остальные -> BOT_TOKEN (основной бот)
 */
export function getBotTokenByBookmaker(bookmaker: string | null | undefined): string | null {
  if (!bookmaker) {
    return process.env.BOT_TOKEN || null
  }

  const normalized = bookmaker.toLowerCase()

  if (normalized.includes('mostbet')) {
    return process.env.BOT_TOKEN_MOSTBET || process.env.BOT_TOKEN || null
  }

  if (normalized.includes('1xbet') || normalized.includes('xbet')) {
    return process.env.BOT_TOKEN_1XBET || process.env.BOT_TOKEN || null
  }

  // Для остальных казино используем основной бот
  return process.env.BOT_TOKEN || null
}

/**
 * Удаление сообщения "Ваша заявка отправлена" при успешном пополнении или отклонении
 */
export async function deleteRequestCreatedMessage(
  userId: bigint,
  messageId: bigint | null,
  bookmaker?: string | null
): Promise<void> {
  if (!messageId) return

  try {
    const botToken = bookmaker ? getBotTokenByBookmaker(bookmaker) : (process.env.BOT_TOKEN || null)
    if (!botToken) return

    const deleteMessageUrl = `https://api.telegram.org/bot${botToken}/deleteMessage`
    await fetch(deleteMessageUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: userId.toString(),
        message_id: Number(messageId),
      })
    })
  } catch (error) {
    // Игнорируем ошибки удаления (сообщение могло быть уже удалено)
    console.warn('Failed to delete request created message:', error)
  }
}

/**
 * Отправка уведомления пользователю через Telegram бота
 */
export async function sendNotificationToUser(
  userId: bigint,
  message: string,
  bookmaker?: string | null,
  requestId?: number | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const botToken = bookmaker ? getBotTokenByBookmaker(bookmaker) : (process.env.BOT_TOKEN || null)

    if (!botToken) {
      console.error('BOT_TOKEN not configured')
      return { success: false, error: 'BOT_TOKEN not configured' }
    }

    // Если есть requestId, удаляем сообщение "Ваша заявка отправлена" перед отправкой нового
    if (requestId) {
      try {
        const request = await prisma.request.findUnique({
          where: { id: requestId },
          select: { requestCreatedMessageId: true },
        })
        if (request?.requestCreatedMessageId) {
          await deleteRequestCreatedMessage(userId, request.requestCreatedMessageId, bookmaker)
          // Очищаем message_id после удаления
          await prisma.request.update({
            where: { id: requestId },
            data: { requestCreatedMessageId: null },
          })
        }
      } catch (error) {
        console.warn('Failed to delete request created message:', error)
      }
    }

    const sendMessageUrl = `https://api.telegram.org/bot${botToken}/sendMessage`
    const telegramResponse = await fetch(sendMessageUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: userId.toString(),
        text: message,
        parse_mode: 'HTML',
        protect_content: true
      })
    })

    const telegramData = await telegramResponse.json()

    if (!telegramData.ok) {
      console.error('Failed to send notification:', telegramData.description)
      return { success: false, error: telegramData.description || 'Failed to send message' }
    }

    // Сохраняем сообщение в БД
    try {
      // Определяем botType на основе bookmaker
      let botType = 'main'
      if (bookmaker) {
        const normalized = bookmaker.toLowerCase()
        if (normalized.includes('mostbet')) {
          botType = 'mostbet'
        } else if (normalized.includes('1xbet') || normalized.includes('xbet')) {
          botType = '1xbet'
        }
      }

      await prisma.chatMessage.create({
        data: {
          userId,
          messageText: message,
          messageType: 'text',
          direction: 'out',
          botType,
          telegramMessageId: BigInt(telegramData.result.message_id),
        },
      })
    } catch (dbError) {
      // Игнорируем ошибки сохранения в БД, главное что сообщение отправлено
      console.warn('Failed to save notification to DB:', dbError)
    }

    return { success: true }
  } catch (error: any) {
    console.error('Error sending notification:', error)
    return { success: false, error: error.message || 'Unknown error' }
  }
}

/**
 * Получить username админа из настроек
 * Использует значение из Config.SUPPORT (по умолчанию @bingokg_boss)
 */
export async function getAdminUsername(): Promise<string> {
  try {
    const setting = await prisma.botConfiguration.findFirst({
      where: { key: 'admin_username' },
    })
    
    if (setting) {
      const value = typeof setting.value === 'string' 
        ? JSON.parse(setting.value) 
        : setting.value
      if (value && typeof value === 'string') {
        return value
      }
    }
    
    // Fallback на дефолтное значение из Config.SUPPORT
    return process.env.ADMIN_USERNAME || '@bingokg_boss'
  } catch {
    return '@bingokg_boss'
  }
}

/**
 * Формирование сообщения о пополнении
 */
export function formatDepositMessage(amount: number, casino: string, accountId: string, adminUsername: string, lang: string = 'ru'): string {
  if (lang === 'ky') {
    return `✅ Ваши средства зачислены!\n\n` +
           `💰 Сумма: ${amount.toFixed(2)} KGS\n` +
           `🎰 Казино: ${casino}\n` +
           `🆔 ID: ${accountId}\n\n` +
           `Эгер кандайдыр бир көйгөйлөр болсо, ${adminUsername} менен байланышыңыз.`
  }
  
  return `✅ Ваши средства зачислены!\n\n` +
         `💰 Сумма: ${amount.toFixed(2)} KGS\n` +
         `🎰 Казино: ${casino}\n` +
         `🆔 ID: ${accountId}\n\n` +
         `Если есть какие-то проблемы, пишите ${adminUsername}.`
}

/**
 * Формирование сообщения о выводе
 */
export function formatWithdrawMessage(amount: number, casino: string, accountId: string, adminUsername: string, lang: string = 'ru'): string {
  if (lang === 'ky') {
    return `✅ Ваши средства выведены!\n\n` +
           `💰 Сумма: ${amount.toFixed(2)} KGS\n` +
           `🎰 Казино: ${casino}\n` +
           `🆔 ID: ${accountId}\n\n` +
           `Эгер кандайдыр бир көйгөйлөр болсо, ${adminUsername} менен байланышыңыз.`
  }
  
  return `✅ Ваши средства выведены!\n\n` +
         `💰 Сумма: ${amount.toFixed(2)} KGS\n` +
         `🎰 Казино: ${casino}\n` +
         `🆔 ID: ${accountId}\n\n` +
         `Если есть какие-то проблемы, пишите ${adminUsername}.`
}

/**
 * Формирование сообщения об отклонении заявки
 */
export function formatRejectMessage(requestType: string, adminUsername: string, lang: string = 'ru'): string {
  const typeText = requestType === 'deposit' 
    ? (lang === 'ky' ? 'толтуруу' : 'пополнение')
    : (lang === 'ky' ? 'чыгаруу' : 'вывод')
  
  if (lang === 'ky') {
    return `❌ Сиздин ${typeText} өтүнүчүңүз жокко чыгарылды.\n\n` +
           `Эгер кандайдыр бир көйгөйлөр болсо, ${adminUsername} менен байланышыңыз.`
  }
  
  return `❌ Ваша заявка на ${typeText} была отклонена.\n\n` +
         `Если есть какие-то проблемы, пишите ${adminUsername}.`
}

/**
 * Отправка главного меню пользователю
 */
export async function sendMainMenuToUser(
  userId: bigint,
  bookmaker?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    // Получаем язык пользователя из БД
    const user = await prisma.botUser.findUnique({
      where: { userId },
      select: { language: true, firstName: true },
    }).catch(() => null)
    
    const lang = user?.language || 'ru'
    const firstName = user?.firstName || (lang === 'ru' ? 'kotik' : 'баатыр')
    
    const botToken = bookmaker ? getBotTokenByBookmaker(bookmaker) : (process.env.BOT_TOKEN || null)
    
    if (!botToken) {
      console.error('BOT_TOKEN not configured')
      return { success: false, error: 'BOT_TOKEN not configured' }
    }
    
    // Тексты главного меню
    const greeting = lang === 'ky' ? `Салам, ${firstName}` : `Привет, ${firstName}`
    const autoDeposit = lang === 'ky' ? '⚡️ Авто-толтуруу: 0%' : '⚡️ Авто-пополнение: 0%'
    const autoWithdraw = lang === 'ky' ? '⚡️ Авто-чыгаруу: 0%' : '⚡️ Авто-вывод: 0%'
    const working = lang === 'ky' ? '🕐 Иштеп жатабыз: 24/7' : '🕐 Работаем: 24/7'
    const support = process.env.ADMIN_USERNAME || '@bingokg_boss'
    const supportText = lang === 'ky' 
      ? `👨‍💻Колдоо кызматы: ${support}`
      : `👨‍💻Служба поддержки: ${support}`
    
    const menuText = `${greeting}\n\n${autoDeposit}\n${autoWithdraw}\n${working}\n\n${supportText}`
    
    // Кнопки главного меню
    const menuButtons = lang === 'ky'
      ? [
          ['💰 Толтуруу', '💸 Чыгаруу'],
          ['📖 Көрсөтмө', '🌐 Тил']
        ]
      : [
          ['💰 Пополнить', '💸 Вывести'],
          ['📖 Инструкция', '🌐 Язык']
        ]
    
    const keyboard = {
      keyboard: menuButtons.map(row => 
        row.map(text => ({ text }))
      ),
      resize_keyboard: true
    }
    
    const sendMessageUrl = `https://api.telegram.org/bot${botToken}/sendMessage`
    const telegramResponse = await fetch(sendMessageUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: userId.toString(),
        text: menuText,
        reply_markup: keyboard,
        protect_content: true
      })
    })
    
    const telegramData = await telegramResponse.json()
    
    if (!telegramData.ok) {
      console.error('Failed to send main menu:', telegramData.description)
      return { success: false, error: telegramData.description || 'Failed to send main menu' }
    }
    
    return { success: true }
  } catch (error: any) {
    console.error('Error sending main menu:', error)
    return { success: false, error: error.message || 'Unknown error' }
  }
}

