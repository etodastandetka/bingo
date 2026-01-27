/**
 * Скрипт для получения API ключа 1win из базы данных
 * Запуск: npx tsx scripts/get-1win-api-key.ts
 */

import { PrismaClient } from '@prisma/client'

// Используем DATABASE_URL из аргументов или переменной окружения
const databaseUrl = process.argv[2] || process.env.DATABASE_URL || 'postgresql://gen_user:dastan10dz@92.51.38.85:5432/default_db'

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
})

async function get1winApiKey() {
  try {
    console.log('🔍 Ищу конфигурацию 1win в базе данных...\n')
    
    // Сначала проверим все ключи, связанные с 1win
    const all1winSettings = await prisma.botConfiguration.findMany({
      where: {
        key: {
          contains: '1win',
        },
      },
    })

    if (all1winSettings.length > 0) {
      console.log(`✅ Найдено ${all1winSettings.length} записей, связанных с 1win:\n`)
      all1winSettings.forEach((s) => {
        console.log(`   - ${s.key} (ID: ${s.id})`)
      })
      console.log('')
    }

    const setting = await prisma.botConfiguration.findFirst({
      where: { key: '1win_api_config' },
    })

    if (!setting) {
      console.log('❌ Конфигурация 1win_api_config не найдена в базе данных')
      
      // Проверим все ключи в таблице
      const allKeys = await prisma.botConfiguration.findMany({
        select: { key: true },
        take: 50,
      })
      
      if (allKeys.length > 0) {
        console.log('\n📋 Все доступные ключи в bot_configuration:')
        allKeys.forEach((k) => {
          console.log(`   - ${k.key}`)
        })
      }
      
      // Если не нашли в БД, проверяем переменные окружения
      const envKey = process.env.ONEWIN_API_KEY || process.env.ONE_WIN_API_KEY
      if (envKey) {
        console.log(`\n✅ API Key найден в переменных окружения: ${envKey}`)
      } else {
        // Используется дефолтный ключ
        const defaultKey = '0ad11eda9f40c2e05c34dc81c24ebe7f53eabe606c6cc5e553cfe66cd7fa9c8e'
        console.log(`\n⚠️ API Key не найден в БД и переменных окружения`)
        console.log(`\n📌 Текущий используемый ключ (дефолтный из кода):`)
        console.log(`   ${defaultKey}`)
        console.log(`\n💡 Для изменения ключа:`)
        console.log(`   1. Добавьте в admin/.env: ONEWIN_API_KEY=ваш_ключ`)
        console.log(`   2. Или создайте запись в БД: INSERT INTO bot_configuration (key, value) VALUES ('1win_api_config', '{"api_key": "ваш_ключ"}');`)
      }
      return
    }

    console.log('✅ Конфигурация найдена!\n')
    console.log('📋 Данные:')
    console.log(`   Key: ${setting.key}`)
    console.log(`   ID: ${setting.id}`)
    console.log(`   Created: ${setting.createdAt}`)
    console.log(`   Updated: ${setting.updatedAt}`)
    
    // Парсим значение
    let config: any
    if (typeof setting.value === 'string') {
      try {
        config = JSON.parse(setting.value)
      } catch (e) {
        console.log(`\n⚠️ Не удалось распарсить JSON. Сырое значение:`)
        console.log(`   ${setting.value}`)
        return
      }
    } else {
      config = setting.value
    }

    console.log('\n🔑 API Конфигурация 1win:')
    console.log(JSON.stringify(config, null, 2))
    
    if (config.api_key) {
      console.log(`\n✅ API Key найден в БД: ${config.api_key}`)
    } else {
      console.log('\n⚠️ API Key не найден в конфигурации')
    }

  } catch (error: any) {
    console.error('❌ Ошибка при получении конфигурации:', error.message)
    if (error.code) {
      console.error(`   Код ошибки: ${error.code}`)
    }
  } finally {
    await prisma.$disconnect()
  }
}

get1winApiKey()

