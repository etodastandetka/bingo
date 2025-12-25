import { PrismaClient } from '@prisma/client'
import { getCasinoConfig } from '../lib/casino-config'

const prisma = new PrismaClient()

async function checkPlatformLimits() {
  try {
    console.log('🔍 Проверка конфигурации платформ и лимитов...\n')

    const platforms = [
      '1xbet',
      'melbet',
      '1win',
      'mostbet',
      'winwin',
      '888starz',
      '1xcasino',
      'betwinner',
      'wowbet',
    ]

    for (const platform of platforms) {
      console.log(`\n📋 ${platform.toUpperCase()}:`)
      
      // Проверяем конфигурацию в БД
      const configKey = `${platform}_api_config`
      const dbConfig = await prisma.botConfiguration.findFirst({
        where: { key: configKey }
      })

      if (dbConfig) {
        const config = typeof dbConfig.value === 'string' 
          ? JSON.parse(dbConfig.value) 
          : dbConfig.value
        
        console.log(`  ✅ Конфигурация найдена в БД`)
        
        if (platform === 'mostbet') {
          console.log(`  - api_key: ${config.api_key ? '✅' : '❌'}`)
          console.log(`  - secret: ${config.secret ? '✅' : '❌'}`)
          console.log(`  - cashpoint_id: ${config.cashpoint_id || '❌'}`)
        } else if (platform === '1win') {
          console.log(`  - api_key: ${config.api_key ? '✅' : '❌'}`)
        } else {
          console.log(`  - hash: ${config.hash ? '✅' : '❌'}`)
          console.log(`  - cashierpass: ${config.cashierpass ? '✅ (скрыт)' : '❌'}`)
          console.log(`  - login: ${config.login || '❌'}`)
          console.log(`  - cashdeskid: ${config.cashdeskid || '❌'}`)
        }
      } else {
        console.log(`  ⚠️  Конфигурация НЕ найдена в БД (будет использован fallback)`)
      }

      // Проверяем через getCasinoConfig
      try {
        const config = await getCasinoConfig(platform)
        if (config) {
          console.log(`  ✅ getCasinoConfig вернул конфигурацию`)
          if (platform === 'mostbet' || platform === '1win') {
            console.log(`  - Тип: ${platform === 'mostbet' ? 'Mostbet API' : '1win API'}`)
          } else {
            console.log(`  - Тип: Cashdesk API`)
            console.log(`  - cashdeskid: ${'cashdeskid' in config ? config.cashdeskid : 'N/A'}`)
          }
        } else {
          console.log(`  ❌ getCasinoConfig вернул null`)
        }
      } catch (error: any) {
        console.log(`  ❌ Ошибка при получении конфигурации: ${error.message}`)
      }
    }

    console.log('\n\n💡 Рекомендации:')
    console.log('1. Если конфигурация не найдена в БД, запустите: npx tsx scripts/update-casino-passwords.ts')
    console.log('2. Если лимиты показывают 0.00, проверьте логи на ошибки 401/403')
    console.log('3. Для Melbet ошибка 403 может означать неверный пароль или блокировку API')
    console.log('4. Для Mostbet убедитесь, что конфигурация mostbet_api_config существует в БД')

  } catch (error) {
    console.error('❌ Ошибка при проверке:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

checkPlatformLimits()

