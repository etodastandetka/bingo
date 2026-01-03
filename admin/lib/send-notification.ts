import { prisma } from './prisma'

/**
 * Определяет botType на основе последнего сообщения пользователя перед созданием заявки
 * Это позволяет определить, из какого бота была создана заявка
 */
export async function getBotTypeByUserLastMessage(
  userId: bigint,
  requestCreatedAt: Date
): Promise<string | null> {
  try {
    // Ищем последнее сообщение пользователя, которое было создано до или в момент создания заявки
    const lastMessage = await prisma.chatMessage.findFirst({
      where: {
        userId,
        createdAt: {
          lte: requestCreatedAt
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        botType: true,
        createdAt: true
      }
    })

    if (lastMessage && lastMessage.botType) {
      console.log(`[getBotTypeByUserLastMessage] Found last message with botType: ${lastMessage.botType} for user ${userId.toString()}`)
      return lastMessage.botType
    }

    console.log(`[getBotTypeByUserLastMessage] No last message found for user ${userId.toString()}, using default 'main'`)
    return 'main' // По умолчанию основной бот
  } catch (error) {
    console.error(`[getBotTypeByUserLastMessage] Error getting botType:`, error)
    return 'main' // В случае ошибки используем основной бот
  }
}

/**
 * Определяет токен бота по botType
 * main -> BOT_TOKEN
 * mostbet -> BOT_TOKEN_MOSTBET
 * 1xbet -> BOT_TOKEN_1XBET
 */
export function getBotTokenByBotType(botType: string | null | undefined): string | null {
  if (botType) {
    const normalized = botType.toLowerCase()
    console.log(`[getBotTokenByBotType] BotType: "${botType}", normalized: "${normalized}"`)

    if (normalized === 'mostbet') {
      const token = process.env.BOT_TOKEN_MOSTBET || process.env.BOT_TOKEN || null
      console.log(`[getBotTokenByBotType] Matched Mostbet, using BOT_TOKEN_MOSTBET: ${token ? 'configured' : 'NOT configured'}`)
      return token
    }

    if (normalized === '1xbet') {
      const token = process.env.BOT_TOKEN_1XBET || process.env.BOT_TOKEN || null
      console.log(`[getBotTokenByBotType] Matched 1xbet, using BOT_TOKEN_1XBET: ${token ? 'configured' : 'NOT configured'}`)
      return token
    }
  }

  // Для основного бота или если botType не указан
  console.log(`[getBotTokenByBotType] Using main BOT_TOKEN`)
  return process.env.BOT_TOKEN || null
}

/**
 * Определяет токен бота по bookmaker (старый способ, для обратной совместимости)
 * mostbet -> BOT_TOKEN_MOSTBET
 * 1xbet -> BOT_TOKEN_1XBET
 * остальные -> BOT_TOKEN (основной бот)
 */
export function getBotTokenByBookmaker(bookmaker: string | null | undefined): string | null {
  if (!bookmaker) {
    console.log(`[getBotTokenByBookmaker] No bookmaker provided, using main BOT_TOKEN`)
    return process.env.BOT_TOKEN || null
  }

  const normalized = bookmaker.toLowerCase()
  console.log(`[getBotTokenByBookmaker] Bookmaker: "${bookmaker}", normalized: "${normalized}"`)

  // Проверяем mostbet первым (чтобы избежать совпадений)
  if (normalized.includes('mostbet')) {
    const token = process.env.BOT_TOKEN_MOSTBET || process.env.BOT_TOKEN || null
    console.log(`[getBotTokenByBookmaker] Matched Mostbet, using BOT_TOKEN_MOSTBET: ${token ? 'configured' : 'NOT configured'}`)
    return token
  }

  // Проверяем 1xbet (включая варианты с xbet)
  // Улучшенная проверка для различных вариантов написания
  if (normalized.includes('1xbet') || normalized === 'xbet' || normalized.startsWith('1x') || normalized.includes('1xbet')) {
    const token = process.env.BOT_TOKEN_1XBET || process.env.BOT_TOKEN || null
    console.log(`[getBotTokenByBookmaker] Matched 1xbet, using BOT_TOKEN_1XBET: ${token ? 'configured' : 'NOT configured'}`)
    if (!token) {
      console.error(`❌ [getBotTokenByBookmaker] BOT_TOKEN_1XBET is NOT configured in environment variables!`)
    }
    return token
  }

  // Для остальных казино используем основной бот
  console.log(`[getBotTokenByBookmaker] No match, using main BOT_TOKEN`)
  return process.env.BOT_TOKEN || null
}

/**
 * Редактирование сообщения "Ваша заявка отправлена" на "Ваши средства зачислены"
 */
export async function editRequestCreatedMessage(
  userId: bigint,
  messageId: bigint | null,
  newMessage: string,
  bookmaker?: string | null
): Promise<boolean> {
  if (!messageId) return false

  try {
    const botToken = bookmaker ? getBotTokenByBookmaker(bookmaker) : (process.env.BOT_TOKEN || null)
    if (!botToken) {
      console.warn(`[editRequestCreatedMessage] BOT_TOKEN not configured for bookmaker: ${bookmaker || 'main'}`)
      return false
    }

    const editMessageUrl = `https://api.telegram.org/bot${botToken}/editMessageText`
    const response = await fetch(editMessageUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: userId.toString(),
        message_id: Number(messageId),
        text: newMessage,
        parse_mode: 'HTML',
      })
    })

    const data = await response.json()
    if (data.ok) {
      console.log(`✅ [editRequestCreatedMessage] Message ${messageId} edited successfully for user ${userId}`)
      return true
    } else {
      console.warn(`⚠️ [editRequestCreatedMessage] Failed to edit message ${messageId}: ${data.description}`)
      return false
    }
  } catch (error) {
    console.warn('Failed to edit request created message:', error)
    return false
  }
}

