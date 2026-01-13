// Загружаем переменные окружения вручную
import * as fs from 'fs'
import * as path from 'path'

// Пытаемся загрузить .env файл
const envPath = path.resolve(process.cwd(), '.env')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...values] = trimmed.split('=')
      if (key && values.length > 0) {
        process.env[key.trim()] = values.join('=').trim()
      }
    }
  })
}

import { prisma } from '../lib/prisma'

async function getRequestStatistics() {
  try {
    // Проверяем наличие DATABASE_URL
    if (!process.env.DATABASE_URL) {
      console.error('❌ Ошибка: переменная окружения DATABASE_URL не установлена')
      console.error('💡 Убедитесь, что файл .env существует и содержит DATABASE_URL')
      console.error('💡 Или установите переменную окружения: export DATABASE_URL="..."')
      process.exit(1)
    }

    console.log('📊 Анализ статистики обработки заявок...\n')

    // Получаем все заявки на пополнение
    const allRequests = await prisma.request.findMany({
      where: {
        requestType: 'deposit',
      },
      select: {
        id: true,
        status: true,
        processedBy: true,
        processedByUsername: true,
        createdAt: true,
      },
    })

    const total = allRequests.length
    console.log(`📋 Всего заявок на пополнение: ${total}\n`)

    if (total === 0) {
      console.log('⚠️  Заявок не найдено')
      return
    }

    // Подсчитываем статистику
    let autodepositCount = 0
    let profile1Count = 0
    let otherCount = 0
    let pendingCount = 0
    let otherProcessors: Record<string, number> = {}

    for (const request of allRequests) {
      if (request.status === 'pending') {
        pendingCount++
        continue
      }

      if (request.processedBy === 'автопополнение') {
        autodepositCount++
      } else if (request.processedByUsername === 'profile-1') {
        profile1Count++
      } else if (request.processedBy || request.processedByUsername) {
        const processor = request.processedBy || request.processedByUsername || 'неизвестно'
        otherProcessors[processor] = (otherProcessors[processor] || 0) + 1
        otherCount++
      } else {
        otherCount++
      }
    }

    const processedCount = total - pendingCount

    // Вычисляем проценты
    const autodepositPercent = total > 0 ? ((autodepositCount / total) * 100).toFixed(2) : '0.00'
    const profile1Percent = total > 0 ? ((profile1Count / total) * 100).toFixed(2) : '0.00'
    const otherPercent = total > 0 ? ((otherCount / total) * 100).toFixed(2) : '0.00'
    const pendingPercent = total > 0 ? ((pendingCount / total) * 100).toFixed(2) : '0.00'

    // Выводим статистику
    console.log('═'.repeat(60))
    console.log('📈 СТАТИСТИКА ОБРАБОТКИ ЗАЯВОК')
    console.log('═'.repeat(60))
    console.log(`\n📊 Общая статистика:`)
    console.log(`   Всего заявок:        ${total.toLocaleString()}`)
    console.log(`   Обработано:          ${processedCount.toLocaleString()} (${((processedCount / total) * 100).toFixed(2)}%)`)
    console.log(`   В ожидании:          ${pendingCount.toLocaleString()} (${pendingPercent}%)`)
    
    console.log(`\n🤖 Автопополнение:`)
    console.log(`   Количество:          ${autodepositCount.toLocaleString()}`)
    console.log(`   Процент от всех:     ${autodepositPercent}%`)
    if (processedCount > 0) {
      const autodepositOfProcessed = ((autodepositCount / processedCount) * 100).toFixed(2)
      console.log(`   Процент от обработанных: ${autodepositOfProcessed}%`)
    }

    console.log(`\n👤 profile-1:`)
    console.log(`   Количество:          ${profile1Count.toLocaleString()}`)
    console.log(`   Процент от всех:     ${profile1Percent}%`)
    if (processedCount > 0) {
      const profile1OfProcessed = ((profile1Count / processedCount) * 100).toFixed(2)
      console.log(`   Процент от обработанных: ${profile1OfProcessed}%`)
    }

    console.log(`\n📝 Другие обработчики:`)
    console.log(`   Количество:          ${otherCount.toLocaleString()}`)
    console.log(`   Процент от всех:     ${otherPercent}%`)
    
    if (Object.keys(otherProcessors).length > 0) {
      console.log(`\n   Детализация:`)
      const sortedProcessors = Object.entries(otherProcessors)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10) // Топ 10
      
      for (const [processor, count] of sortedProcessors) {
        const percent = ((count / total) * 100).toFixed(2)
        console.log(`     ${processor.padEnd(30)} ${count.toString().padStart(6)} (${percent}%)`)
      }
    }

    // Сравнение
    console.log(`\n${'═'.repeat(60)}`)
    console.log('📊 СРАВНЕНИЕ:')
    console.log('═'.repeat(60))
    if (processedCount > 0) {
      const autodepositOfProcessed = (autodepositCount / processedCount) * 100
      const profile1OfProcessed = (profile1Count / processedCount) * 100
      
      console.log(`\nАвтопополнение vs profile-1 (от обработанных):`)
      console.log(`   Автопополнение:     ${autodepositOfProcessed.toFixed(2)}%`)
      console.log(`   profile-1:          ${profile1OfProcessed.toFixed(2)}%`)
      
      if (autodepositOfProcessed > profile1OfProcessed) {
        const diff = autodepositOfProcessed - profile1OfProcessed
        console.log(`\n   ✅ Автопополнение обрабатывает на ${diff.toFixed(2)}% больше`)
      } else if (profile1OfProcessed > autodepositOfProcessed) {
        const diff = profile1OfProcessed - autodepositOfProcessed
        console.log(`\n   👤 profile-1 обрабатывает на ${diff.toFixed(2)}% больше`)
      } else {
        console.log(`\n   ⚖️  Обработка распределена равномерно`)
      }
    }

    console.log(`\n${'═'.repeat(60)}`)
    console.log('✅ Анализ завершен')
    console.log('═'.repeat(60))

  } catch (error) {
    console.error('❌ Ошибка при анализе статистики:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

getRequestStatistics()

