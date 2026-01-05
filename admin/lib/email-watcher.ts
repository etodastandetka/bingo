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
  walletId?: number
}

interface Wallet {
  id: number
  email: string
  password: string
  bank: string | null
}

// Rate limiting для логов сетевых ошибок
let lastNetworkErrorLog = 0
const NETWORK_ERROR_LOG_INTERVAL = 60000 // Логируем не чаще раза в минуту
let consecutiveNetworkErrors = 0
const MAX_CONSECUTIVE_ERRORS_BEFORE_LOG = 3 // Логируем только после 3+ ошибок подряд

/**
 * Получение всех кошельков с email и password
 */
async function getAllWallets(): Promise<Wallet[]> {
  const wallets = await prisma.botRequisite.findMany({
    where: {
      email: { not: null },
      password: { not: null },
    },
    select: {
      id: true,
      email: true,
      password: true,
      bank: true,
    },
  })

  return wallets
    .filter((w) => w.email && w.password)
    .map((w) => ({
      id: w.id,
      email: w.email!,
      password: w.password!,
      bank: w.bank,
    }))
}

/**
 * Преобразование кошелька в настройки watcher
 */
function walletToSettings(wallet: Wallet, enabled: boolean): WatcherSettings {
  return {
    enabled,
    imapHost: 'imap.timeweb.ru', // Timeweb IMAP сервер
    email: wallet.email,
    password: wallet.password,
    folder: 'INBOX', // Всегда INBOX
    bank: wallet.bank || 'DEMIRBANK', // Используем банк из кошелька или DEMIRBANK по умолчанию
    intervalSec: 60, // Фиксированный интервал 60 секунд
    walletId: wallet.id,
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
            // ВАЖНО: Делаем это синхронно (await), чтобы письмо точно было помечено до обработки
            await new Promise<void>((resolveFlag) => {
              imap.setFlags(uid, ['\\Seen'], (err: Error | null) => {
                if (err) {
                  console.error(`❌ [Wallet ${settings.walletId || 'N/A'}] Error marking email UID ${uid} as seen (before processing):`, err)
                } else {
                  console.log(`✅ [Wallet ${settings.walletId || 'N/A'}] Email UID ${uid} marked as read (before processing to prevent duplicates)`)
                }
                resolveFlag() // Разрешаем Promise независимо от результата
              })
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
            // Используем строгое окно ±2 минуты для более точной проверки дубликатов
            // Проверяем ВСЕ платежи (обработанные и необработанные) для надежности
            const existingPayment = await prisma.incomingPayment.findFirst({
              where: {
                amount: {
                  gte: amount - 0.0001, // Точное сравнение с учетом ошибок округления
                  lte: amount + 0.0001,
                },
                bank: bank,
                paymentDate: {
                  gte: new Date(paymentDate.getTime() - 2 * 60000), // ±2 минуты (более строго)
                  lte: new Date(paymentDate.getTime() + 2 * 60000),
                },
              },
              orderBy: { createdAt: 'desc' },
            })

            if (existingPayment) {
              console.log(`⚠️ [Wallet ${settings.walletId || 'N/A'}] Payment already exists: ID ${existingPayment.id}, amount: ${amount}, date: ${paymentDate.toISOString()}`)
              console.log(`   Skipping duplicate payment. Email UID ${uid} already processed.`)
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

            // ФОНОВОЕ АВТОПОПОЛНЕНИЕ: Ищем ВСЕ pending заявки с такой же суммой и вызываем автопополнение
            // Это обрабатывает заявки как с фото чека, так и без него
            // Заявки без чека не показываются в дашборде, но автопополнение работает для них в фоне
            // Обрабатываем ВСЕ заявки без ограничений
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
            const matchingRequests = await prisma.request.findMany({
              where: {
                requestType: 'deposit',
                status: 'pending',
                createdAt: { gte: tenMinutesAgo },
                // Обрабатываем ВСЕ заявки (с чеком и без) - автопополнение работает в фоне
              },
              orderBy: { createdAt: 'asc' }, // Берем самую старую заявку (FIFO)
              select: {
                id: true,
                amount: true,
                photoFileUrl: true, // Проверяем наличие чека для логирования
                incomingPayments: {
                  select: { isProcessed: true },
                },
              },
            })

            // Фильтруем по точному совпадению суммы и проверяем, что нет обработанных платежей
            const exactMatch = matchingRequests.find((req) => {
              if (!req.amount) return false
              
              // Пропускаем заявки, у которых уже есть обработанный платеж
              const hasProcessedPayment = req.incomingPayments?.some(p => p.isProcessed === true)
              if (hasProcessedPayment) {
                return false
              }
              
              const reqAmount = parseFloat(req.amount.toString())
              // Точное сравнение: суммы должны совпадать полностью (включая копейки)
              // Используем очень маленький допуск (0.0001) только для ошибок округления float
              const diff = Math.abs(reqAmount - amount)
              return diff < 0.0001 // Только для ошибок округления, не для допуска копеек
            })

            if (exactMatch) {
              const hasReceipt = !!exactMatch.photoFileUrl
              console.log(`✅ [Background Auto-Deposit] Found pending request ${exactMatch.id} with matching amount ${amount} (${hasReceipt ? 'with' : 'without'} receipt), processing in background`)
              // Вызываем автопополнение для найденной заявки в фоне (не блокируем обработку других писем)
              // Работает для заявок с чеком и без - заявки без чека не показываются в дашборде, но обрабатываются
              const { matchAndProcessPayment } = await import('./auto-deposit')
              matchAndProcessPayment(incomingPayment.id, amount)
                .then(() => {
                  console.log(`✅ [Background Auto-Deposit] Successfully processed payment ${incomingPayment.id} → request ${exactMatch.id} (${hasReceipt ? 'with receipt' : 'without receipt'})`)
                })
                .catch((autoDepositError: any) => {
                  console.error(`❌ [Background Auto-Deposit] Error processing payment ${incomingPayment.id} → request ${exactMatch.id}:`, autoDepositError.message)
                })
            } else {
              console.log(`ℹ️ No pending request found with amount ${amount}, payment saved: ID ${incomingPayment.id}`)
            }

            // Письмо уже помечено как прочитанное выше, просто завершаем
            console.log(`✅ Payment saved: ID ${incomingPayment.id}, email UID ${uid} already marked as read`)
            resolve()
          } catch (error: any) {
            console.error(`❌ [Wallet ${settings.walletId || 'N/A'}] Error processing email (UID: ${uid}):`, error.message || error)
            // НЕ reject'им - просто resolve, чтобы не прерывать обработку других писем
            // Письмо уже помечено как прочитанное, так что оно не будет обработано повторно
            resolve()
          }
        })
      })
    })

    fetch.once('error', (err: Error) => {
      console.error(`❌ [Wallet ${settings.walletId || 'N/A'}] Error fetching email UID ${uid}:`, err.message || err)
      // НЕ reject'им - просто resolve, чтобы не прерывать обработку других писем
      resolve()
    })
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
                // processEmail теперь всегда resolve, но на всякий случай ловим ошибки
                console.error(`❌ [Wallet ${settings.walletId || 'N/A'}] Error processing email UID ${uid}:`, error.message || error)
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
              // ВАЖНО: Даже если произошла ошибка, мы все равно resolve, чтобы продолжить работу
              console.error(`❌ [Wallet ${settings.walletId || 'N/A'}] Error in processSequentially:`, error.message || error)
              consecutiveNetworkErrors = 0
              imap.end()
              resolve() // НЕ reject - продолжаем работу
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
          console.log(`📬 [Wallet ${settings.walletId || 'N/A'}] New email detected! Processing...`)
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
                console.warn(`⚠️ [Wallet ${settings.walletId || 'N/A'}] Network error processing new emails (${error.code}): ${error.message || error} (${consecutiveNetworkErrors} consecutive errors)`)
                lastNetworkErrorLog = now
              }
            } else {
              // Другие ошибки - логируем, но не прерываем работу
              console.error(`❌ [Wallet ${settings.walletId || 'N/A'}] Error processing new emails:`, error.message || error)
            }
            // НЕ пробрасываем ошибку дальше - продолжаем слушать новые письма
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
            // Обрабатываем сетевые ошибки (DNS, таймауты) - не логируем как критичные
            if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
              consecutiveNetworkErrors++
              const now = Date.now()
              
              // Логируем только если прошло достаточно времени и есть несколько ошибок подряд
              if (consecutiveNetworkErrors >= MAX_CONSECUTIVE_ERRORS_BEFORE_LOG && 
                  (now - lastNetworkErrorLog) > NETWORK_ERROR_LOG_INTERVAL) {
                console.warn(`⚠️ [Wallet ${settings.walletId || 'N/A'}] Network error in polling (${error.code}): ${error.message || error.hostname || 'Connection issue'} (${consecutiveNetworkErrors} consecutive errors)`)
                lastNetworkErrorLog = now
              }
              // При DNS ошибках увеличиваем задержку перед следующей попыткой
              // Это снижает нагрузку на DNS и дает время на восстановление сети
              if (error.code === 'ENOTFOUND') {
                await new Promise((resolve) => setTimeout(resolve, 30000)) // 30 секунд при DNS ошибках
              }
              // Продолжаем работу, попробуем снова через интервал
              return
            }
            
            // Другие ошибки - логируем, но продолжаем работу
            consecutiveNetworkErrors = 0
            console.error(`❌ [Wallet ${settings.walletId || 'N/A'}] Error in quick polling:`, error.message || error)
            // НЕ прерываем работу - продолжаем проверку
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

