/**
 * IMAP Watcher для автоматического пополнения
 * Читает email от банков и обрабатывает входящие платежи
 */
import Imap from 'imap'
import { simpleParser } from 'mailparser'
import { prisma } from './prisma'
import { parseEmailByBank } from './email-parsers'
import dns from 'dns'
// Убрали импорт matchAndProcessPayment - автопополнение теперь вызывается только при создании заявки с фото чека

// Настраиваем DNS-серверы для более надежного резолвинга
// Используем Google DNS и Cloudflare DNS как fallback
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1', '1.0.0.1'])
  console.log('✅ DNS servers configured: Google DNS (8.8.8.8, 8.8.4.4) and Cloudflare DNS (1.1.1.1, 1.0.0.1)')
} catch (error) {
  console.warn('⚠️ Failed to set DNS servers:', error)
}

// IP-адрес imap.timeweb.ru для fallback (если DNS не работает)
const TIMEWEB_IMAP_IP = '176.57.223.17'
const TIMEWEB_IMAP_HOST = 'imap.timeweb.ru'

/**
 * Создает IMAP конфигурацию с fallback на IP-адрес при DNS-ошибках
 */
function createImapConfig(settings: WatcherSettings, useIpFallback: boolean = false) {
  const host = useIpFallback ? TIMEWEB_IMAP_IP : settings.imapHost
  
  return {
    user: settings.email,
    password: settings.password,
    host: host,
    port: 993,
    tls: true,
    tlsOptions: { 
      rejectUnauthorized: false,
      servername: TIMEWEB_IMAP_HOST, // Всегда используем доменное имя для SNI (даже при подключении по IP)
    },
    connTimeout: 30000,
    authTimeout: 10000,
  }
}

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
const NETWORK_ERROR_LOG_INTERVAL = 300000 // Логируем не чаще раза в 5 минут при множественных ошибках
let consecutiveNetworkErrors = 0
const MAX_CONSECUTIVE_ERRORS_BEFORE_LOG = 3 // Логируем только после 3+ ошибок подряд
const MAX_CONSECUTIVE_ERRORS_BEFORE_LONG_DELAY = 10 // После 10 ошибок увеличиваем задержку

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
  console.log(`🚀 [Wallet ${settings.walletId || 'N/A'}] processEmail called for UID ${uid}`)
  return new Promise((resolve, reject) => {
    const fetch = imap.fetch(uid, { bodies: '' })

    fetch.on('message', (msg) => {
      console.log(`📥 [Wallet ${settings.walletId || 'N/A'}] Fetching email UID ${uid}...`)
      msg.on('body', (stream) => {
        const chunks: Buffer[] = []

        stream.on('data', (chunk: Buffer) => {
          chunks.push(chunk)
        })

        stream.once('end', async () => {
          console.log(`📦 [Wallet ${settings.walletId || 'N/A'}] Email UID ${uid} body received, ${chunks.length} chunks, total size: ${chunks.reduce((sum, c) => sum + c.length, 0)} bytes`)
          try {
            // Собираем полный буфер
            // @ts-ignore - Buffer.concat возвращает Buffer, который совместим с mailparser
            const buffer = Buffer.concat(chunks)
            // Парсим email
            const parsed = await simpleParser(buffer)
            const text = parsed.text || parsed.html || parsed.textAsHtml || ''

            // ВАЖНО: Проверяем дату письма - если письмо старше 7 дней, сразу помечаем как прочитанное
            // (увеличено до 7 дней, чтобы обрабатывать письма, которые пришли недавно)
            const emailDate = parsed.date || new Date()
            
            // Логируем краткую информацию о письме
            console.log(`📨 [Wallet ${settings.walletId || 'N/A'}] Email UID ${uid}: ${parsed.subject || 'N/A'} from ${parsed.from?.text || 'N/A'}`)
            console.log(`   Email date: ${emailDate.toISOString()}, text length: ${text.length}`)

            // Письмо уже помечено как прочитанное в checkEmails перед обработкой
            // Здесь просто обрабатываем его содержимое
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            
            if (emailDate < sevenDaysAgo) {
              console.log(`⚠️ Email UID ${uid} is too old (${emailDate.toISOString()}), skipping processing`)
              // Письмо уже помечено как прочитанное выше, просто завершаем
              resolve()
              return
            }

            // Парсим сумму и дату из письма
            console.log(`🔍 [Wallet ${settings.walletId || 'N/A'}] Parsing email UID ${uid} with bank: ${settings.bank}`)
            console.log(`   Text preview (first 200 chars): ${text.substring(0, 200)}`)
            const paymentData = parseEmailByBank(text, settings.bank)

          if (!paymentData) {
            console.error(`❌ [Wallet ${settings.walletId || 'N/A'}] Could not parse email (UID: ${uid})`)
            console.error(`   Bank setting: ${settings.bank}`)
            console.error(`   Text length: ${text.length}`)
            console.error(`   Text sample: ${text.substring(0, 500)}`)
            // Письмо уже помечено как прочитанное выше, просто завершаем
            resolve()
            return
          }

          const { amount, isoDatetime, bank } = paymentData

            // СРАЗУ логируем сумму после парсинга
            console.log(`💰 [Wallet ${settings.walletId || 'N/A'}] Parsed payment: ${amount} KGS, bank: ${bank}, date: ${isoDatetime || 'N/A'}`)

            // Сохраняем входящий платеж в БД
            const paymentDate = isoDatetime
              ? new Date(isoDatetime)
              : emailDate // Используем дату письма, если не удалось распарсить дату из текста

            // ВАЖНО: Проверяем, не было ли уже обработано это письмо
            // Проверяем ТОЛЬКО по notificationText и bank - это уникальный идентификатор письма
            // НЕ проверяем по amount и paymentDate, так как разные платежи могут иметь одинаковую сумму и близкие даты
            const notificationTextPreview = text.substring(0, 500)
            const existingPayment = await prisma.incomingPayment.findFirst({
              where: {
                AND: [
                  { notificationText: notificationTextPreview },
                  { bank: bank },
                  // Проверяем только платежи, созданные в последние 7 дней
                  {
                    createdAt: {
                      gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                    },
                  },
                ],
              },
              orderBy: { createdAt: 'desc' },
            })

            if (existingPayment) {
              console.log(`⚠️ [Wallet ${settings.walletId || 'N/A'}] Payment already exists: ID ${existingPayment.id}, amount: ${existingPayment.amount}, date: ${existingPayment.paymentDate.toISOString()}`)
              console.log(`   Skipping duplicate payment. Email UID ${uid} already processed (same notificationText and bank).`)
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

            console.log(`✅ [Wallet ${settings.walletId || 'N/A'}] IncomingPayment saved: ID ${incomingPayment.id}, amount: ${amount} KGS`)

            // МГНОВЕННОЕ АВТОПОПОЛНЕНИЕ: Вызываем matchAndProcessPayment напрямую
            // Она сама найдет заявку по сумме и обработает ее максимально быстро
            // Не делаем двойной поиск - это ускоряет обработку
            try {
              const { matchAndProcessPayment } = await import('./auto-deposit')
              const result = await matchAndProcessPayment(incomingPayment.id, amount)
              if (result?.success) {
                console.log(`✅ [Instant Auto-Deposit] Successfully processed payment ${incomingPayment.id} → request ${result.requestId}`)
              } else {
                console.log(`ℹ️ [Instant Auto-Deposit] No matching request found for payment ${incomingPayment.id} (amount: ${amount}), payment saved for manual processing`)
              }
            } catch (autoDepositError: any) {
              console.error(`❌ [Instant Auto-Deposit] Error processing payment ${incomingPayment.id}:`, autoDepositError.message)
              // Продолжаем работу даже при ошибке - платеж сохранен, можно обработать вручную
            }

            // Письмо уже помечено как прочитанное выше, просто завершаем
            console.log(`✅ [Wallet ${settings.walletId || 'N/A'}] Payment saved: ID ${incomingPayment.id}, amount: ${amount} KGS`)
            resolve()
          } catch (error: any) {
            console.error(`❌ [Wallet ${settings.walletId || 'N/A'}] Error processing email (UID: ${uid}):`, error.message || error)
            console.error(`   Error stack:`, error.stack)
            // НЕ reject'им - просто resolve, чтобы не прерывать обработку других писем
            // Письмо уже помечено как прочитанное, так что оно не будет обработано повторно
            resolve()
          }
        })
      })
    })

    fetch.once('error', (err: Error) => {
      console.error(`❌ [Wallet ${settings.walletId || 'N/A'}] Error fetching email UID ${uid}:`, err.message || err)
      console.error(`   Error stack:`, err.stack)
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
    const useIpFallback = consecutiveNetworkErrors > 5
    const imap = new Imap(createImapConfig(settings, useIpFallback))
    
    if (useIpFallback) {
      console.log(`🔄 [Wallet ${settings.walletId || 'N/A'}] Using IP fallback (${TIMEWEB_IMAP_IP}) for checkAllUnreadEmails`)
    }

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
    // Пытаемся подключиться сначала с доменом, при ENOTFOUND - используем IP
    let useIpFallback = consecutiveNetworkErrors > 5 // Используем IP после 5+ DNS ошибок подряд
    
    const imap = new Imap(createImapConfig(settings, useIpFallback))
    
    if (useIpFallback) {
      console.log(`🔄 [Wallet ${settings.walletId || 'N/A'}] Using IP fallback (${TIMEWEB_IMAP_IP}) due to DNS issues`)
    }

    imap.once('ready', () => {
      // Сбрасываем счетчик ошибок при успешном подключении
      consecutiveNetworkErrors = 0
      imap.openBox(settings.folder, false, (err: Error | null) => {
        if (err) {
          reject(err)
          return
        }

        // Ищем непрочитанные письма за последние 2 минуты (для мгновенной реакции)
        const twoMinutesAgo = new Date()
        twoMinutesAgo.setMinutes(twoMinutesAgo.getMinutes() - 2)
        const searchDate = [
          'SINCE',
          twoMinutesAgo.toISOString().split('T')[0].replace(/-/g, '-')
        ]
        
        // Используем более строгий фильтр: только UNSEEN письма за последние 2 минуты
        imap.search(['UNSEEN', searchDate], async (err: Error | null, results?: number[]) => {
          if (err) {
            reject(err)
            return
          }

          if (!results || results.length === 0) {
            // Не логируем "No new emails" - это спам при polling каждую секунду
            // Сбрасываем счетчик при успешной проверке
            consecutiveNetworkErrors = 0
            imap.end()
            resolve()
            return
          }

          console.log(`📬 [Wallet ${settings.walletId || 'N/A'}] Found ${results.length} new email(s)`)
          console.log(`   Email UIDs: ${results.join(', ')}`)

          // КРИТИЧЕСКИ ВАЖНО: Помечаем ВСЕ найденные письма как прочитанные СРАЗУ после поиска
          // Это предотвращает повторную обработку при следующем polling (каждую секунду)
          // ВАЖНО: Ждем завершения setFlags перед началом обработки
          await new Promise<void>((resolveFlags) => {
            imap.setFlags(results!, ['\\Seen'], (err: Error | null) => {
              if (err) {
                console.error(`❌ [Wallet ${settings.walletId || 'N/A'}] Error marking emails as read:`, err)
              }
              resolveFlags() // Разрешаем Promise независимо от результата
            })
          })

          // Обрабатываем каждое письмо последовательно (не параллельно), чтобы избежать конфликтов
          const processSequentially = async () => {
            console.log(`🔄 [Wallet ${settings.walletId || 'N/A'}] Starting to process ${results!.length} email(s)...`)
            for (const uid of results!) {
              try {
                console.log(`📧 [Wallet ${settings.walletId || 'N/A'}] Processing email UID ${uid}...`)
                await processEmail(imap, uid, settings)
                console.log(`✅ [Wallet ${settings.walletId || 'N/A'}] Finished processing email UID ${uid}`)
              } catch (error: any) {
                // processEmail теперь всегда resolve, но на всякий случай ловим ошибки
                console.error(`❌ [Wallet ${settings.walletId || 'N/A'}] Error processing email UID ${uid}:`, error.message || error)
                // Продолжаем обработку остальных писем даже при ошибке
              }
            }
            console.log(`✅ [Wallet ${settings.walletId || 'N/A'}] Finished processing all ${results!.length} email(s)`)
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
      // Обрабатываем DNS-ошибки: пытаемся переподключиться с IP-адресом
      if ((err as any).code === 'ENOTFOUND' && !useIpFallback) {
        // Логируем только если прошло достаточно времени (чтобы не спамить)
        const now = Date.now()
        if ((now - lastNetworkErrorLog) > NETWORK_ERROR_LOG_INTERVAL) {
          console.log(`🔄 [Wallet ${settings.walletId || 'N/A'}] DNS error, retrying with IP address (${TIMEWEB_IMAP_IP})...`)
          lastNetworkErrorLog = now
        }
        imap.end()
        
        // Пытаемся подключиться с IP-адресом
        const imapWithIp = new Imap(createImapConfig(settings, true))
        
        imapWithIp.once('ready', () => {
          consecutiveNetworkErrors = 0 // Сбрасываем счетчик при успешном подключении
          imapWithIp.openBox(settings.folder, false, (err: Error | null) => {
            if (err) {
              reject(err)
              return
            }
            // Продолжаем с той же логикой поиска писем...
            const twoMinutesAgo = new Date()
            twoMinutesAgo.setMinutes(twoMinutesAgo.getMinutes() - 2)
            const searchDate = [
              'SINCE',
              twoMinutesAgo.toISOString().split('T')[0].replace(/-/g, '-')
            ]
            
            imapWithIp.search(['UNSEEN', searchDate], async (err: Error | null, results?: number[]) => {
              if (err) {
                reject(err)
                return
              }

              if (!results || results.length === 0) {
                // Не логируем "No new emails" - это спам при polling каждую секунду
                consecutiveNetworkErrors = 0
                imapWithIp.end()
                resolve()
                return
              }

              console.log(`📬 [Wallet ${settings.walletId || 'N/A'}] Found ${results.length} new email(s) (IP fallback)`)

              // КРИТИЧЕСКИ ВАЖНО: Помечаем ВСЕ найденные письма как прочитанные СРАЗУ после поиска
              // Это предотвращает повторную обработку при следующем polling
              // ВАЖНО: Ждем завершения setFlags перед началом обработки
              await new Promise<void>((resolveFlags) => {
                imapWithIp.setFlags(results!, ['\\Seen'], (err: Error | null) => {
                  if (err) {
                    console.error(`❌ [Wallet ${settings.walletId || 'N/A'}] Error marking emails as read (IP fallback):`, err)
                  }
                  resolveFlags() // Разрешаем Promise независимо от результата
                })
              })

              const processSequentially = async () => {
                for (const uid of results!) {
                  try {
                    await processEmail(imapWithIp, uid, settings)
                  } catch (error: any) {
                    console.error(`❌ [Wallet ${settings.walletId || 'N/A'}] Error processing email UID ${uid}:`, error.message || error)
                  }
                }
              }

              processSequentially()
                .then(() => {
                  consecutiveNetworkErrors = 0
                  imapWithIp.end()
                  resolve()
                })
                .catch((error) => {
                  console.error(`❌ [Wallet ${settings.walletId || 'N/A'}] Error in processSequentially:`, error.message || error)
                  consecutiveNetworkErrors = 0
                  imapWithIp.end()
                  resolve()
                })
            })
          })
        })
        
        imapWithIp.once('error', (ipErr: Error) => {
          consecutiveNetworkErrors++
          const now = Date.now()
          if (consecutiveNetworkErrors >= MAX_CONSECUTIVE_ERRORS_BEFORE_LOG && 
              (now - lastNetworkErrorLog) > NETWORK_ERROR_LOG_INTERVAL) {
            console.warn(`⚠️ IMAP network error in checkEmails (even with IP fallback) (${(ipErr as any).code}): ${ipErr.message || ipErr} (${consecutiveNetworkErrors} consecutive errors)`)
            lastNetworkErrorLog = now
          }
          resolve() // Продолжаем работу даже при ошибке
        })
        
        imapWithIp.connect()
        return
      }
      
      // Обрабатываем другие сетевые ошибки с rate limiting
      if ((err as any).code === 'ETIMEDOUT' || (err as any).code === 'ECONNREFUSED') {
        consecutiveNetworkErrors++
        const now = Date.now()
        
        if (consecutiveNetworkErrors >= MAX_CONSECUTIVE_ERRORS_BEFORE_LOG && 
            (now - lastNetworkErrorLog) > NETWORK_ERROR_LOG_INTERVAL) {
          console.warn(`⚠️ IMAP network error in checkEmails (${(err as any).code}): ${err.message || err} (${consecutiveNetworkErrors} consecutive errors)`)
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
 * IDLE режим для реального времени (реакция на новые письма мгновенно)
 */
async function startIdleMode(settings: WatcherSettings): Promise<void> {
  return new Promise((resolve, reject) => {
    const useIpFallback = consecutiveNetworkErrors > 5
    const imap = new Imap(createImapConfig(settings, useIpFallback))
    
    if (useIpFallback) {
      console.log(`🔄 [Wallet ${settings.walletId || 'N/A'}] Using IP fallback (${TIMEWEB_IMAP_IP}) for startIdleMode`)
    }

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
              
              // При DNS ошибках добавляем задержку перед следующей попыткой
              if (error.code === 'ENOTFOUND') {
                let delay = 30000 // Начальная задержка 30 секунд
                if (consecutiveNetworkErrors >= MAX_CONSECUTIVE_ERRORS_BEFORE_LONG_DELAY) {
                  if (consecutiveNetworkErrors >= 40) {
                    delay = 300000 // 5 минут
                  } else if (consecutiveNetworkErrors >= 30) {
                    delay = 240000 // 4 минуты
                  } else if (consecutiveNetworkErrors >= 20) {
                    delay = 180000 // 3 минуты
                  } else {
                    delay = 120000 // 2 минуты
                  }
                } else {
                  delay = Math.min(30000 * Math.pow(2, Math.floor(consecutiveNetworkErrors / 3)), 90000)
                }
                await new Promise((resolve) => setTimeout(resolve, delay))
              }
            } else {
              // Другие ошибки - логируем, но не прерываем работу
              console.error(`❌ [Wallet ${settings.walletId || 'N/A'}] Error processing new emails:`, error.message || error)
            }
            // НЕ пробрасываем ошибку дальше - продолжаем слушать новые письма
          }
        })

        // Режим реального времени: событие 'mail' срабатывает автоматически при новых письмах
        // Библиотека imap использует IMAP IDLE если поддерживается сервером
        // Дополнительно используем быстрый polling (каждую 1 секунду) для максимальной скорости
        
        console.log('✅ Real-time mode active - listening for new emails (IDLE + 1s polling)...')
        
        // Мгновенный polling каждую 1 секунду для максимально быстрой реакции
        // Это обеспечивает почти мгновенную обработку новых писем
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
              
              // При DNS ошибках увеличиваем задержку экспоненциально
              // Это снижает нагрузку на DNS и дает время на восстановление сети
              if (error.code === 'ENOTFOUND') {
                let delay = 30000 // Начальная задержка 30 секунд
                
                // Экспоненциальная задержка: 30s, 60s, 120s, 240s, максимум 5 минут
                if (consecutiveNetworkErrors >= MAX_CONSECUTIVE_ERRORS_BEFORE_LONG_DELAY) {
                  // После 10 ошибок: 2 минуты, после 20: 3 минуты, после 30: 4 минуты, после 40+: 5 минут
                  if (consecutiveNetworkErrors >= 40) {
                    delay = 300000 // 5 минут
                  } else if (consecutiveNetworkErrors >= 30) {
                    delay = 240000 // 4 минуты
                  } else if (consecutiveNetworkErrors >= 20) {
                    delay = 180000 // 3 минуты
                  } else {
                    delay = 120000 // 2 минуты
                  }
                  
                  if (consecutiveNetworkErrors % 10 === 0) {
                    console.warn(`⚠️ [Wallet ${settings.walletId || 'N/A'}] DNS errors continue (${consecutiveNetworkErrors} consecutive). Waiting ${Math.floor(delay / 1000)}s before next attempt...`)
                  }
                } else {
                  // До 10 ошибок: экспоненциальная задержка 30s, 60s, 90s
                  delay = Math.min(30000 * Math.pow(2, Math.floor(consecutiveNetworkErrors / 3)), 90000)
                }
                
                await new Promise((resolve) => setTimeout(resolve, delay))
              } else {
                // Для других сетевых ошибок (ETIMEDOUT, ECONNREFUSED) - меньшая задержка
                await new Promise((resolve) => setTimeout(resolve, 10000)) // 10 секунд
              }
              // Продолжаем работу, попробуем снова через интервал
              return
            }
            
            // Другие ошибки - логируем, но продолжаем работу
            consecutiveNetworkErrors = 0
            console.error(`❌ [Wallet ${settings.walletId || 'N/A'}] Error in quick polling:`, error.message || error)
            // НЕ прерываем работу - продолжаем проверку
          }
        }, 1000) // Проверка каждую 1 секунду для мгновенной реакции
        
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

/**
 * Периодическая проверка pending заявок с фото чека для поиска новых платежей
 * Это обрабатывает случаи, когда платеж приходит ПОСЛЕ создания заявки
 */
async function checkPendingRequestsWithPhotos(): Promise<void> {
  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
    
    // Ищем pending заявки с фото чека, созданные за последние 10 минут
    const pendingRequests = await prisma.request.findMany({
      where: {
        requestType: 'deposit',
        status: 'pending',
        createdAt: { gte: tenMinutesAgo },
        OR: [
          { photoFileId: { not: null } },
          { photoFileUrl: { not: null } },
        ],
        incomingPayments: { none: { isProcessed: true } },
      },
      select: {
        id: true,
        amount: true,
        createdAt: true,
      },
      take: 50, // Ограничиваем количество для производительности
    })

    if (pendingRequests.length === 0) {
      return // Нет заявок для проверки
    }

    console.log(`🔍 [Periodic Check] Checking ${pendingRequests.length} pending requests with photos for new payments...`)

    let processedCount = 0
    for (const request of pendingRequests) {
      if (!request.amount) continue
      
      try {
        const { checkAndProcessExistingPayment } = await import('./auto-deposit')
        const amount = parseFloat(request.amount.toString())
        const result = await checkAndProcessExistingPayment(request.id, amount)
        
        if (result) {
          processedCount++
          console.log(`✅ [Periodic Check] Found and processed payment for request ${request.id}`)
        }
      } catch (error: any) {
        // Игнорируем ошибки для отдельных заявок, продолжаем проверку остальных
        console.warn(`⚠️ [Periodic Check] Error checking request ${request.id}:`, error.message)
      }
    }

    if (processedCount > 0) {
      console.log(`✅ [Periodic Check] Processed ${processedCount} request(s) with new payments`)
    }
  } catch (error: any) {
    // Игнорируем ошибки, чтобы не прерывать работу watcher
    console.warn('⚠️ Periodic check error:', error.message)
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

  // Запускаем периодическую проверку pending заявок с фото чека каждую секунду
  // Это обрабатывает случаи, когда платеж приходит ПОСЛЕ создания заявки
  // Проверка каждую секунду для мгновенной реакции на новые платежи
  const pendingCheckInterval = setInterval(() => {
    checkPendingRequestsWithPhotos().catch((error) => {
      console.warn('⚠️ Pending requests check failed:', error.message)
    })
  }, 1000) // Каждую секунду для мгновенной реакции

  // Проверяем pending заявки сразу при запуске
  checkPendingRequestsWithPhotos().catch((error) => {
    console.warn('⚠️ Initial pending requests check failed:', error.message)
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

