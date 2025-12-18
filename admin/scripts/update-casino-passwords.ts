import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function updateCasinoPasswords() {
  try {
    console.log('🔄 Обновление паролей API казино...\n')

    // Новые пароли
    const passwords = {
      '1xbet': 'u2Z6WRZkNB',
      'melbet': 'pUdKHv4SoV',
      'wowbet': 'VBjDv9GKGR',
      'winwin': 'sobaTuO8cc',
      '1xcasino': 'uuA6AHBOhp',
    }

    // Обновляем каждый казино
    for (const [casino, password] of Object.entries(passwords)) {
      const configKey = `${casino}_api_config`
      
      // Получаем текущую конфигурацию
      const existing = await prisma.botConfiguration.findFirst({
        where: { key: configKey }
      })

      if (existing) {
        // Обновляем существующую конфигурацию
        const config = typeof existing.value === 'string' 
          ? JSON.parse(existing.value) 
          : existing.value

        config.cashierpass = password

        await prisma.botConfiguration.update({
          where: { id: existing.id },
          data: { value: JSON.stringify(config) }
        })

        console.log(`✅ ${casino}: пароль обновлен`)
      } else {
        // Создаем новую конфигурацию с дефолтными значениями и новым паролем
        const defaultConfigs: Record<string, any> = {
          '1xbet': {
            hash: 'f7ff9a23821a0dd19276392f80d43fd2e481986bebb7418fef11e03bba038101',
            cashierpass: password,
            login: 'kurbanaevb',
            cashdeskid: '1343871',
          },
          'melbet': {
            hash: '5c6459e67bde6c8ace972e2a4d7e1f83d05e2b68c0741474b0fa57e46a19bda1',
            cashierpass: password,
            login: 'bakhtark',
            cashdeskid: '1350588',
          },
          'wowbet': {
            hash: '62a28327ed306a7a5b12c92f22c5ed10b88ff6ef94787b3890e2b4c77ac16b74',
            cashierpass: password,
            login: 'bakhtarku',
            cashdeskid: '1425058',
          },
          'winwin': {
            hash: '4e3ab6e0b47e063017f7e41e3ee5090df5c717c1e908301539cc75199baf7a71',
            cashierpass: password,
            login: 'kurbanaevbakh',
            cashdeskid: '1392184',
          },
          '1xcasino': {
            hash: 'ea6a5d009551cbadaf583b4b158341df4a770c4f2fbc8a1eceb0817ca814a588',
            cashierpass: password,
            login: 'kurbanaevbak',
            cashdeskid: '1383980',
          },
        }

        await prisma.botConfiguration.create({
          data: {
            key: configKey,
            value: JSON.stringify(defaultConfigs[casino])
          }
        })

        console.log(`✅ ${casino}: конфигурация создана с новым паролем`)
      }
    }

    console.log('\n✅ Все пароли успешно обновлены!')

    // Добавляем конфигурации для казино, которых нет в БД (betwinner, 888starz)
    console.log('\n🔄 Проверка недостающих конфигураций...\n')
    
    const additionalCasinos: Record<string, any> = {
      'betwinner': {
        hash: 'b2b5dcc4fd7c2dd559bd3c465ee9202f157e0697ed016dbd7db0121ebfec7ff2',
        cashierpass: '2768772981',
        login: 'kurbanaevba1',
        cashdeskid: '1392478',
      },
      '888starz': {
        hash: '6bb5fbcbc5784359ccbf490167d9b3a82ea6dc3eac22e0d7cc083c2e71b10da0',
        cashierpass: '8688726678',
        login: 'kurbanaevba',
        cashdeskid: '1376440',
      },
    }

    for (const [casino, defaultConfig] of Object.entries(additionalCasinos)) {
      const configKey = `${casino}_api_config`
      
      const existing = await prisma.botConfiguration.findFirst({
        where: { key: configKey }
      })

      if (!existing) {
        await prisma.botConfiguration.create({
          data: {
            key: configKey,
            value: JSON.stringify(defaultConfig)
          }
        })

        console.log(`✅ ${casino}: конфигурация добавлена в БД`)
      } else {
        console.log(`ℹ️  ${casino}: конфигурация уже существует в БД`)
      }
    }

    console.log('\n✅ Все конфигурации проверены и обновлены!')
  } catch (error) {
    console.error('❌ Ошибка при обновлении паролей:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

updateCasinoPasswords()

