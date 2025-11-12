import { prisma } from './prisma'

/**
 * Отправка уведомления пользователю через Telegram бота
 */
export async function sendDepositSuccessNotification(
  userId: bigint,
  amount: number,
  casino: string,
  accountId: string
): Promise<void> {
  try {
    const botToken = process.env.BOT_TOKEN
    if (!botToken) {
      console.warn('BOT_TOKEN not configured, skipping notification')
      return
    }

    // Получаем язык пользователя из БД
    const user = await prisma.botUser.findUnique({
      where: { userId },
      select: { language: true },
    })

    const lang = user?.language || 'ru'

    // Формируем сообщение в зависимости от языка
    let message = ''
    if (lang === 'ky') {
      message = `✅ Толтуруу ийгиликтүү!\n\n💰 Сумма: ${amount.toFixed(2)} KGS\n🎰 Казино: ${casino}\n🆔 ID: ${accountId}`
    } else {
      message = `✅ Пополнение успешно!\n\n💰 Сумма: ${amount.toFixed(2)} KGS\n🎰 Казино: ${casino}\n🆔 ID: ${accountId}`
    }

    // Отправляем сообщение через Telegram API
    const sendMessageUrl = `https://api.telegram.org/bot${botToken}/sendMessage`
    const response = await fetch(sendMessageUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: userId.toString(),
        text: message,
        parse_mode: 'HTML',
      }),
    })

    const data = await response.json()
    if (!data.ok) {
      console.error('Failed to send deposit success notification:', data)
    } else {
      console.log(`✅ Deposit success notification sent to user ${userId}`)
    }
  } catch (error: any) {
    console.error('Error sending deposit success notification:', error)
    // Не бросаем ошибку, чтобы не прерывать основной процесс
  }
}





