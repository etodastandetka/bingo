/**
 * Скрипт для проверки конфигурации 1xbet в БД
 * Запуск: npx tsx scripts/check-1xbet-db-config.ts
 * 
 * Требуется DATABASE_URL в .env или переменных окружения
 */

async function main() {
  // Устанавливаем DATABASE_URL из аргументов командной строки или используем переменную окружения
  if (process.argv[2]) {
    process.env.DATABASE_URL = process.argv[2]
  }

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL не установлен')
    console.log('')
    console.log('Использование:')
    console.log('  npx tsx scripts/check-1xbet-db-config.ts')
    console.log('  или')
    console.log('  npx tsx scripts/check-1xbet-db-config.ts "postgresql://user:pass@host:port/db"')
    process.exit(1)
  }

  console.log('🔍 Подключение к БД...')
  console.log('   DATABASE_URL:', process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@')) // Скрываем пароль
  console.log('')

  try {
    const { prisma } = await import('../lib/prisma')

    // Получаем конфигурацию из БД
    const setting = await prisma.botConfiguration.findFirst({
      where: { key: '1xbet_api_config' }
    })

    if (setting) {
      const config = typeof setting.value === 'string' 
        ? JSON.parse(setting.value) 
        : setting.value

      console.log('✅ Конфигурация найдена в БД:')
      console.log('')
      console.log('📋 Параметры:')
      console.log('   Key:', setting.key)
      console.log('   Cashdesk ID:', config.cashdeskid)
      console.log('   Login:', config.login)
      console.log('   Hash:', config.hash?.substring(0, 30) + '...')
      console.log('   Cashierpass:', config.cashierpass?.substring(0, 10) + '...')
      console.log('')
      console.log('📄 Полная конфигурация:')
      console.log(JSON.stringify(config, null, 2))
    } else {
      console.log('❌ Конфигурация не найдена в БД')
      console.log('   Используются дефолтные значения из .env или кода')
    }
  } catch (error: any) {
    console.error('❌ Ошибка:', error.message)
    if (error.code === 'P1001') {
      console.error('   Не удалось подключиться к БД. Проверьте DATABASE_URL.')
    }
  } finally {
    const { prisma } = await import('../lib/prisma')
    await prisma.$disconnect()
  }
}

main()









