import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function updateMostbetConfig() {
  try {
    console.log('🔄 Обновление конфигурации Mostbet API...\n')

    // Новые данные для Mostbet
    // API key должен быть с префиксом api-key: (код добавит его автоматически если нет)
    const mostbetConfig = {
      api_key: '8ff736b6-43bf-4502-afdd-c222de58b03c', // Без префикса, код добавит api-key: автоматически
      secret: '5c10831e-ebab-42fd-b27e-53c2003f52be',
      cashpoint_id: 'C92905', // Важно: это строка с буквами, НЕ число!
      x_project: 'MBC',
      brand_id: 1,
    }

    const configKey = 'mostbet_api_config'
    
    // Проверяем, существует ли конфигурация
    const existing = await prisma.botConfiguration.findFirst({
      where: { key: configKey }
    })

    if (existing) {
      // Обновляем существующую конфигурацию
      await prisma.botConfiguration.update({
        where: { id: existing.id },
        data: { value: JSON.stringify(mostbetConfig) }
      })

      console.log(`✅ Mostbet: конфигурация обновлена`)
      console.log(`   - api_key: ${mostbetConfig.api_key}`)
      console.log(`   - secret: ${mostbetConfig.secret.substring(0, 10)}...`)
      console.log(`   - cashpoint_id: ${mostbetConfig.cashpoint_id}`)
      console.log(`   - x_project: ${mostbetConfig.x_project}`)
      console.log(`   - brand_id: ${mostbetConfig.brand_id}`)
    } else {
      // Создаем новую конфигурацию
      await prisma.botConfiguration.create({
        data: {
          key: configKey,
          value: JSON.stringify(mostbetConfig)
        }
      })

      console.log(`✅ Mostbet: конфигурация создана`)
      console.log(`   - api_key: ${mostbetConfig.api_key}`)
      console.log(`   - secret: ${mostbetConfig.secret.substring(0, 10)}...`)
      console.log(`   - cashpoint_id: ${mostbetConfig.cashpoint_id}`)
      console.log(`   - x_project: ${mostbetConfig.x_project}`)
      console.log(`   - brand_id: ${mostbetConfig.brand_id}`)
    }

    console.log('\n✅ Конфигурация Mostbet успешно обновлена!')
    console.log('\n⚠️  ВАЖНО: cashpoint_id содержит буквы (C92905), убедитесь что он передается как строка, а не число!')

  } catch (error) {
    console.error('❌ Ошибка при обновлении конфигурации Mostbet:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

updateMostbetConfig()

