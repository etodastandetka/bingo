/**
 * IMAP Watcher для автоматического пополнения
 * Читает email от банков и обрабатывает входящие платежи
 */
import Imap from 'imap'
import { simpleParser } from 'mailparser'
import { prisma } from './prisma'
import { parseEmailByBank } from './email-parsers'
import { depositToCasino } from './deposit-balance'

interface WatcherSettings {
  enabled: boolean
  imapHost: string
  email: string
  password: string
  folder: string
  bank: string
  intervalSec: number
}

/**
 * Получение настроек watcher из БД
 * Упрощенная версия: только флаг включен/выключен в БД, остальное фиксировано
 */
async function getWatcherSettings(): Promise<WatcherSettings> {
  // Получаем email и password из активного реквизита
  const activeRequisite = await prisma.botRequisite.findFirst({
    where: { isActive: true },
  })

  const email = activeRequisite?.email || ''
  const password = activeRequisite?.password || ''

  // Получаем только флаг включен/выключен из БД
  const enabledSetting = await prisma.botSetting.findUnique({
    where: { key: 'autodeposit_enabled' },
  })

  // Фиксированные настройки для Timeweb
  return {
    enabled: enabledSetting?.value === '1',
    imapHost: 'imap.timeweb.ru', // Всегда Timeweb
    email,
    password,
    folder: 'INBOX', // Всегда INBOX
    bank: 'DEMIRBANK', // Можно изменить если нужно, но по умолчанию DEMIRBANK
    intervalSec: 60, // Фиксированный интервал 60 секунд
  }
}

/**
 * Обработка одного письма
 */
async function processEmail(
  imap: Imap,
  uid: number,
  settings: WatcherSettings
): Promise<void> {
  return new Promise((resolve, reject) => {
    const fetch = imap.fetch(uid, { bodies: '' })

    fetch.on('message', (msg) => {
      msg.on('body', (stream) => {
        const chunks: Buffer[] = []

        stream.on('data', (chunk: Buffer) => {
          chunks.push(chunk)
        })

        stream.once('end', async () => {
          try {
            // Собираем полный буфер
            // @ts-ignore - Buffer.concat возвращает Buffer, который совместим с mailparser
            const buffer = Buffer.concat(chunks)
            // Парсим email
            const parsed = await simpleParser(buffer)
            const text = parsed.text || parsed.html || parsed.textAsHtml || ''

            // Логируем информацию о письме для отладки
            console.log(`📨 Email subject: ${parsed.subject || 'N/A'}`)
            console.log(`📨 Email from: ${parsed.from?.text || 'N/A'}`)
            console.log(`📨 Email text length: ${text.length} chars`)
            if (text.length > 0) {
              const preview = text.substring(0, 500).replace(/\n/g, ' ').replace(/\s+/g, ' ')
              console.log(`📨 Email preview: ${preview}...`)
            }

            // Парсим сумму и дату из письма
            const paymentData = parseEmailByBank(text, settings.bank)

          if (!paymentData) {
            console.log(`⚠️ Could not parse email (UID: ${uid})`)
            console.log(`   Bank setting: ${settings.bank}`)
            console.log(`   Trying to find amount pattern in text...`)
            // Попробуем показать, что именно ищем
            const amountPattern = /([0-9]+(?:[\.,][0-9]{1,2})?)\s*(KGS|сом|сомов)/i
            const amountMatches = text.match(amountPattern)
            if (amountMatches) {
              console.log(`   Found potential amount: ${amountMatches[0]}`)
            } else {
              console.log(`   No amount pattern found`)
            }
            resolve()
            return
          }

          const { amount, isoDatetime, bank } = paymentData

            console.log(
              `📧 Parsed email: ${bank}, amount: ${amount}, date: ${isoDatetime || 'N/A'}`
            )

            // Сохраняем входящий платеж в БД
            const paymentDate = isoDatetime
              ? new Date(isoDatetime)
              : new Date()

            const incomingPayment = await prisma.incomingPayment.create({
              data: {
                amount,
                bank,
                paymentDate,
                notificationText: text.substring(0, 500), // Первые 500 символов
                isProcessed: false,
              },
            })

            console.log(`✅ IncomingPayment saved: ID ${incomingPayment.id}`)

            // Пытаемся найти совпадение и автоматически пополнить баланс
            await matchAndProcessPayment(incomingPayment.id, amount)

            // Помечаем письмо как прочитанное
            imap.addFlags(uid, '\\Seen', (err: Error | null) => {
              if (err) console.error(`Error marking email as seen:`, err)
              resolve()
            })
          } catch (error: any) {
            console.error(`❌ Error processing email (UID: ${uid}):`, error)
            reject(error)
          }
        })
      })
    })

    fetch.once('error', reject)
    fetch.once('end', () => {
      // Если сообщений не было, все равно resolve
      resolve()
    })
  })
}

