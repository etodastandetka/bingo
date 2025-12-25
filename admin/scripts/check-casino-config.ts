import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkCasinoConfig() {
  try {
    console.log('📋 Проверка конфигурации API казино...\n')

    const casinos = ['1xbet', 'melbet', 'wowbet', 'winwin', '1xcasino', 'betwinner', '888starz']
    
    for (const casino of casinos) {
      const configKey = `${casino}_api_config`
      const setting = await prisma.botConfiguration.findFirst({
        where: { key: configKey }
      })

      if (setting) {
        const config = typeof setting.value === 'string' 
          ? JSON.parse(setting.value) 
          : setting.value

        console.log(`\n✅ ${casino.toUpperCase()}:`)
        console.log(`   Hash: ${config.hash ? config.hash.substring(0, 20) + '...' : 'НЕТ'}`)
        console.log(`   Cashierpass: ${config.cashierpass || 'НЕТ'}`)
        console.log(`   Login: ${config.login || 'НЕТ'}`)
        console.log(`   Cashdeskid: ${config.cashdeskid || 'НЕТ'}`)
        if (config.api_key) {
          console.log(`   API Key: ${config.api_key.substring(0, 20) + '...' || 'НЕТ'}`)
        }
        if (config.secret) {
          console.log(`   Secret: ${config.secret.substring(0, 20) + '...' || 'НЕТ'}`)
        }
        if (config.cashpoint_id) {
          console.log(`   Cashpoint ID: ${config.cashpoint_id || 'НЕТ'}`)
        }
      } else {
        console.log(`\n❌ ${casino.toUpperCase()}: конфигурация не найдена в БД (используются значения по умолчанию из кода)`)
      }
    }

    console.log('\n✅ Проверка завершена!')
  } catch (error) {
    console.error('❌ Ошибка при проверке конфигурации:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

checkCasinoConfig()










