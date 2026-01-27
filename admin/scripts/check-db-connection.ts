/**
 * Скрипт для проверки подключения к базе данных
 * Запуск: npx tsx scripts/check-db-connection.ts
 */

import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('❌ DATABASE_URL не установлен')
  process.exit(1)
}

// Парсим DATABASE_URL для вывода (без пароля)
const url = new URL(databaseUrl.replace(/^postgresql:\/\//, 'http://'))
const host = url.hostname
const port = url.port || '5432'
const database = url.pathname.replace('/', '')

console.log('🔍 Проверка подключения к базе данных...\n')
console.log(`📋 Параметры подключения:`)
console.log(`   Host: ${host}`)
console.log(`   Port: ${port}`)
console.log(`   Database: ${database}`)
console.log('')

const prisma = new PrismaClient({
  log: ['error', 'warn'],
})

async function checkConnection() {
  try {
    console.log('⏳ Пытаюсь подключиться к БД...')
    
    // Простой запрос для проверки подключения
    const result = await prisma.$queryRaw`SELECT 1 as test`
    console.log('✅ Подключение успешно!')
    console.log(`   Результат теста: ${JSON.stringify(result)}`)
    
    // Проверяем версию PostgreSQL
    const version = await prisma.$queryRaw<Array<{ version: string }>>`SELECT version() as version`
    if (version && version.length > 0) {
      console.log(`   PostgreSQL версия: ${version[0].version.split(' ')[0]} ${version[0].version.split(' ')[1]}`)
    }
    
    // Проверяем активные соединения
    const connections = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) as count 
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `
    if (connections && connections.length > 0) {
      console.log(`   Активных соединений: ${connections[0].count}`)
    }
    
    // Проверяем max_connections
    const maxConn = await prisma.$queryRaw<Array<{ setting: string }>>`
      SHOW max_connections
    `
    if (maxConn && maxConn.length > 0) {
      console.log(`   Максимум соединений: ${maxConn[0].setting}`)
    }
    
    console.log('\n✅ Все проверки пройдены успешно!')
    
  } catch (error: any) {
    console.error('\n❌ Ошибка подключения к БД:')
    console.error(`   ${error.message}`)
    
    if (error.code) {
      console.error(`   Код ошибки: ${error.code}`)
    }
    
    // Детальная диагностика
    console.log('\n🔍 Диагностика:')
    
    if (error.message.includes("Can't reach database server")) {
      console.log('   ⚠️  БД недоступна по сети')
      console.log('   💡 Проверьте:')
      console.log('      1. Запущен ли PostgreSQL на сервере?')
      console.log('      2. Открыт ли порт 5432 в firewall?')
      console.log('      3. Правильный ли IP адрес?')
      console.log('      4. Есть ли проблемы с сетью?')
    } else if (error.message.includes("authentication failed")) {
      console.log('   ⚠️  Ошибка аутентификации')
      console.log('   💡 Проверьте логин и пароль в DATABASE_URL')
    } else if (error.message.includes("does not exist")) {
      console.log('   ⚠️  База данных не существует')
      console.log('   💡 Проверьте имя базы данных в DATABASE_URL')
    } else if (error.message.includes("connection pool")) {
      console.log('   ⚠️  Проблема с пулом соединений')
      console.log('   💡 Добавьте параметры в DATABASE_URL:')
      console.log('      ?connection_limit=50&pool_timeout=30')
    } else {
      console.log('   ⚠️  Неизвестная ошибка')
      console.log('   💡 Проверьте логи PostgreSQL на сервере')
    }
    
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

checkConnection()




