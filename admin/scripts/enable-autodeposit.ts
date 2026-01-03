/**
 * Скрипт для включения автопополнения
 */
import { prisma } from '../lib/prisma'

async function enableAutodeposit() {
  try {
    // Создаем или обновляем настройку автопополнения
    const setting = await prisma.botSetting.upsert({
      where: { key: 'autodeposit_enabled' },
      update: { value: '1' },
      create: {
        key: 'autodeposit_enabled',
        value: '1',
      },
    })

    console.log('✅ Autodeposit enabled!')
    console.log(`   Setting: ${setting.key} = ${setting.value}`)
  } catch (error: any) {
    console.error('❌ Error enabling autodeposit:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

enableAutodeposit()

