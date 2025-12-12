import { prisma } from './prisma'

/**
 * Отправка уведомления пользователю через Telegram бота
 */
export async function sendNotificationToUser(
  userId: bigint,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const botToken = process.env.BOT_TOKEN

    if (!botToken) {
      console.error('BOT_TOKEN not configured')
      return { success: false, error: 'BOT_TOKEN not configured' }
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
      await prisma.chatMessage.create({
        data: {
          userId,
          messageText: message,
          messageType: 'text',
          direction: 'out',
          botType: 'main',
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