/**
 * Сопоставление платежа с заявкой и автоматическое пополнение
 */
async function matchAndProcessPayment(paymentId: number, amount: number): Promise<void> {
  // Ищем заявки на пополнение со статусом pending за последние 5 минут
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)

  const matchingRequests = await prisma.request.findMany({
    where: {
      requestType: 'deposit',
      status: 'pending',
      createdAt: {
        gte: fiveMinutesAgo,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  // Фильтруем по точному совпадению суммы (с точностью до копейки)
  const exactMatches = matchingRequests.filter((req) => {
    if (!req.amount) return false
    const reqAmount = parseFloat(req.amount.toString())
    return Math.abs(reqAmount - amount) < 0.01
  })

  if (exactMatches.length === 0) {
    console.log(`ℹ️ No matching request found for payment ${paymentId} (amount: ${amount})`)
    return
  }

  const request = exactMatches[0]

  if (!request.accountId || !request.bookmaker) {
    console.warn(`⚠️ Request ${request.id} missing accountId or bookmaker`)
    return
  }

  console.log(
    `🔍 Found matching request: ID ${request.id}, Account: ${request.accountId}, Bookmaker: ${request.bookmaker}`
  )

  // Обновляем статус платежа - связываем с заявкой
  await prisma.incomingPayment.update({
    where: { id: paymentId },
    data: {
      requestId: request.id,
      isProcessed: true,
    },
  })

  // Пополняем баланс через казино API
  try {
    const depositResult = await depositToCasino(
      request.bookmaker,
      request.accountId,
      parseFloat(request.amount?.toString() || '0')
    )

    if (!depositResult.success) {
      throw new Error(depositResult.message || 'Deposit failed')
    }

    // Успешное пополнение - обновляем статус заявки
    await prisma.request.update({
      where: { id: request.id },
      data: {
        status: 'autodeposit_success',
        statusDetail: 'auto_completed',
        processedAt: new Date(),
        updatedAt: new Date(),
      },
    })

    console.log(
      `✅ Auto-deposit successful: Request ${request.id}, Account ${request.accountId}`
    )
  } catch (error: any) {
    console.error(`❌ Auto-deposit failed for request ${request.id}:`, error)

    // В случае ошибки API казино, ставим статус profile-5
    await prisma.request.update({
      where: { id: request.id },
      data: {
        status: 'profile-5',
        statusDetail: 'api_error',
        processedAt: new Date(),
        updatedAt: new Date(),
      },
    })

    throw error
  }
}

/**
 * Проверка новых писем
 */
async function checkEmails(settings: WatcherSettings): Promise<void> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: settings.email,
      password: settings.password,
      host: settings.imapHost,
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
    })

    imap.once('ready', () => {
      imap.openBox(settings.folder, false, (err: Error | null) => {
        if (err) {
          reject(err)
          return
        }

        // Ищем непрочитанные письма
        imap.search(['UNSEEN'], (err: Error | null, results?: number[]) => {
          if (err) {
            reject(err)
            return
          }

          if (!results || results.length === 0) {
            console.log('📭 No new emails')
            imap.end()
            resolve()
            return
          }

          console.log(`📬 Found ${results.length} new email(s)`)

          // Обрабатываем каждое письмо
          Promise.all(results.map((uid) => processEmail(imap, uid, settings)))
            .then(() => {
              imap.end()
              resolve()
            })
            .catch((error) => {
              imap.end()
              reject(error)
            })
        })
      })
    })

    imap.once('error', (err: Error) => {
      reject(err)
    })

    imap.once('end', () => {
      resolve()
    })

    imap.connect()
  })
}

/**
 * IDLE режим для реального времени (реакция на новые письма мгновенно)
 */
