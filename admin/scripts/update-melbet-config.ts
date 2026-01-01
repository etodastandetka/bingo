import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function updateMelbetConfig() {
  try {
    console.log('🔄 Обновление конфигурации Melbet для кассы 1350588...\n')

    const melbetConfig = {
      hash: 'e926a363ccb63af5348d5e8154fdaf07795224ea551eeaeab5e5ebe0511ffefa',
      cashierpass: 'pUdKHv4SoV',
      login: 'bakhtark',
      cashdeskid: '1350588',
    }

    const existing = await prisma.botConfiguration.findFirst({
      where: { key: 'melbet_api_config' }
    })

    if (existing) {
      // Обновляем существующую конфигурацию
      await prisma.botConfiguration.update({
        where: { id: existing.id },
        data: { value: JSON.stringify(melbetConfig) }
      })

      console.log('✅ Melbet: конфигурация обновлена')
      console.log(`   - Hash: ${melbetConfig.hash}`)
      console.log(`   - Cashierpass: ${melbetConfig.cashierpass}`)
      console.log(`   - Login: ${melbetConfig.login}`)
      console.log(`   - Cashdeskid: ${melbetConfig.cashdeskid}`)
    } else {
      // Создаем новую конфигурацию
      await prisma.botConfiguration.create({
        data: {
          key: 'melbet_api_config',
          value: JSON.stringify(melbetConfig)
        }
      })

      console.log('✅ Melbet: конфигурация создана')
      console.log(`   - Hash: ${melbetConfig.hash}`)
      console.log(`   - Cashierpass: ${melbetConfig.cashierpass}`)
      console.log(`   - Login: ${melbetConfig.login}`)
      console.log(`   - Cashdeskid: ${melbetConfig.cashdeskid}`)
    }

    console.log('\n✅ Конфигурация Melbet успешно обновлена!')
  } catch (error) {
    console.error('❌ Ошибка при обновлении конфигурации Melbet:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

updateMelbetConfig()

