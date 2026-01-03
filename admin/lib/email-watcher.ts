/**
 * IMAP Watcher для автоматического пополнения
 * Читает email от банков и обрабатывает входящие платежи
 * Настроен для работы с localhost API
 */
import Imap from 'imap'
import { simpleParser } from 'mailparser'
import { prisma } from './prisma'
import { parseEmailByBank } from './email-parsers'
import { matchAndProcessPayment } from './auto-deposit'

interface WatcherSettings {
  enabled: boolean
  imapHost: string
  email: string
  password: string
  folder: string
  bank: string
  intervalSec: number
}

// API URL для localhost
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api'

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
  // Сначала проверяем BotConfiguration (новый способ), затем BotSetting (старый способ для совместимости)
  let autodepositValue: string | null = null
  
  const botConfigSetting = await prisma.botConfiguration.findUnique({
    where: { key: 'autodeposit_enabled' },
  })
  
  if (botConfigSetting) {
    autodepositValue = botConfigSetting.value
  } else {
    const botSetting = await prisma.botSetting.findUnique({
      where: { key: 'autodeposit_enabled' },
    })
    if (botSetting) {
      autodepositValue = botSetting.value
    }
  }

  // Фиксированные настройки для Timeweb
  // IMAP сервер: imap.timeweb.ru
  // Порт SSL: 993
  // Порт STARTTLS: 143 (не используется, используем SSL)
  return {
    enabled: autodepositValue === '1' || autodepositValue?.toLowerCase() === 'true',
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

            // ВАЖНО: Проверяем дату письма - если письмо старше 24 часов, пропускаем его
            // (обрабатываем только свежие письма, чтобы не обрабатывать очень старые письма)
            const emailDate = parsed.date || new Date()
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
            
            if (emailDate < oneDayAgo) {
              console.log(`⚠️ Email UID ${uid} is too old (${emailDate.toISOString()}), marking as read and skipping`)
              // Помечаем старые письма как прочитанные, чтобы не обрабатывать их снова
              imap.setFlags(uid, ['\\Seen'], (err: Error | null) => {
                if (err) {
                  console.error(`❌ Error marking old email as seen:`, err)
                } else {
                  console.log(`✅ Old email UID ${uid} marked as read (skipped)`)
                }
                resolve()
              })
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
            // Помечаем как прочитанное, даже если не смогли распарсить
            // Используем setFlags вместо addFlags для более надежной установки флага
            imap.setFlags(uid, ['\\Seen'], (err: Error | null) => {
              if (err) {
                console.error(`❌ Error marking unparseable email as seen:`, err)
              } else {
                console.log(`✅ Unparseable email UID ${uid} marked as read`)
              }
              resolve()
            })
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
            const existingPayment = await prisma.incomingPayment.findFirst({
              where: {
                amount: amount,
                bank: bank,
                paymentDate: {
                  gte: new Date(paymentDate.getTime() - 10 * 60000), // ±10 минут
                  lte: new Date(paymentDate.getTime() + 10 * 60000),
                },
              },
            })

            if (existingPayment) {
              console.log(`⚠️ Payment already exists: ID ${existingPayment.id}, amount: ${amount}, date: ${paymentDate.toISOString()}`)
              console.log(`   Skipping duplicate payment. Marking email as read immediately.`)
              
              // СРАЗУ помечаем письмо как прочитанное, чтобы не обрабатывать его снова
              // Используем setFlags вместо addFlags для более надежной установки флага
              imap.setFlags(uid, ['\\Seen'], (err: Error | null) => {
                if (err) {
                  console.error(`❌ Error marking email as seen:`, err)
                } else {
                  console.log(`✅ Email UID ${uid} marked as read (duplicate skipped)`)
                }
                resolve()
              })
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

            // Пытаемся найти совпадение и автоматически пополнить баланс СРАЗУ (синхронно)
            let matchResult = await matchAndProcessPayment(incomingPayment.id, amount)
            if (matchResult.success) {
              console.log(`✅ Auto-deposit completed for payment ${incomingPayment.id}, request ${matchResult.requestId}`)
            } else {
              console.log(`ℹ️ No matching request found for payment ${incomingPayment.id} (amount: ${amount}), will retry immediately...`)
              // Если заявка не найдена сразу, делаем несколько повторных попыток БЕЗ ЗАДЕРЖЕК
              // Это нужно на случай, если заявка создается одновременно или сразу после платежа
              for (let attempt = 1; attempt <= 3; attempt++) {
                matchResult = await matchAndProcessPayment(incomingPayment.id, amount)
                if (matchResult.success) {
                  console.log(`✅ Auto-deposit completed on retry ${attempt} for payment ${incomingPayment.id}, request ${matchResult.requestId}`)
                  break
                }
              }
            }
            
            // ВСЕГДА запускаем общую проверку заявок СРАЗУ после сохранения платежа (независимо от результата matchAndProcessPayment)
            // Это гарантирует максимально быструю обработку, даже если заявка создается одновременно или сразу после платежа
            // Используем setImmediate для неблокирующего выполнения, но запускаем немедленно
            setImmediate(async () => {
              try {
                const { checkPendingRequestsForPayments } = await import('./auto-deposit')
                await checkPendingRequestsForPayments()
              } catch (error: any) {
                // Игнорируем ошибки, чтобы не прерывать обработку
              }
            })

            // СРАЗУ помечаем письмо как прочитанное ПОСЛЕ успешной обработки
            // Это критично важно, чтобы не обрабатывать письмо повторно
            // Используем setFlags вместо addFlags для более надежной установки флага
            imap.setFlags(uid, ['\\Seen'], (err: Error | null) => {
              if (err) {
                console.error(`❌ Error marking email as seen:`, err)
                // Даже при ошибке помечания как прочитанное, считаем обработку завершенной
              } else {
                console.log(`✅ Email UID ${uid} marked as read (payment saved: ID ${incomingPayment.id})`)
              }
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

// Функция matchAndProcessPayment импортируется из ./auto-deposit

/**
 * Проверка всех непрочитанных писем (для первого запуска после перезапуска)
 * Просто помечает все непрочитанные письма как прочитанные, не обрабатывая их
 * Это ускоряет запуск и предотвращает обработку старых писем
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
        console.log('🔍 Marking all unread emails as read (first run after restart)...')
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
            console.log(`✅ Marked ${results.length} unread email(s) as read (skipped processing)`)
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
 * Проверка новых писем с использованием уже открытого соединения
 * Это намного быстрее, чем создание нового соединения каждый раз
 */
async function checkEmailsWithConnection(imap: Imap, settings: WatcherSettings): Promise<void> {
  return new Promise((resolve, reject) => {
    // Используем уже открытое соединение imap
    // Ищем непрочитанные письма за последние 30 минут
    const thirtyMinutesAgo = new Date()
    thirtyMinutesAgo.setMinutes(thirtyMinutesAgo.getMinutes() - 30)
    const searchDate = [
      'SINCE',
      thirtyMinutesAgo.toISOString().split('T')[0].replace(/-/g, '-')
    ]
    
    // Ищем только UNSEEN (непрочитанные) письма за последние 30 минут
    imap.search(['UNSEEN', searchDate], (err: Error | null, results?: number[]) => {
      if (err) {
        reject(err)
        return
      }

      if (!results || results.length === 0) {
        resolve()
        return
      }

      console.log(`📬 Found ${results.length} unread email(s) (since ${thirtyMinutesAgo.toISOString().split('T')[0]})`)

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
          resolve()
        })
        .catch((error) => {
          reject(error)
        })
    })
  })
}

/**
 * Проверка новых писем (только за последние 30 минут)
 * Создает новое соединение - используется только для одноразовых проверок
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

        // Ищем только НЕПРОЧИТАННЫЕ письма за последние 30 минут
        // После обработки помечаем их как прочитанные, чтобы не обрабатывать повторно
        const thirtyMinutesAgo = new Date()
        thirtyMinutesAgo.setMinutes(thirtyMinutesAgo.getMinutes() - 30)
        const searchDate = [
          'SINCE',
          thirtyMinutesAgo.toISOString().split('T')[0].replace(/-/g, '-')
        ]
        
        // Ищем только UNSEEN (непрочитанные) письма за последние 30 минут
        // Это гарантирует, что каждое письмо обработается только один раз
        imap.search(['UNSEEN', searchDate], (err: Error | null, results?: number[]) => {
          if (err) {
            reject(err)
            return
          }

          if (!results || results.length === 0) {
            console.log('📭 No unread emails (last 30 minutes)')
            // Сбрасываем счетчик при успешной проверке
            consecutiveNetworkErrors = 0
            imap.end()
            resolve()
            return
          }

          console.log(`📬 Found ${results.length} unread email(s) (since ${thirtyMinutesAgo.toISOString().split('T')[0]})`)

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
  return startIdleModeWithTracking(settings)
}

/**
 * IDLE режим с отслеживанием соединения для возможности переподключения при смене активного кошелька
 */
async function startIdleModeWithTracking(settings: WatcherSettings): Promise<void> {
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

    // Сохраняем соединение и интервалы в глобальные переменные
    currentImap = imap
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

        // Слушаем события о новых письмах - используем уже открытое соединение
        imap.on('mail', async () => {
          console.log('📬 New email detected! Processing...')
          try {
            await checkEmailsWithConnection(imap, settings)
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
        
        // Максимально быстрый polling если IDLE не работает (каждые 200ms для мгновенной обработки)
        // Это практически реальное время с минимальной задержкой
        idleInterval = setInterval(async () => {
          try {
            // Проверяем, не изменились ли учетные данные активного кошелька
            const newSettings = await getWatcherSettings()
            if (newSettings.email !== settings.email || newSettings.password !== settings.password) {
              console.log('🔄 Active wallet changed during polling! Reconnecting...')
              if (idleInterval) clearInterval(idleInterval)
              if (keepAliveInterval) clearInterval(keepAliveInterval)
              imap.end()
              // Выбрасываем специальную ошибку для переподключения
              reject(new Error('WALLET_CHANGED'))
              return
            }
            
            await checkEmailsWithConnection(imap, settings)
          } catch (error: any) {
            if (error.message === 'WALLET_CHANGED') {
              // Это не ошибка, а сигнал для переподключения
              reject(error)
              return
            }
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
        }, 200) // Проверка каждые 200ms для мгновенной обработки (практически реальное время)
        
        // Сохраняем интервалы в глобальные переменные
        currentIdleInterval = idleInterval
        currentKeepAliveInterval = keepAliveInterval
        
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
        currentImap = null
        currentIdleInterval = null
        currentKeepAliveInterval = null
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
        currentImap = null
        currentIdleInterval = null
        currentKeepAliveInterval = null
        reject(err)
      }
    })

    imap.once('end', () => {
      console.log('⚠️ IMAP connection ended, reconnecting...')
      if (idleInterval) clearInterval(idleInterval)
      if (keepAliveInterval) clearInterval(keepAliveInterval)
      // Очищаем глобальные переменные только если это текущее соединение
      if (currentImap === imap) {
        currentImap = null
        currentIdleInterval = null
        currentKeepAliveInterval = null
      }
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
    // Вызываем API для проверки таймаутов (используем localhost)
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

// Текущие учетные данные для отслеживания изменений
let currentEmail: string | null = null
let currentPassword: string | null = null
let currentImap: Imap | null = null
let currentIdleInterval: NodeJS.Timeout | null = null
let currentKeepAliveInterval: NodeJS.Timeout | null = null

/**
 * Закрытие текущего IMAP соединения
 */
function closeCurrentConnection(): void {
  if (currentIdleInterval) {
    clearInterval(currentIdleInterval)
    currentIdleInterval = null
  }
  if (currentKeepAliveInterval) {
    clearInterval(currentKeepAliveInterval)
    currentKeepAliveInterval = null
  }
  if (currentImap) {
    try {
      if (currentImap.state !== 'disconnected' && currentImap.state !== 'end') {
        currentImap.end()
      }
    } catch (error) {
      // Игнорируем ошибки при закрытии
    }
    currentImap = null
  }
}

/**
 * Запуск watcher в режиме реального времени (IDLE)
 */
export async function startWatcher(): Promise<void> {
  console.log('🚀 Starting Email Watcher (IDLE mode - real-time)...')
  console.log(`📡 API Base URL: ${API_BASE_URL}`)

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

  // Запускаем проверку заявок мгновенно и затем каждые 100ms для максимально быстрого автопополнения
  const { checkPendingRequestsForPayments } = await import('./auto-deposit')
  
  // Немедленный запуск для мгновенной обработки
  setImmediate(() => {
    checkPendingRequestsForPayments().catch((error) => {
      console.warn('⚠️ Auto-deposit check failed:', error.message)
    })
  })
  
  // Периодическая проверка каждые 200ms для максимально быстрой обработки
  // 200ms обеспечивает практически мгновенную обработку без излишней нагрузки
  const autoDepositCheckInterval = setInterval(() => {
    checkPendingRequestsForPayments().catch((error) => {
      console.warn('⚠️ Auto-deposit check failed:', error.message)
    })
  }, 200) // Каждые 200ms для максимально быстрой обработки

  console.log('✅ Auto-deposit check started (immediate + every 500ms)')

  while (true) {
    try {
      const settings = await getWatcherSettings()

      if (!settings.enabled) {
        console.log('⏸️ Autodeposit is disabled, waiting 30 seconds...')
        // Закрываем соединение если оно открыто
        if (currentEmail || currentPassword) {
          console.log('🔌 Closing IMAP connection (autodeposit disabled)...')
          closeCurrentConnection()
          currentEmail = null
          currentPassword = null
        }
        await new Promise((resolve) => setTimeout(resolve, 30000))
        continue
      }

      if (!settings.email || !settings.password) {
        console.warn('⚠️ IMAP credentials not configured!')
        console.warn('   Please set email and password in the active requisite (BotRequisite with isActive=true)')
        console.warn('   Waiting 30 seconds...')
        // Закрываем соединение если оно открыто
        if (currentEmail || currentPassword) {
          console.log('🔌 Closing IMAP connection (credentials missing)...')
          closeCurrentConnection()
          currentEmail = null
          currentPassword = null
        }
        await new Promise((resolve) => setTimeout(resolve, 30000))
        continue
      }

      // Проверяем, изменились ли учетные данные
      const emailChanged = currentEmail !== settings.email
      const passwordChanged = currentPassword !== settings.password
      
      if (emailChanged || passwordChanged) {
        console.log('🔄 Active wallet changed! Reconnecting with new credentials...')
        console.log(`   Old email: ${currentEmail || 'none'}`)
        console.log(`   New email: ${settings.email}`)
        
        // Закрываем старое соединение
        closeCurrentConnection()
        
        // Обновляем текущие учетные данные
        currentEmail = settings.email
        currentPassword = settings.password
        
        // Обрабатываем все непрочитанные письма с новыми учетными данными
        console.log('🔄 Processing all unread emails with new wallet...')
        try {
          await checkAllUnreadEmails(settings)
          console.log('✅ Finished processing all unread emails with new wallet')
        } catch (error: any) {
          console.error('❌ Error processing unread emails with new wallet:', error.message)
          // Продолжаем работу даже если обработка не удалась
        }
      } else if (!currentEmail && !currentPassword) {
        // Первое подключение
        currentEmail = settings.email
        currentPassword = settings.password
        
        // При первом запуске обрабатываем ВСЕ непрочитанные письма
        if (isFirstRun) {
          console.log('🔄 First run detected - processing all unread emails...')
          try {
            await checkAllUnreadEmails(settings)
            console.log('✅ Finished processing all unread emails, switching to real-time mode...')
          } catch (error: any) {
            console.error('❌ Error processing unread emails on first run:', error.message)
            // Продолжаем работу даже если обработка непрочитанных писем не удалась
          }
          isFirstRun = false
        }
      }

      console.log(`📧 Connecting to ${settings.imapHost} (${settings.email})...`)

      // Запускаем IDLE режим (реальное время)
      try {
        await startIdleModeWithTracking(settings)
      } catch (error: any) {
        if (error.message === 'WALLET_CHANGED') {
          // Активный кошелек изменился - сразу переподключаемся без задержки
          console.log('🔄 Wallet changed detected, reconnecting immediately...')
          continue
        } else if (error.textCode === 'AUTHENTICATIONFAILED') {
          console.error('❌ IMAP Authentication Failed!')
          console.error('   Please check email and password in the active requisite')
          console.error(`   Email: ${settings.email ? '✓ set' : '✗ missing'}`)
          console.error(`   Password: ${settings.password ? '✓ set' : '✗ missing'}`)
          // Сбрасываем текущие учетные данные при ошибке аутентификации
          currentEmail = null
          currentPassword = null
          closeCurrentConnection()
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

