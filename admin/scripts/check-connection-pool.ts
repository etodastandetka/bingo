/**
 * Скрипт для проверки конфигурации connection pool Prisma
 * Запуск: npx tsx scripts/check-connection-pool.ts
 */

const databaseUrl = process.env.DATABASE_URL || ''

if (!databaseUrl) {
  console.error('❌ DATABASE_URL не установлен')
  process.exit(1)
}

console.log('🔍 Проверка конфигурации Connection Pool...\n')

// Парсим DATABASE_URL
const url = new URL(databaseUrl.replace(/^postgresql:\/\//, 'http://'))

const connectionLimit = url.searchParams.get('connection_limit')
const poolTimeout = url.searchParams.get('pool_timeout')

console.log('📋 Текущая конфигурация:')
console.log(`   connection_limit: ${connectionLimit || 'НЕ УСТАНОВЛЕН (по умолчанию: 17)'}`)
console.log(`   pool_timeout: ${poolTimeout || 'НЕ УСТАНОВЛЕН (по умолчанию: 10)'}`)
console.log('')

// Проверяем рекомендации
const recommendedLimit = 50
const recommendedTimeout = 30

let hasIssues = false

if (!connectionLimit || parseInt(connectionLimit) < recommendedLimit) {
  console.log('⚠️  ПРОБЛЕМА: connection_limit слишком мал!')
  console.log(`   Рекомендуется: ${recommendedLimit} или больше`)
  hasIssues = true
}

if (!poolTimeout || parseInt(poolTimeout) < recommendedTimeout) {
  console.log('⚠️  ПРОБЛЕМА: pool_timeout слишком мал!')
  console.log(`   Рекомендуется: ${recommendedTimeout} или больше`)
  hasIssues = true
}

if (!hasIssues) {
  console.log('✅ Конфигурация пула соединений корректна!')
} else {
  console.log('\n💡 Решение:')
  console.log('Обновите DATABASE_URL в .env файле:')
  console.log('')
  console.log('Было:')
  console.log(`DATABASE_URL="${databaseUrl.split('?')[0]}"`)
  console.log('')
  console.log('Должно быть:')
  const baseUrl = databaseUrl.split('?')[0]
  const separator = baseUrl.includes('?') ? '&' : '?'
  console.log(`DATABASE_URL="${baseUrl}${separator}connection_limit=${recommendedLimit}&pool_timeout=${recommendedTimeout}"`)
  console.log('')
  console.log('После изменения перезапустите сервисы:')
  console.log('  pm2 restart all')
}




