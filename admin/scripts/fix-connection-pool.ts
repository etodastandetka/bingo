#!/usr/bin/env tsx
/**
 * Скрипт для автоматического обновления настроек пула соединений в DATABASE_URL
 * Увеличивает connection_limit до 100 и pool_timeout до 60
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const envPath = path.join(__dirname, '..', '.env')

console.log('🔧 Исправление настроек пула соединений БД...\n')

// Проверяем, существует ли .env файл
if (!fs.existsSync(envPath)) {
  console.error('❌ Файл .env не найден!')
  console.error(`   Ожидаемый путь: ${envPath}`)
  process.exit(1)
}

// Читаем .env файл
let envContent = fs.readFileSync(envPath, 'utf-8')

// Ищем DATABASE_URL
const databaseUrlRegex = /^DATABASE_URL=(.+)$/m
const match = envContent.match(databaseUrlRegex)

if (!match) {
  console.error('❌ DATABASE_URL не найден в .env файле!')
  process.exit(1)
}

const currentUrl = match[1].trim().replace(/^["']|["']$/g, '') // Убираем кавычки
console.log('📋 Текущий DATABASE_URL:')
console.log(`   ${currentUrl.substring(0, 50)}...\n`)

// Парсим URL
let url: URL
try {
  url = new URL(currentUrl)
} catch (error) {
  console.error('❌ Неверный формат DATABASE_URL!')
  process.exit(1)
}

// Проверяем текущие параметры
const currentLimit = url.searchParams.get('connection_limit')
const currentTimeout = url.searchParams.get('pool_timeout')

console.log('📊 Текущие настройки:')
console.log(`   connection_limit: ${currentLimit || 'НЕ УСТАНОВЛЕН (по умолчанию: 17)'}`)
console.log(`   pool_timeout: ${currentTimeout || 'НЕ УСТАНОВЛЕН (по умолчанию: 10)'}\n`)

// Устанавливаем новые значения
const newLimit = '100'
const newTimeout = '60'

// Обновляем параметры
url.searchParams.set('connection_limit', newLimit)
url.searchParams.set('pool_timeout', newTimeout)

const newUrl = url.toString()
console.log('✅ Новые настройки:')
console.log(`   connection_limit: ${newLimit}`)
console.log(`   pool_timeout: ${newTimeout}\n`)

// Обновляем .env файл
const newDatabaseUrl = `DATABASE_URL="${newUrl}"`
envContent = envContent.replace(databaseUrlRegex, newDatabaseUrl)

// Создаем резервную копию
const backupPath = `${envPath}.backup.${Date.now()}`
fs.writeFileSync(backupPath, fs.readFileSync(envPath, 'utf-8'))
console.log(`💾 Создана резервная копия: ${path.basename(backupPath)}\n`)

// Сохраняем обновленный файл
fs.writeFileSync(envPath, envContent)

console.log('✅ .env файл обновлен!')
console.log('\n📝 Следующие шаги:')
console.log('   1. Перезапустите все сервисы: pm2 restart all')
console.log('   2. Проверьте логи: pm2 logs bingo-email-watcher --lines 50')
console.log('   3. Ошибки P2024 должны исчезнуть\n')

console.log('📋 Новый DATABASE_URL:')
console.log(`   ${newUrl.substring(0, 80)}...`)

