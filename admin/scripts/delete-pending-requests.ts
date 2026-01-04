/**
 * Скрипт для удаления всех заявок со статусом "ожидающий" (pending)
 * 
 * Использование:
 *   npm run delete-pending-requests
 *   или
 *   npx tsx scripts/delete-pending-requests.ts
 */

import { prisma } from '../lib/prisma'

async function deletePendingRequests() {
  try {
    console.log('🔍 Поиск заявок со статусом "pending"...')
    
    // Сначала подсчитываем количество заявок
    const count = await prisma.request.count({
      where: {
        status: 'pending'
      }
    })
    
    console.log(`📊 Найдено заявок со статусом "pending": ${count}`)
    
    if (count === 0) {
      console.log('✅ Нет заявок для удаления')
      return
    }
    
    // Удаляем все заявки со статусом pending
    const result = await prisma.request.deleteMany({
      where: {
        status: 'pending'
      }
    })
    
    console.log(`✅ Успешно удалено заявок: ${result.count}`)
    console.log(`📊 Всего было найдено: ${count}, удалено: ${result.count}`)
    
  } catch (error: any) {
    console.error('❌ Ошибка при удалении заявок:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Запускаем скрипт
deletePendingRequests()
  .then(() => {
    console.log('✅ Скрипт завершен успешно')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Скрипт завершен с ошибкой:', error)
    process.exit(1)
  })

