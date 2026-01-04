/**
 * IMAP Watcher для автоматического пополнения
 * Читает email от банков и обрабатывает входящие платежи
 */
import Imap from 'imap'
import { simpleParser } from 'mailparser'
import { prisma } from './prisma'
import { parseEmailByBank } from './email-parsers'
// Убрали импорт matchAndProcessPayment - автопополнение теперь вызывается только при создании заявки с фото чека

interface WatcherSettings {
  enabled: boolean
  imapHost: string
  email: string
  password: string
  folder: string
  bank: string
  intervalSec: number
}

// Rate limiting для логов сетевых ошибок
let lastNetworkErrorLog = 0
const NETWORK_ERROR_LOG_INTERVAL = 60000 // Логируем не чаще раза в минуту
let consecutiveNetworkErrors = 0
const MAX_CONSECUTIVE_ERRORS_BEFORE_LOG = 3 // Логируем только после 3+ ошибок подряд

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
  // IMAP сервер: imap.timeweb.ru
  // Порт SSL: 993
  // Порт STARTTLS: 143 (не используется, используем SSL)
  return {
    enabled: enabledSetting?.value === '1',
    imapHost: 'imap.timeweb.ru', // Timeweb IMAP сервер
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

            // КРИТИЧЕСКИ ВАЖНО: Помечаем письмо как прочитанное СРАЗУ после получения
            // Это предотвращает повторную обработку одного и того же письма
            // Делаем это ДО обработки, чтобы письмо не попало снова в непрочитанные
            imap.setFlags(uid, ['\\Seen'], (err: Error | null) => {
              if (err) {
                console.error(`❌ Error marking email as seen (before processing):`, err)
              } else {
                console.log(`✅ Email UID ${uid} marked as read (before processing to prevent duplicates)`)
              }
            })

            // ВАЖНО: Проверяем дату письма - если письмо старше 7 дней, сразу помечаем как прочитанное
            // (увеличено до 7 дней, чтобы обрабатывать письма, которые пришли недавно)
            const emailDate = parsed.date || new Date()
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            
            if (emailDate < sevenDaysAgo) {
              console.log(`⚠️ Email UID ${uid} is too old (${emailDate.toISOString()}), skipping processing`)
              // Письмо уже помечено как прочитанное выше, просто завершаем
              resolve()
              return
            }

            // Парсим сумму и дату из письма
            const paymentData = parseEmailByBank(text, settings.bank)

          if (!paymentData) {
            console.log(`⚠️ Could not parse email (UID: ${uid})`)
            console.log(`   Bank setting: ${settings.bank}`)
            console.log(`   Trying to find amount pattern in text...`)
            // Попробуем показать, что именно ищем
            // Поддерживаем числа с пробелами: "1 000", "10 000", "100 000"
            // Поддерживаем запятые как разделители тысяч: "1,240.06"
            const amountPattern = /([0-9]{1,3}(?:[,\s]+[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:[,\s]+[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:,[0-9]{1,2})?)\s*(KGS|сом|сомов)/i
            const amountMatches = text.match(amountPattern)
            if (amountMatches) {
              console.log(`   Found potential amount: ${amountMatches[0]}`)
            } else {
              console.log(`   No amount pattern found`)
            }
            // Письмо уже помечено как прочитанное выше, просто завершаем
            console.log(`⚠️ Could not parse email (UID: ${uid}), skipping`)
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
              : emailDate // Используем дату письма, если не удалось распарсить дату из текста

            // ВАЖНО: Проверяем, не существует ли уже такой платеж (по сумме, дате и банку)
            // Это предотвращает дубликаты при повторной обработке писем
            // Увеличиваем окно поиска до ±10 минут для более надежной проверки
            // ОГРАНИЧИВАЕМ поиск только необработанными платежами для производительности
            const existingPayment = await prisma.incomingPayment.findFirst({
              where: {
                amount: amount,
                bank: bank,
                paymentDate: {
                  gte: new Date(paymentDate.getTime() - 10 * 60000), // ±10 минут
                  lte: new Date(paymentDate.getTime() + 10 * 60000),
                },
                // Проверяем как обработанные, так и необработанные (для надежности)
              },
              orderBy: { createdAt: 'desc' },
            })

            if (existingPayment) {
              console.log(`⚠️ Payment already exists: ID ${existingPayment.id}, amount: ${amount}, date: ${paymentDate.toISOString()}`)
              console.log(`   Skipping duplicate payment. Email already marked as read.`)
              // Письмо уже помечено как прочитанное выше, просто завершаем
              resolve()
              return
            }

            // Создаем новый платеж только если его еще нет
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

            // НОВАЯ ЛОГИКА: Только помечаем письмо как прочитанное, если есть pending заявка с такой же суммой
            // Автопополнение НЕ вызывается здесь - оно вызывается только при создании заявки с фото чека
            // ОГРАНИЧИВАЕМ количество записей для производительности (максимум 20 заявок)
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
            const matchingRequests = await prisma.request.findMany({
              where: {
                requestType: 'deposit',
                status: 'pending',
                createdAt: { gte: tenMinutesAgo },
              },
              orderBy: { createdAt: 'desc' },
              take: 20, // Ограничиваем количество для производительности
              select: {
                id: true,
                amount: true,
              },
            })

            // Фильтруем по точному совпадению суммы (как в auto-deposit.ts)
            const exactMatch = matchingRequests.find((req) => {
              if (!req.amount) return false
              const reqAmount = parseFloat(req.amount.toString())
              const diff = Math.abs(reqAmount - amount)
              return diff < 0.01 // Точность до 1 копейки
            })

            if (exactMatch) {
              console.log(`✅ Found pending request ${exactMatch.id} with matching amount ${amount}, marking email as read`)
            } else {
              console.log(`ℹ️ No pending request found with amount ${amount}, marking email as read anyway`)
            }

            // Письмо уже помечено как прочитанное выше, просто завершаем
            console.log(`✅ Payment saved: ID ${incomingPayment.id}, email UID ${uid} already marked as read`)
            resolve()
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

// Функция matchAndProcessPayment теперь импортируется из auto-deposit.ts
// Это оптимизированная версия, которая ищет за последние 5 минут (быстрее)

/**
 * Помечает все непрочитанные письма как прочитанные (при переподключении к новому аккаунту)
 */
async function checkAllUnreadEmails(settings: WatcherSettings): Promise<void> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: settings.email,
      password: settings.password,
      host: settings.imapHost,
      port: 993,
      tls: true,
      tlsOptions: { 
        rejectUnauthorized: false,
        servername: 'imap.timeweb.ru',
      },
      connTimeout: 30000,
      authTimeout: 10000,
    })

    imap.once('ready', () => {
      consecutiveNetworkErrors = 0
      imap.openBox(settings.folder, false, (err: Error | null) => {
        if (err) {
          reject(err)
          return
        }

        // Ищем ВСЕ непрочитанные письма (без фильтра по дате)
        console.log('🔍 Marking all unread emails as read (new account connection)...')
        imap.search(['UNSEEN'], (err: Error | null, results?: number[]) => {
          if (err) {
            reject(err)
            return
          }

          if (!results || results.length === 0) {
            console.log('📭 No unread emails found')
            consecutiveNetworkErrors = 0
            imap.end()
            resolve()
            return
          }

          console.log(`📬 Found ${results.length} unread email(s) - marking as read (skipping processing)...`)

          // Просто помечаем все письма как прочитанные, не обрабатывая их
          imap.setFlags(results, ['\\Seen'], (err: Error | null) => {
            if (err) {
              console.error(`❌ Error marking emails as read:`, err)
              imap.end()
              reject(err)
              return
            }

            consecutiveNetworkErrors = 0
            console.log(`✅ Marked ${results.length} unread email(s) as read`)
            imap.end()
            resolve()
          })
        })
      })
    })

    imap.once('error', (err: Error) => {
      if ((err as any).code === 'ENOTFOUND' || (err as any).code === 'ETIMEDOUT' || (err as any).code === 'ECONNREFUSED') {
        consecutiveNetworkErrors++
        const now = Date.now()
        if (consecutiveNetworkErrors >= MAX_CONSECUTIVE_ERRORS_BEFORE_LOG && 
            (now - lastNetworkErrorLog) > NETWORK_ERROR_LOG_INTERVAL) {
          console.warn(`⚠️ IMAP network error in checkAllUnreadEmails (${(err as any).code}): ${err.message || err}`)
          lastNetworkErrorLog = now
        }
        resolve()
        return
      }
      reject(err)
    })

    imap.once('end', () => {
      resolve()
    })

    imap.connect()
  })
}