// Хранилище флагов первого запуска для каждого кошелька
const firstRunFlags = new Map<number, boolean>()

// Хранилище активных watchers для каждого кошелька
const activeWatchers = new Map<number, { interval: NodeJS.Timeout | null; keepAlive: NodeJS.Timeout | null }>()

// Отслеживание запущенных watchers для каждого кошелька (чтобы не запускать дубликаты)
const runningWatchers = new Set<number>()

/**
 * Запуск watcher для одного кошелька
 */
async function startWalletWatcher(wallet: Wallet): Promise<void> {
  const walletId = wallet.id
  
  // Получаем флаг включен/выключен из БД
  const enabledSetting = await prisma.botSetting.findUnique({
    where: { key: 'autodeposit_enabled' },
  })
  const enabled = enabledSetting?.value === '1'

  if (!enabled) {
    console.log(`⏸️ Autodeposit is disabled, skipping wallet ${walletId} (${wallet.email})`)
    return
  }

  const settings = walletToSettings(wallet, enabled)

  console.log(`🚀 Starting Email Watcher for wallet ${walletId} (${settings.email})...`)

  while (true) {
    try {
      if (!settings.email || !settings.password) {
        console.warn(`⚠️ IMAP credentials not configured for wallet ${walletId} (${settings.email})`)
        console.warn('   Waiting 30 seconds...')
        await new Promise((resolve) => setTimeout(resolve, 30000))
        continue
      }

      console.log(`📧 [Wallet ${walletId}] Connecting to ${settings.imapHost} (${settings.email})...`)

      // При первом запуске для этого кошелька помечаем все непрочитанные письма как прочитанные
      const isFirstRun = !firstRunFlags.has(walletId)
      if (isFirstRun) {
        console.log(`🔄 [Wallet ${walletId}] First run detected - marking all unread emails as read...`)
        try {
          await checkAllUnreadEmails(settings)
          console.log(`✅ [Wallet ${walletId}] Finished marking unread emails as read, switching to real-time mode...`)
        } catch (error: any) {
          console.error(`❌ [Wallet ${walletId}] Error marking unread emails on first run:`, error.message)
          // Продолжаем работу даже если помечание непрочитанных писем не удалось
        }
        firstRunFlags.set(walletId, true)
      }

      // Запускаем IDLE режим (реальное время)
      try {
        await startIdleMode(settings)
      } catch (error: any) {
        if (error.textCode === 'AUTHENTICATIONFAILED') {
          console.error(`❌ [Wallet ${walletId}] IMAP Authentication Failed!`)
          console.error(`   Please check email and password for wallet ${walletId}`)
          console.error(`   Email: ${settings.email ? '✓ set' : '✗ missing'}`)
          console.error(`   Password: ${settings.password ? '✓ set' : '✗ missing'}`)
          console.error(`   Waiting 60 seconds before retry...`)
          await new Promise((resolve) => setTimeout(resolve, 60000))
        } else {
          console.error(`❌ [Wallet ${walletId}] IDLE mode error, reconnecting in 10 seconds...`, error.message)
          await new Promise((resolve) => setTimeout(resolve, 10000))
        }
      }
    } catch (error: any) {
      console.error(`❌ [Wallet ${walletId}] Error in watcher:`, error)
      await new Promise((resolve) => setTimeout(resolve, 10000))
    }
  }
}