async function startIdleMode(settings: WatcherSettings): Promise<void> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: settings.email,
      password: settings.password,
      host: settings.imapHost,
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 60000,
      authTimeout: 60000,
    })

    let idleInterval: NodeJS.Timeout | null = null
    let keepAliveInterval: NodeJS.Timeout | null = null

    imap.once('ready', () => {
      console.log(`✅ Connected to IMAP (${settings.email})`)
      imap.openBox(settings.folder, false, (err: Error | null) => {
        if (err) {
          reject(err)
          return
        }

        console.log(`📂 Opened folder: ${settings.folder}`)
        console.log('🔄 Starting IDLE mode (real-time monitoring)...')
        console.log('⏰ Watcher is now actively listening for new emails...')

        // Слушаем события о новых письмах
        imap.on('mail', async () => {
          console.log('📬 New email detected! Processing...')
          try {
            await checkEmails(settings)
          } catch (error: any) {
            console.error('Error processing new emails:', error)
          }
        })

        // Режим реального времени: используем событие 'mail' которое срабатывает автоматически
        // Библиотека imap автоматически отслеживает новые письма через IMAP IDLE если поддерживается
        // Если IDLE не поддерживается, используем быстрый polling (каждые 5 секунд)
        
        console.log('✅ Real-time mode active - listening for new emails...')
        
        // Быстрый polling если IDLE не работает (каждые 5 секунд вместо 60)
        // Это почти как реальное время, но с небольшой задержкой
        idleInterval = setInterval(async () => {
          try {
            await checkEmails(settings)
          } catch (error: any) {
            if (error.textCode === 'AUTHENTICATIONFAILED') {
              console.error('❌ Authentication failed in polling!')
              console.error('   Check email/password in active requisite')
              // Останавливаем интервал при ошибке аутентификации
              if (idleInterval) clearInterval(idleInterval)
              if (keepAliveInterval) clearInterval(keepAliveInterval)
              imap.end()
              reject(error)
              return
            }
            console.error('Error in quick polling:', error.message || error)
          }
        }, 5000) // Проверка каждые 5 секунд вместо 60
        
        // Keepalive: каждые 29 минут проверяем соединение
        keepAliveInterval = setInterval(() => {
          if (imap && imap.state !== 'authenticated') {
            console.warn('⚠️ Connection lost, will reconnect...')
            imap.end()
          }
        }, 29 * 60 * 1000)
      })
    })

    imap.once('error', (err: Error) => {
      if ((err as any).textCode === 'AUTHENTICATIONFAILED') {
        console.error('❌ IMAP Authentication Failed!')
        console.error('   Please check email and password in the active requisite')
        console.error(`   Email: ${settings.email ? '✓ set' : '✗ missing'}`)
        console.error(`   Password: ${settings.password ? '✓ set' : '✗ missing'}`)
      } else {
        console.error('❌ IMAP connection error:', err)
      }
      if (idleInterval) clearInterval(idleInterval)
      if (keepAliveInterval) clearInterval(keepAliveInterval)
      reject(err)
    })

    imap.once('end', () => {
      console.log('⚠️ IMAP connection ended, reconnecting...')
      if (idleInterval) clearInterval(idleInterval)
      if (keepAliveInterval) clearInterval(keepAliveInterval)
      resolve()
    })

    imap.connect()
  })
}

/**
 * Запуск watcher в режиме реального времени (IDLE)
 */
export async function startWatcher(): Promise<void> {
  console.log('🚀 Starting Email Watcher (IDLE mode - real-time)...')

  while (true) {
    try {
      const settings = await getWatcherSettings()

      if (!settings.enabled) {
        console.log('⏸️ Autodeposit is disabled, waiting 30 seconds...')
        await new Promise((resolve) => setTimeout(resolve, 30000))
        continue
      }

      if (!settings.email || !settings.password) {
        console.warn('⚠️ IMAP credentials not configured!')
        console.warn('   Please set email and password in the active requisite (BotRequisite with isActive=true)')
        console.warn('   Waiting 30 seconds...')
        await new Promise((resolve) => setTimeout(resolve, 30000))
        continue
      }

      console.log(`📧 Connecting to ${settings.imapHost} (${settings.email})...`)

      // Запускаем IDLE режим (реальное время)
      try {
        await startIdleMode(settings)
      } catch (error: any) {
        if (error.textCode === 'AUTHENTICATIONFAILED') {
          console.error('❌ IMAP Authentication Failed!')
          console.error('   Please check email and password in the active requisite')
          console.error(`   Email: ${settings.email ? '✓ set' : '✗ missing'}`)
          console.error(`   Password: ${settings.password ? '✓ set' : '✗ missing'}`)
          console.error('   Waiting 60 seconds before retry...')
          await new Promise((resolve) => setTimeout(resolve, 60000))
        } else {
          console.error('❌ IDLE mode error, reconnecting in 10 seconds...', error.message)
          await new Promise((resolve) => setTimeout(resolve, 10000))
        }
      }
    } catch (error: any) {
      console.error('❌ Error in watcher:', error)
      await new Promise((resolve) => setTimeout(resolve, 10000))
    }
  }
}

/**
 * Одноразовая проверка (для ручного запуска)
 */
export async function checkEmailsOnce(): Promise<void> {
  const settings = await getWatcherSettings()

  if (!settings.enabled) {
    console.log('⏸️ Autodeposit is disabled')
    return
  }

  if (!settings.email || !settings.password) {
    throw new Error('IMAP credentials not configured')
  }

  await checkEmails(settings)
}

