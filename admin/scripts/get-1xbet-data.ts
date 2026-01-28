/**
 * Скрипт для получения данных с 1xbet API
 * Запуск: npx tsx scripts/get-1xbet-data.ts
 */

import * as crypto from 'crypto'
import { getCasinoConfig } from '../lib/casino-config'

interface CashdeskConfig {
  hash: string
  cashierpass: string
  login: string
  cashdeskid: number
}

interface BalanceResult {
  balance: number
  limit: number
}

// Конфигурация 1xbet (использует ту же логику, что и админка)
const get1xbetConfig = async (): Promise<CashdeskConfig> => {
  // Используем ту же функцию, что и админка - сначала БД, потом env, потом дефолты
  const config = await getCasinoConfig('1xbet')
  
  if (config && 'cashdeskid' in config) {
    return {
      hash: config.hash,
      cashierpass: config.cashierpass,
      login: config.login,
      cashdeskid: parseInt(config.cashdeskid || '0'),
    }
  }
  
  // Fallback (не должно произойти, но на всякий случай)
  return {
    hash: process.env.XBET_HASH || 'f7ff9a23821a0dd19276392f80d43fd2e481986bebb7418fef11e03bba038101',
    cashierpass: process.env.XBET_CASHIERPASS || 'i3EBqvV1hB',
    login: process.env.XBET_LOGIN || 'kurbanaevb',
    cashdeskid: parseInt(process.env.XBET_CASHDESKID || '1343871'),
  }
}

/**
 * Получение баланса и лимита через Cashdesk API (1xbet)
 */
async function get1xbetBalance(cfg: CashdeskConfig): Promise<BalanceResult> {
  try {
    // Формируем дату в UTC в формате 'YYYY.MM.DD HH:MM:SS'
    const now = new Date()
    const year = now.getUTCFullYear()
    const month = String(now.getUTCMonth() + 1).padStart(2, '0')
    const day = String(now.getUTCDate()).padStart(2, '0')
    const hours = String(now.getUTCHours()).padStart(2, '0')
    const minutes = String(now.getUTCMinutes()).padStart(2, '0')
    const seconds = String(now.getUTCSeconds()).padStart(2, '0')
    const formattedDt = `${year}.${month}.${day} ${hours}:${minutes}:${seconds}`

    console.log('📅 Дата/время (UTC):', formattedDt)
    console.log('🔑 Параметры:')
    console.log('   Cashdesk ID:', cfg.cashdeskid)
    console.log('   Login:', cfg.login)
    console.log('   Hash:', cfg.hash.substring(0, 20) + '...')
    console.log('   Cashierpass:', cfg.cashierpass)
    console.log('')

    // confirm = MD5(cashdeskid:hash)
    const confirmStr = `${cfg.cashdeskid}:${cfg.hash}`
    const confirm = crypto.createHash('md5').update(confirmStr).digest('hex')
    console.log('🔐 Confirm (MD5):', confirm)

    // Подпись для баланса:
    // a. SHA256(hash={hash}&cashierpass={cashierpass}&dt={dt})
    const step1 = `hash=${cfg.hash}&cashierpass=${cfg.cashierpass}&dt=${formattedDt}`
    const sha1 = crypto.createHash('sha256').update(step1).digest('hex')
    console.log('📝 Step 1 (SHA256):', sha1.substring(0, 32) + '...')

    // b. MD5(dt={dt}&cashierpass={cashierpass}&cashdeskid={cashdeskid})
    const step2 = `dt=${formattedDt}&cashierpass=${cfg.cashierpass}&cashdeskid=${cfg.cashdeskid}`
    const md5Hash = crypto.createHash('md5').update(step2).digest('hex')
    console.log('📝 Step 2 (MD5):', md5Hash)

    // c. SHA256(результаты a и b объединены)
    const combined = sha1 + md5Hash
    const sign = crypto.createHash('sha256').update(combined).digest('hex')
    console.log('✍️  Sign (SHA256):', sign.substring(0, 32) + '...')
    console.log('')

    const url = `https://partners.servcul.com/CashdeskBotAPI/Cashdesk/${cfg.cashdeskid}/Balance?confirm=${confirm}&dt=${formattedDt}`
    console.log('🌐 URL:', url)
    console.log('📤 Headers:', { sign })
    console.log('')

    const response = await fetch(url, { 
      headers: { sign }, 
      method: 'GET' 
    })

    console.log('📥 Статус ответа:', response.status, response.statusText)

    if (response.ok) {
      const data = await response.json()
      console.log('✅ Данные получены:')
      console.log(JSON.stringify(data, null, 2))
      
      if (data && typeof data.Balance !== 'undefined') {
        const result = {
          balance: parseFloat(data.Balance) || 0,
          limit: parseFloat(data.Limit) || 0,
        }
        
        console.log('')
        console.log('💰 Результат:')
        console.log('   Баланс:', result.balance.toLocaleString('ru-RU', { 
          minimumFractionDigits: 2, 
          maximumFractionDigits: 2 
        }), 'сом')
        console.log('   Лимит:', result.limit.toLocaleString('ru-RU', { 
          minimumFractionDigits: 2, 
          maximumFractionDigits: 2 
        }), 'сом')
        
        return result
      }
    } else {
      const text = await response.text()
      console.error('❌ Ошибка ответа:')
      console.error(text)
    }
  } catch (error: any) {
    console.error('❌ Ошибка получения данных:', error.message)
    if (error.stack) {
      console.error('Stack:', error.stack)
    }
  }

  return { balance: 0, limit: 0 }
}

async function main() {
  // Устанавливаем DATABASE_URL из аргументов командной строки, если передан
  if (process.argv[2]) {
    process.env.DATABASE_URL = process.argv[2]
  }

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL не установлен')
    console.log('')
    console.log('Использование:')
    console.log('  npx tsx scripts/get-1xbet-data.ts')
    console.log('  или')
    console.log('  npx tsx scripts/get-1xbet-data.ts "postgresql://user:pass@host:port/db"')
    process.exit(1)
  }

  console.log('🎰 Получение данных с 1xbet API (используя ту же конфигурацию, что и админка)\n')
  console.log('=' .repeat(50))
  console.log('')

  const config = await get1xbetConfig()
  console.log('📋 Источник конфигурации: БД → .env → дефолты (как в админке)')
  console.log('')
  
  const result = await get1xbetBalance(config)

  console.log('')
  console.log('=' .repeat(50))
  console.log('✅ Завершено')
  
  // Закрываем Prisma соединение
  const { prisma } = await import('../lib/prisma')
  await prisma.$disconnect()
}

main().catch(console.error)

