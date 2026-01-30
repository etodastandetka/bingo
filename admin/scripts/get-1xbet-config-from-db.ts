/**
 * Скрипт для получения конфигурации 1xbet из БД (как это делает админка)
 * Запуск: npx tsx scripts/get-1xbet-config-from-db.ts
 */

import { prisma } from '../lib/prisma'

async function main() {
  console.log('🔍 Получение конфигурации 1xbet из БД...\n')

  try {
    // Получаем конфигурацию из БД (как это делает админка)
    const setting = await prisma.botConfiguration.findFirst({
      where: { key: '1xbet_api_config' }
    })

    if (setting) {
      const config = typeof setting.value === 'string' 
        ? JSON.parse(setting.value) 
        : setting.value

      console.log('✅ Конфигурация найдена в БД:')
      console.log('   Key:', setting.key)
      console.log('   Hash:', config.hash?.substring(0, 20) + '...')
      console.log('   Login:', config.login)
      console.log('   Cashdeskid:', config.cashdeskid)
      console.log('   Cashierpass:', config.cashierpass?.substring(0, 10) + '...')
      console.log('')
      console.log('📋 Полная конфигурация:')
      console.log(JSON.stringify(config, null, 2))
    } else {
      console.log('❌ Конфигурация не найдена в БД')
      console.log('   Используются дефолтные значения из .env или хардкод')
      console.log('')
      console.log('📋 Дефолтные значения:')
      console.log('   Hash:', process.env.XBET_HASH || 'f7ff9a23821a0dd19276392f80d43fd2e481986bebb7418fef11e03bba038101')
      console.log('   Login:', process.env.XBET_LOGIN || 'kurbanaevb')
      console.log('   Cashdeskid:', process.env.XBET_CASHDESKID || '1343871')
      console.log('   Cashierpass:', process.env.XBET_CASHIERPASS || 'i3EBqvV1hB')
    }
  } catch (error: any) {
    console.error('❌ Ошибка:', error.message)
    if (error.stack) {
      console.error('Stack:', error.stack)
    }
  } finally {
    await prisma.$disconnect()
  }
}

main()