/**
 * Удаление сообщения "Ваша заявка отправлена" при успешном пополнении или отклонении
 */
export async function deleteRequestCreatedMessage(
  userId: bigint,
  messageId: bigint | null,
  bookmaker?: string | null,
  botType?: string | null
): Promise<void> {
  if (!messageId) return

  try {
    // Используем botType с приоритетом, если он передан
    let botToken: string | null = null
    if (botType) {
      botToken = getBotTokenByBotType(botType)
    } else if (bookmaker) {
      botToken = getBotTokenByBookmaker(bookmaker)
    } else {
      botToken = process.env.BOT_TOKEN || null
    }
    
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
  requestId?: number | null,
  botType?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[sendNotificationToUser] userId: ${userId.toString()}, bookmaker: ${bookmaker || 'null'}, requestId: ${requestId || 'null'}, botType: ${botType || 'null'}`)
    
    // Приоритет: botType > bookmaker > основной бот
    let botToken: string | null = null
    if (botType) {
      botToken = getBotTokenByBotType(botType)
      console.log(`[sendNotificationToUser] Using botType: ${botType}`)
    } else if (bookmaker) {
      botToken = getBotTokenByBookmaker(bookmaker)
      console.log(`[sendNotificationToUser] Using bookmaker: ${bookmaker}`)
    } else {
      botToken = process.env.BOT_TOKEN || null
      console.log(`[sendNotificationToUser] Using default main bot`)
    }

    console.log(`[sendNotificationToUser] botToken: ${botToken ? 'configured' : 'NOT configured'}, bookmaker: ${bookmaker}`)

    if (!botToken) {
      const errorMsg = `BOT_TOKEN not configured for bookmaker: ${bookmaker || 'main'}`
      console.error(`❌ [sendNotificationToUser] ${errorMsg}`)
      return { success: false, error: errorMsg }
    }

    // Если есть requestId, редактируем сообщение "Ваша заявка отправлена" на новое сообщение
    if (requestId) {
      try {
        const request = await prisma.request.findUnique({
          where: { id: requestId },
          select: { requestCreatedMessageId: true },
        })
        if (request?.requestCreatedMessageId) {
          // Пытаемся отредактировать сообщение вместо удаления
          const edited = await editRequestCreatedMessage(userId, request.requestCreatedMessageId, message, bookmaker)
          if (edited) {
            // Если редактирование успешно, не отправляем новое сообщение
            console.log(`✅ [sendNotificationToUser] Message ${request.requestCreatedMessageId} edited successfully, skipping new message send`)
            // Очищаем message_id после редактирования
            await prisma.request.update({
              where: { id: requestId },
              data: { requestCreatedMessageId: null },
            })
            // Сохраняем сообщение в БД
            try {
              // Используем переданный botType или определяем из bookmaker
              let messageBotType = (botType as string) || 'main'
              if (!botType && bookmaker) {
                const normalized = bookmaker.toLowerCase()
                if (normalized.includes('mostbet')) {
                  messageBotType = 'mostbet'
                } else if (normalized.includes('1xbet') || normalized.includes('xbet')) {
                  messageBotType = '1xbet'
                }
              }
              // Получаем message_id из отредактированного сообщения (оно то же самое)
              await prisma.chatMessage.create({
                data: {
                  userId,
                  messageText: message,
                  messageType: 'text',
                  direction: 'out',
                  botType: messageBotType,
                  telegramMessageId: request.requestCreatedMessageId,
                },
              })
            } catch (dbError) {
              console.warn('Failed to save edited notification to DB:', dbError)
            }
            return { success: true }
          } else {
            // Если редактирование не удалось, удаляем старое сообщение и отправляем новое
            console.log(`⚠️ [sendNotificationToUser] Failed to edit message, deleting and sending new one`)
            await deleteRequestCreatedMessage(userId, request.requestCreatedMessageId, bookmaker)
            await prisma.request.update({
              where: { id: requestId },
              data: { requestCreatedMessageId: null },
            })
          }
        }
      } catch (error) {
        console.warn('Failed to edit/delete request created message:', error)
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
      const errorMsg = `Telegram API error: ${telegramData.description || 'Unknown error'}`
      console.error(`❌ [sendNotificationToUser] ${errorMsg}`, telegramData)
      return { success: false, error: errorMsg }
    }

    console.log(`✅ [sendNotificationToUser] Message sent successfully to user ${userId.toString()}, message_id: ${telegramData.result?.message_id}`)

    // Сохраняем сообщение в БД
    try {
      // Используем переданный botType или определяем из bookmaker
      let messageBotType = (botType as string) || 'main'
      if (!botType && bookmaker) {
        const normalized = bookmaker.toLowerCase()
        if (normalized.includes('mostbet')) {
          messageBotType = 'mostbet'
        } else if (normalized.includes('1xbet') || normalized.includes('xbet')) {
          messageBotType = '1xbet'
        }
      }

      await prisma.chatMessage.create({
        data: {
          userId,
          messageText: message,
          messageType: 'text',
          direction: 'out',
          botType: messageBotType,
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
 * Использует значение из Config.SUPPORT (по умолчанию @helperbingo_bot)
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
    return process.env.ADMIN_USERNAME || '@helperbingo_bot'
  } catch {
    return '@helperbingo_bot'
  }
}

/**
 * Форматирование суммы без лишних нулей
 */
function formatAmount(amount: number): string {
  // Если число целое, убираем .00
  if (amount % 1 === 0) {
    return amount.toString()
  }
  // Иначе оставляем 2 знака после запятой
  return amount.toFixed(2)
}

/**
 * Формирование сообщения о пополнении (новый формат)
 */
export function formatDepositMessage(
  amount: number, 
  casino: string, 
  accountId: string, 
  adminUsername: string, 
  lang: string = 'ru',
  processingTime?: string | null
): string {
  // Формируем время обработки
  let timeText = '1s' // По умолчанию для автопополнения
  if (processingTime) {
    timeText = processingTime
  }
  
  const amountFormatted = formatAmount(amount)
  
  if (lang === 'ky') {
    return `✅   ${timeText}\n` +
           `💸   ${amountFormatted} KGS\n` +
           `🆔   ${accountId}`
  }
  
  return `✅   ${timeText}\n` +
         `💸   ${amountFormatted} KGS\n` +
         `🆔   ${accountId}`
}

/**
 * Формирование инструкции для вывода (перед сообщением о выводе)
 */
export function formatWithdrawInstruction(casino: string): string {
  const casinoLower = casino.toLowerCase().trim()
  // Проверяем точно 888starz (может быть написано как 888starz, 888Starz, 888 STARZ и т.д.)
  const is888starz = casinoLower === '888starz' || 
                     casinoLower.includes('888starz') ||
                     (casinoLower.includes('888') && casinoLower.includes('starz'))
  
  if (is888starz) {
    return `📍 Заходим👇🏻\n` +
           `📍1. Настройки!\n` +
           `📍2. Вывести со счета!\n` +
           `📍3. Касса\n` +
           `📍4. Сумму для Вывода!\n` +
           `📍(Город Бишкек, улица Киевская)\n` +
           `📍5. Подтвердить\n` +
           `📍6. Получить Код!\n` +
           `📍7. Отправить его нам`
  }
  
  // Для всех остальных казино используется адрес Bingo KG
  return `📍 Заходим👇🏻\n` +
         `📍1. Настройки!\n` +
         `📍2. Вывести со счета!\n` +
         `📍3. Касса\n` +
         `📍4. Сумму для Вывода!\n` +
         `📍(Город Бишкек, Bingo KG)\n` +
         `📍5. Подтвердить\n` +
         `📍6. Получить Код!\n` +
         `📍7. Отправить его нам`
}

/**
 * Получить название банка по ID
 */
function getBankName(bankId: string | null | undefined): string | null {
  if (!bankId) return null
  
  const bankMap: Record<string, string> = {
    'mbank': 'MBank',
    'kompanion': 'Компаньон',
    'odengi': 'O!Money',
    'bakai': 'Bakai',
    'balance': 'Balance.kg',
    'megapay': 'MegaPay',
    'omoney': 'О деньги',
    'demir': 'DemirBank',
    'demirbank': 'DemirBank',
  }
  
  const normalized = bankId.toLowerCase().trim()
  return bankMap[normalized] || bankId
}

/**
 * Формирование сообщения о выводе (новый формат)
 */
export function formatWithdrawMessage(
  amount: number, 
  casino: string, 
  accountId: string, 
  adminUsername: string, 
  lang: string = 'ru',
  processingTime?: string | null,
  bank?: string | null
): string {
  // Формируем время обработки
  let timeText = '1s' // По умолчанию для автопополнения
  if (processingTime) {
    timeText = processingTime
  }
  
  // Формируем банк (преобразуем ID в название)
  let bankText = ''
  const bankName = getBankName(bank)
  if (bankName) {
    bankText = `\n💳   ${bankName}`
  }
  
  const amountFormatted = formatAmount(amount)
  
  if (lang === 'ky') {
    return `✅   ${timeText}\n` +
           `💸   ${amountFormatted} KGS` +
           bankText
  }
  
  return `✅   ${timeText}\n` +
         `💸   ${amountFormatted} KGS` +
         bankText
}

/**
 * Формирование сообщения о принятии заявки на вывод
 */
export function formatWithdrawRequestMessage(amount: number, accountId: string, adminUsername: string, lang: string = 'ru'): string {
  if (lang === 'ky') {
    return `✅ Вывод ${amount.toFixed(2)} сом\n` +
           `🆔 ${accountId}\n` +
           `⏳ Ваши деньги поступят на ваш кошелёк в течение 5 минут.\n\n` +
           `👨‍💻 Оператор:  ${adminUsername}`
  }
  
  return `✅ Вывод ${amount.toFixed(2)} сом\n` +
         `🆔 ${accountId}\n` +
         `⏳ Ваши деньги поступят на ваш кошелёк в течение 5 минут.\n\n` +
         `👨‍💻 Оператор:  ${adminUsername}`
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
 * Отправка сообщения с инлайн кнопкой "Главное меню"
 */
export async function sendMessageWithMainMenuButton(
  userId: bigint,
  message: string,
  bookmaker?: string | null,
  botType?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`📤 [sendMessageWithMainMenuButton] Starting: userId=${userId.toString()}, bookmaker=${bookmaker || 'null'}, botType=${botType || 'null'}`)
    console.log(`📤 [sendMessageWithMainMenuButton] Message preview: ${message.substring(0, 100)}...`)
    
    // Приоритет: botType > bookmaker > основной бот
    let botToken: string | null = null
    if (botType) {
      botToken = getBotTokenByBotType(botType)
      console.log(`📤 [sendMessageWithMainMenuButton] Using botType: ${botType}`)
    } else if (bookmaker) {
      botToken = getBotTokenByBookmaker(bookmaker)
      console.log(`📤 [sendMessageWithMainMenuButton] Using bookmaker: ${bookmaker}`)
    } else {
      botToken = process.env.BOT_TOKEN || null
      console.log(`📤 [sendMessageWithMainMenuButton] Using default main bot`)
    }
    
    console.log(`📤 [sendMessageWithMainMenuButton] Bot token: ${botToken ? 'configured (' + botToken.substring(0, 10) + '...)' : 'NOT configured'}`)
    
    if (!botToken) {
      const errorMsg = `BOT_TOKEN not configured for botType: ${botType || 'null'}, bookmaker: ${bookmaker || 'null'}`
      console.error(`❌ [sendMessageWithMainMenuButton] ${errorMsg}`)
      return { success: false, error: errorMsg }
    }

    const sendMessageUrl = `https://api.telegram.org/bot${botToken}/sendMessage`
    const requestBody = {
      chat_id: userId.toString(),
      text: message,
      // Не используем parse_mode, т.к. сообщение содержит только эмодзи и текст
      reply_markup: {
        inline_keyboard: [[
          {
            text: '← Главное меню',
            callback_data: 'main_menu'
          }
        ]]
      }
    }
    
    console.log(`📤 [sendMessageWithMainMenuButton] Sending to Telegram API (non-blocking)...`)
    
    // Отправляем запрос БЕЗ ожидания ответа для максимальной скорости
    // Это гарантирует, что функция вернется мгновенно, а уведомление отправится в фоне
    fetch(sendMessageUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    })
      .then(async (response) => {
        const data = await response.json()
        console.log(`📤 [sendMessageWithMainMenuButton] Telegram API response: ok=${data.ok}, description=${data.description || 'none'}`)
        
        if (data.ok) {
          console.log(`✅ [sendMessageWithMainMenuButton] Message sent with main menu button to user ${userId.toString()}, message_id: ${data.result?.message_id || 'unknown'}`)
        } else {
          console.error(`❌ [sendMessageWithMainMenuButton] Failed to send message: ${data.description}`)
          console.error(`❌ [sendMessageWithMainMenuButton] Full error response:`, JSON.stringify(data, null, 2))
        }
      })
      .catch((error) => {
        console.error(`❌ [sendMessageWithMainMenuButton] Exception sending message:`, error)
      })
    
    // Возвращаем успех сразу, не дожидаясь ответа от Telegram API
    // Это критично важно для мгновенной отправки уведомления
    return { success: true }
  } catch (error: any) {
    console.error('❌ [sendMessageWithMainMenuButton] Exception:', error)
    console.error('❌ [sendMessageWithMainMenuButton] Error stack:', error.stack)
    return { success: false, error: error.message }
  }
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
    const support = process.env.ADMIN_USERNAME || '@helperbingo_bot'
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