/**
 * Проверка новых писем (только за последние 15 минут)
 */
async function checkEmails(settings: WatcherSettings): Promise<void> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: settings.email,
      password: settings.password,
      host: settings.imapHost, // imap.timeweb.ru
      port: 993, // SSL порт для IMAP (Timeweb)
      tls: true, // Используем SSL/TLS
      tlsOptions: { 
        rejectUnauthorized: false, // Разрешаем самоподписанные сертификаты
        servername: 'imap.timeweb.ru', // Явно указываем имя сервера для SNI
      },
      connTimeout: 30000, // Таймаут подключения 30 секунд
      authTimeout: 10000, // Таймаут авторизации 10 секунд
    })

    imap.once('ready', () => {
      // Сбрасываем счетчик ошибок при успешном подключении
      consecutiveNetworkErrors = 0
      imap.openBox(settings.folder, false, (err: Error | null) => {
        if (err) {
          reject(err)
          return
        }

        // Ищем непрочитанные письма за последние 15 минут (обычный режим)
        const fifteenMinutesAgo = new Date()
        fifteenMinutesAgo.setMinutes(fifteenMinutesAgo.getMinutes() - 15)
        const searchDate = [
          'SINCE',
          fifteenMinutesAgo.toISOString().split('T')[0].replace(/-/g, '-')
        ]
        
        // Используем более строгий фильтр: только UNSEEN письма за последние 15 минут
        imap.search(['UNSEEN', searchDate], (err: Error | null, results?: number[]) => {
          if (err) {
            reject(err)
            return
          }

          if (!results || results.length === 0) {
            console.log('📭 No new emails (last 15 minutes)')
            // Сбрасываем счетчик при успешной проверке
            consecutiveNetworkErrors = 0
            imap.end()
            resolve()
            return
          }

          console.log(`📬 Found ${results.length} new email(s) (since ${fifteenMinutesAgo.toISOString().split('T')[0]})`)

          // Обрабатываем каждое письмо последовательно (не параллельно), чтобы избежать конфликтов
          const processSequentially = async () => {
            for (const uid of results!) {
              try {
                await processEmail(imap, uid, settings)
              } catch (error: any) {
                console.error(`❌ Error processing email UID ${uid}:`, error.message)
                // Продолжаем обработку остальных писем даже при ошибке
              }
            }
          }

          processSequentially()
            .then(() => {
              // Сбрасываем счетчик при успешной обработке
              consecutiveNetworkErrors = 0
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
      // Обрабатываем сетевые ошибки с rate limiting
      if ((err as any).code === 'ENOTFOUND' || (err as any).code === 'ETIMEDOUT' || (err as any).code === 'ECONNREFUSED') {
        consecutiveNetworkErrors++
        const now = Date.now()
        
        // Логируем только если прошло достаточно времени и есть несколько ошибок подряд
        if (consecutiveNetworkErrors >= MAX_CONSECUTIVE_ERRORS_BEFORE_LOG && 
            (now - lastNetworkErrorLog) > NETWORK_ERROR_LOG_INTERVAL) {
          console.warn(`⚠️ IMAP network error in checkEmails (${(err as any).code}): ${err.message || err} (${consecutiveNetworkErrors} consecutive errors)`)
          lastNetworkErrorLog = now
        }
        // Не reject при сетевых ошибках, просто resolve чтобы продолжить работу
        resolve()
        return
      }
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
      host: settings.imapHost, // imap.timeweb.ru
      port: 993, // SSL порт для IMAP (Timeweb)
      tls: true, // Используем SSL/TLS
      tlsOptions: { 
        rejectUnauthorized: false, // Разрешаем самоподписанные сертификаты
        servername: 'imap.timeweb.ru', // Явно указываем имя сервера для SNI
      },
      connTimeout: 30000, // Таймаут подключения 30 секунд
      authTimeout: 10000, // Таймаут авторизации 10 секунд
    })

    let idleInterval: NodeJS.Timeout | null = null
    let keepAliveInterval: NodeJS.Timeout | null = null

    imap.once('ready', () => {
      console.log(`✅ Connected to IMAP (${settings.email})`)
      // Сбрасываем счетчик ошибок при успешном подключении
      consecutiveNetworkErrors = 0
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
            // Сбрасываем счетчик при успешной обработке
            consecutiveNetworkErrors = 0
          } catch (error: any) {
            // Обрабатываем сетевые ошибки с rate limiting
            if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
              consecutiveNetworkErrors++
              const now = Date.now()
              if (consecutiveNetworkErrors >= MAX_CONSECUTIVE_ERRORS_BEFORE_LOG && 
                  (now - lastNetworkErrorLog) > NETWORK_ERROR_LOG_INTERVAL) {
                console.warn(`⚠️ Network error processing new emails (${error.code}): ${error.message || error} (${consecutiveNetworkErrors} consecutive errors)`)
                lastNetworkErrorLog = now
              }
            } else {
              console.error('Error processing new emails:', error)
            }
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
            // Проверяем, не изменился ли активный реквизит
            const currentActiveRequisite = await prisma.botRequisite.findFirst({
              where: { isActive: true },
              select: { id: true, email: true },
            })
            
            const newRequisiteId = currentActiveRequisite?.id || null
            const newRequisiteEmail = currentActiveRequisite?.email || null
            
            // Если активный реквизит изменился - завершаем соединение для переподключения
            if (currentActiveRequisiteId !== null && 
                (newRequisiteId !== currentActiveRequisiteId || 
                 newRequisiteEmail !== settings.email)) {
              console.log(`🔄 Active requisite changed during polling!`)
              console.log(`   Previous: ID ${currentActiveRequisiteId}, Email: ${settings.email}`)
              console.log(`   New: ID ${newRequisiteId}, Email: ${newRequisiteEmail}`)
              console.log(`   Ending current connection to reconnect...`)
              
              if (idleInterval) clearInterval(idleInterval)
              if (keepAliveInterval) clearInterval(keepAliveInterval)
              imap.end()
              resolve() // Завершаем Promise, чтобы переподключиться в основном цикле
              return
            }
            
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
            // Обрабатываем сетевые ошибки (DNS, таймауты) - не логируем как критичные
            if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
              consecutiveNetworkErrors++
              const now = Date.now()
              
              // Логируем только если прошло достаточно времени и есть несколько ошибок подряд
              if (consecutiveNetworkErrors >= MAX_CONSECUTIVE_ERRORS_BEFORE_LOG && 
                  (now - lastNetworkErrorLog) > NETWORK_ERROR_LOG_INTERVAL) {
                console.warn(`⚠️ Network error in polling (${error.code}): ${error.message || error.hostname || 'Connection issue'} (${consecutiveNetworkErrors} consecutive errors)`)
                lastNetworkErrorLog = now
              }
              // Продолжаем работу, попробуем снова через интервал
              return
            }
            
            // Сбрасываем счетчик при других ошибках или успехе
            consecutiveNetworkErrors = 0
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
        if (idleInterval) clearInterval(idleInterval)
        if (keepAliveInterval) clearInterval(keepAliveInterval)
        reject(err)
      } else if ((err as any).code === 'ENOTFOUND' || (err as any).code === 'ETIMEDOUT' || (err as any).code === 'ECONNREFUSED') {
        // Сетевые ошибки - не критичные, логируем с rate limiting
        consecutiveNetworkErrors++
        const now = Date.now()
        
        // Логируем только если прошло достаточно времени и есть несколько ошибок подряд
        if (consecutiveNetworkErrors >= MAX_CONSECUTIVE_ERRORS_BEFORE_LOG && 
            (now - lastNetworkErrorLog) > NETWORK_ERROR_LOG_INTERVAL) {
          console.warn(`⚠️ IMAP network error (${(err as any).code}): ${err.message || err} (${consecutiveNetworkErrors} consecutive errors)`)
          lastNetworkErrorLog = now
        }
        // Не останавливаем интервалы, пусть продолжает пытаться
        // Не reject, чтобы не прерывать цикл переподключения
      } else {
        console.error('❌ IMAP connection error:', err)
        consecutiveNetworkErrors = 0 // Сбрасываем при других ошибках
        if (idleInterval) clearInterval(idleInterval)
        if (keepAliveInterval) clearInterval(keepAliveInterval)
        reject(err)
      }
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
 * Проверка таймаутов автопополнения
 * Вызывается периодически для проверки заявок, которые не были обработаны в течение 1 минуты
 */
async function checkTimeouts(): Promise<void> {
  try {
    // Вызываем API для проверки таймаутов
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
    const response = await fetch(`${baseUrl}/api/auto-deposit/check-timeout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    if (response.ok) {
      const data = await response.json()
      if (data.success && data.data.updated > 0) {
        console.log(`⏰ Timeout check: ${data.data.updated} requests changed to profile-1`)
      }
    }
  } catch (error: any) {
    // Игнорируем ошибки проверки таймаутов, чтобы не прерывать работу watcher
    console.warn('⚠️ Timeout check error:', error.message)
  }
}

// Флаг для отслеживания первого запуска после перезапуска
let isFirstRun = true

// Отслеживание текущего активного реквизита для переподключения при смене
let currentActiveRequisiteId: number | null = null
let currentActiveEmail: string | null = null

/**
 * Получение ID активного реквизита для отслеживания изменений
 */
async function getActiveRequisiteId(): Promise<number | null> {
  const activeRequisite = await prisma.botRequisite.findFirst({
    where: { isActive: true },
    select: { id: true, email: true },
  })
  return activeRequisite?.id || null
}

/**
 * Запуск watcher в режиме реального времени (IDLE)
 */
export async function startWatcher(): Promise<void> {
  console.log('🚀 Starting Email Watcher (IDLE mode - real-time)...')

  // Запускаем периодическую проверку таймаутов каждую минуту
  const timeoutInterval = setInterval(() => {
    checkTimeouts().catch((error) => {
      console.warn('⚠️ Timeout check failed:', error.message)
    })
  }, 60000) // Каждую минуту

  // Проверяем таймауты сразу при запуске
  checkTimeouts().catch((error) => {
    console.warn('⚠️ Initial timeout check failed:', error.message)
  })

  while (true) {
    try {
      const settings = await getWatcherSettings()
      
      // Получаем текущий активный реквизит для отслеживания изменений
      const activeRequisite = await prisma.botRequisite.findFirst({
        where: { isActive: true },
        select: { id: true, email: true },
      })
      
      const newRequisiteId = activeRequisite?.id || null
      const newEmail = activeRequisite?.email || null

      // Проверяем, изменился ли активный реквизит
      if (currentActiveRequisiteId !== null && 
          currentActiveRequisiteId !== newRequisiteId) {
        console.log(`🔄 Active requisite changed!`)
        console.log(`   Previous: ID ${currentActiveRequisiteId}, Email: ${currentActiveEmail}`)
        console.log(`   New: ID ${newRequisiteId}, Email: ${newEmail}`)
        console.log(`   Reconnecting to new email account...`)
        
        // Сбрасываем флаг первого запуска, чтобы обработать новые письма
        isFirstRun = true
      }

      // Обновляем текущие значения
      currentActiveRequisiteId = newRequisiteId
      currentActiveEmail = newEmail

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

      // При первом запуске просто помечаем все непрочитанные письма как прочитанные
      if (isFirstRun) {
        console.log('🔄 First run detected - marking all unread emails as read...')
        try {
          await checkAllUnreadEmails(settings)
          console.log('✅ Finished marking unread emails as read, switching to real-time mode...')
        } catch (error: any) {
          console.error('❌ Error marking unread emails on first run:', error.message)
          // Продолжаем работу даже если помечание непрочитанных писем не удалось
        }
        isFirstRun = false
      }

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