/**
 * Запуск watcher для всех кошельков параллельно
 */
export async function startWatcher(): Promise<void> {
  console.log('🚀 Starting Email Watcher for all wallets (IDLE mode - real-time)...')

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

  // Запускаем watcher для каждого кошелька параллельно
  while (true) {
    try {
      const wallets = await getAllWallets()
      
      if (wallets.length === 0) {
        console.warn('⚠️ No wallets found with email and password')
        console.warn('   Waiting 30 seconds...')
        await new Promise((resolve) => setTimeout(resolve, 30000))
        continue
      }

      console.log(`📋 Found ${wallets.length} wallet(s) to monitor`)

      // Запускаем watcher для каждого кошелька параллельно (неблокирующе)
      for (const wallet of wallets) {
        // Проверяем, не запущен ли уже watcher для этого кошелька
        if (runningWatchers.has(wallet.id)) {
          continue // Пропускаем, если watcher уже запущен
        }

        // Помечаем watcher как запущенный
        runningWatchers.add(wallet.id)
        
        // Запускаем watcher для каждого кошелька в фоне (не ждем завершения)
        startWalletWatcher(wallet)
          .catch((error) => {
            console.error(`❌ [Wallet ${wallet.id}] Fatal error in watcher:`, error)
            // Удаляем из списка запущенных при фатальной ошибке, чтобы можно было перезапустить
            runningWatchers.delete(wallet.id)
          })
          .finally(() => {
            // Удаляем из списка запущенных когда watcher завершается (для переподключения)
            runningWatchers.delete(wallet.id)
          })
      }

      // Ждем 60 секунд перед следующей проверкой списка кошельков
      // (кошельки работают независимо в фоне)
      await new Promise((resolve) => setTimeout(resolve, 60000))
    } catch (error: any) {
      console.error('❌ Error in main watcher loop:', error)
      await new Promise((resolve) => setTimeout(resolve, 10000))
    }
  }
}

/**
 * Одноразовая проверка (для ручного запуска)
 * Проверяет все кошельки один раз
 */
export async function checkEmailsOnce(): Promise<void> {
  // Получаем флаг включен/выключен из БД
  const enabledSetting = await prisma.botSetting.findUnique({
    where: { key: 'autodeposit_enabled' },
  })

  if (enabledSetting?.value !== '1') {
    console.log('⏸️ Autodeposit is disabled')
    return
  }

  const wallets = await getAllWallets()

  if (wallets.length === 0) {
    throw new Error('No wallets found with email and password')
  }

  // Проверяем все кошельки параллельно
  await Promise.all(
    wallets.map(async (wallet) => {
      const settings = walletToSettings(wallet, true)
      if (!settings.email || !settings.password) {
        console.warn(`⚠️ Wallet ${wallet.id} missing email or password`)
        return
      }
      try {
        await checkEmails(settings)
      } catch (error: any) {
        console.error(`❌ Error checking wallet ${wallet.id}:`, error.message)
      }
    })
  )
}

