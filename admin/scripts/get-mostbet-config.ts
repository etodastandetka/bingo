import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function getMostbetConfig() {
  try {
    console.log('🔍 Получение конфигурации Mostbet API...\n')

    const configKey = 'mostbet_api_config'
    
    // Получаем конфигурацию из БД
    const setting = await prisma.botConfiguration.findFirst({
      where: { key: configKey }
    })

    if (setting) {
      const config = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value
      console.log('✅ Конфигурация найдена в базе данных:\n')
      console.log('📋 Данные API Mostbet:')
      console.log('─'.repeat(50))
      console.log(`API Key:        ${config.api_key || 'не указан'}`)
      console.log(`Secret:         ${config.secret || 'не указан'}`)
      console.log(`Cashpoint ID:   ${config.cashpoint_id || 'не указан'}`)
      console.log(`X-Project:      ${config.x_project || 'MBC (по умолчанию)'}`)
      console.log(`Brand ID:       ${config.brand_id || '1 (по умолчанию)'}`)
      console.log('─'.repeat(50))
      
      // Выводим в формате JSON для удобства копирования
      console.log('\n📄 JSON формат:')
      console.log(JSON.stringify(config, null, 2))
    } else {
      console.log('⚠️  Конфигурация не найдена в базе данных')
      console.log('📋 Используются дефолтные значения из кода:\n')
      
      const defaultConfig = {
        api_key: process.env.MOSTBET_API_KEY || 'api-key:3d83ac24-7fd2-498d-84b4-f2a7e80401fb',
        secret: process.env.MOSTBET_SECRET || 'baa104d1-73a6-4914-866a-ddbbe0aae11a',
        cashpoint_id: process.env.MOSTBET_CASHPOINT_ID || '48436',
        x_project: process.env.MOSTBET_X_PROJECT || 'MBC',
        brand_id: parseInt(process.env.MOSTBET_BRAND_ID || '1'),
      }
      
      console.log('─'.repeat(50))
      console.log(`API Key:        ${defaultConfig.api_key}`)
      console.log(`Secret:         ${defaultConfig.secret}`)
      console.log(`Cashpoint ID:   ${defaultConfig.cashpoint_id}`)
      console.log(`X-Project:      ${defaultConfig.x_project}`)
      console.log(`Brand ID:       ${defaultConfig.brand_id}`)
      console.log('─'.repeat(50))
      
      console.log('\n📄 JSON формат:')
      console.log(JSON.stringify(defaultConfig, null, 2))
      
      console.log('\n💡 Для обновления конфигурации используйте: npm run update-mostbet-config')
    }

    // Также проверяем переменные окружения
    console.log('\n🔧 Переменные окружения:')
    console.log('─'.repeat(50))
    console.log(`MOSTBET_API_KEY:      ${process.env.MOSTBET_API_KEY || 'не установлена'}`)
    console.log(`MOSTBET_SECRET:       ${process.env.MOSTBET_SECRET || 'не установлена'}`)
    console.log(`MOSTBET_CASHPOINT_ID: ${process.env.MOSTBET_CASHPOINT_ID || 'не установлена'}`)
    console.log(`MOSTBET_X_PROJECT:    ${process.env.MOSTBET_X_PROJECT || 'не установлена'}`)
    console.log(`MOSTBET_BRAND_ID:     ${process.env.MOSTBET_BRAND_ID || 'не установлена'}`)
    console.log('─'.repeat(50))

  } catch (error) {
    console.error('❌ Ошибка при получении конфигурации Mostbet:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

getMostbetConfig()


