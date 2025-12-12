/**
 * Тестовый скрипт для проверки работы операторского чата
 * Проверяет:
 * 1. Сохранение сообщения от пользователя (как бот)
 * 2. Получение списка чатов
 * 3. Получение истории чата
 * 4. Отправку сообщения от оператора
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Тестовый пользователь ID (замените на реальный)
const TEST_USER_ID = '123456789' // Замените на реальный ID пользователя из Telegram

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000'
const OPERATOR_BOT_TOKEN = process.env.OPERATOR_BOT_TOKEN || process.env.NEXT_PUBLIC_OPERATOR_BOT_TOKEN || ''

async function testSaveMessageFromBot() {
  console.log('\n📨 Тест 1: Сохранение сообщения от пользователя (как бот)')
  console.log('=' .repeat(60))
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: TEST_USER_ID,
        messageText: 'Тестовое сообщение от пользователя',
        messageType: 'text',
        direction: 'in',
        botType: 'operator',
        telegramMessageId: Date.now().toString(),
        username: 'test_user',
        firstName: 'Test',
        lastName: 'User',
      }),
    })

    const data = await response.json()
    console.log('📤 Запрос:', {
      url: `${API_BASE_URL}/api/chat-message`,
      method: 'POST',
      body: {
        userId: TEST_USER_ID,
        messageText: 'Тестовое сообщение от пользователя',
        botType: 'operator',
        direction: 'in',
      },
    })
    console.log('📥 Ответ:', JSON.stringify(data, null, 2))
    console.log('✅ Статус:', response.status)

    if (data.success) {
      console.log('✅ Сообщение успешно сохранено!')
      return data.data
    } else {
      console.error('❌ Ошибка при сохранении:', data.error)
      return null
    }
  } catch (error: any) {
    console.error('❌ Ошибка запроса:', error.message)
    return null
  }
}

async function testGetOperatorChats() {
  console.log('\n📋 Тест 2: Получение списка операторских чатов')
  console.log('=' .repeat(60))
  
  try {
    // Нужен auth token для этого запроса, но для теста проверим напрямую через БД
    const messages = await prisma.chatMessage.findMany({
      where: {
        botType: 'operator',
        direction: 'in',
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    })

    console.log(`📊 Найдено сообщений в БД: ${messages.length}`)
    
    if (messages.length > 0) {
      console.log('\n📝 Примеры сообщений:')
      messages.slice(0, 3).forEach((msg, idx) => {
        console.log(`  ${idx + 1}. ID: ${msg.id}, UserID: ${msg.userId.toString()}, Text: ${msg.messageText?.substring(0, 50)}..., BotType: ${msg.botType}, Direction: ${msg.direction}, Created: ${msg.createdAt}`)
      })
    }

    // Группируем по пользователям
    const usersWithMessages = await prisma.chatMessage.groupBy({
      by: ['userId'],
      where: {
        botType: 'operator',
        direction: 'in',
      },
      _count: {
        id: true,
      },
    })

    console.log(`\n👥 Пользователей с сообщениями: ${usersWithMessages.length}`)
    return messages
  } catch (error: any) {
    console.error('❌ Ошибка при получении чатов:', error.message)
    return []
  }
}

async function testGetChatHistory(userId: string) {
  console.log('\n💬 Тест 3: Получение истории чата для пользователя')
  console.log('=' .repeat(60))
  
  try {
    const messages = await prisma.chatMessage.findMany({
      where: {
        userId: BigInt(userId),
        botType: 'operator',
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 20,
    })

    console.log(`📊 Найдено сообщений для пользователя ${userId}: ${messages.length}`)
    
    if (messages.length > 0) {
      console.log('\n📝 История сообщений:')
      messages.reverse().forEach((msg, idx) => {
        const direction = msg.direction === 'in' ? '👤 Пользователь' : '🤖 Оператор'
        const text = msg.messageText || (msg.mediaUrl ? `[${msg.messageType}]` : '[пусто]')
        console.log(`  ${idx + 1}. ${direction}: ${text.substring(0, 60)}... (${msg.createdAt.toLocaleString('ru-RU')})`)
      })
    }

    return messages
  } catch (error: any) {
    console.error('❌ Ошибка при получении истории:', error.message)
    return []
  }
}

async function testSendMessageFromOperator(userId: string) {
  console.log('\n📤 Тест 4: Отправка сообщения от оператора')
  console.log('=' .repeat(60))
  
  if (!OPERATOR_BOT_TOKEN) {
    console.error('❌ OPERATOR_BOT_TOKEN не установлен!')
    return null
  }

  try {
    // Проверяем отправку через Telegram API
    const testMessage = `Тестовое сообщение от оператора ${new Date().toLocaleTimeString('ru-RU')}`
    
    console.log('📤 Отправка через Telegram API...')
    const telegramResponse = await fetch(`https://api.telegram.org/bot${OPERATOR_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: userId,
        text: testMessage,
        parse_mode: 'HTML',
        protect_content: true,
      }),
    })

    const telegramData = await telegramResponse.json()
    console.log('📥 Ответ Telegram API:', JSON.stringify(telegramData, null, 2))

    if (!telegramData.ok) {
      console.error('❌ Ошибка Telegram API:', telegramData.description)
      return null
    }

    const telegramMessageId = BigInt(telegramData.result.message_id)
    console.log('✅ Сообщение отправлено в Telegram, message_id:', telegramMessageId.toString())

    // Сохраняем в БД
    console.log('\n💾 Сохранение в БД...')
    const savedMessage = await prisma.chatMessage.create({
      data: {
        userId: BigInt(userId),
        messageText: testMessage,
        messageType: 'text',
        direction: 'out',
        botType: 'operator',
        telegramMessageId,
      },
    })

    console.log('✅ Сообщение сохранено в БД:', {
      id: savedMessage.id,
      userId: savedMessage.userId.toString(),
      botType: savedMessage.botType,
      direction: savedMessage.direction,
      createdAt: savedMessage.createdAt,
    })

    return savedMessage
  } catch (error: any) {
    console.error('❌ Ошибка при отправке сообщения:', error.message)
    return null
  }
}

async function testDatabaseConnection() {
  console.log('\n🔌 Тест 0: Проверка подключения к БД')
  console.log('=' .repeat(60))
  
  try {
    await prisma.$connect()
    console.log('✅ Подключение к БД успешно')
    
    const messageCount = await prisma.chatMessage.count({
      where: {
        botType: 'operator',
      },
    })
    console.log(`📊 Всего сообщений оператора в БД: ${messageCount}`)
    
    return true
  } catch (error: any) {
    console.error('❌ Ошибка подключения к БД:', error.message)
    return false
  }
}

async function runAllTests() {
  console.log('🚀 Запуск тестов операторского чата')
  console.log('=' .repeat(60))
  console.log(`🌐 API URL: ${API_BASE_URL}`)
  console.log(`👤 Тестовый User ID: ${TEST_USER_ID}`)
  console.log(`🔑 OPERATOR_BOT_TOKEN: ${OPERATOR_BOT_TOKEN ? OPERATOR_BOT_TOKEN.substring(0, 10) + '...' : 'НЕ УСТАНОВЛЕН'}`)

  // Тест 0: Подключение к БД
  const dbConnected = await testDatabaseConnection()
  if (!dbConnected) {
    console.error('\n❌ Не удалось подключиться к БД. Прерываем тесты.')
    return
  }

  // Тест 1: Сохранение сообщения от пользователя
  const savedMessage = await testSaveMessageFromBot()
  
  // Тест 2: Получение списка чатов
  await testGetOperatorChats()
  
  // Тест 3: Получение истории чата
  await testGetChatHistory(TEST_USER_ID)
  
  // Тест 4: Отправка сообщения от оператора (только если есть токен)
  if (OPERATOR_BOT_TOKEN) {
    await testSendMessageFromOperator(TEST_USER_ID)
  } else {
    console.log('\n⚠️ Пропущен тест отправки сообщения (нет OPERATOR_BOT_TOKEN)')
  }

  // Финальная проверка
  console.log('\n📊 Финальная проверка БД')
  console.log('=' .repeat(60))
  const finalMessages = await prisma.chatMessage.findMany({
    where: {
      userId: BigInt(TEST_USER_ID),
      botType: 'operator',
    },
    orderBy: {
      createdAt: 'desc',
    },
  })
  
  console.log(`📝 Всего сообщений для тестового пользователя: ${finalMessages.length}`)
  console.log(`  👤 От пользователя: ${finalMessages.filter(m => m.direction === 'in').length}`)
  console.log(`  🤖 От оператора: ${finalMessages.filter(m => m.direction === 'out').length}`)

  await prisma.$disconnect()
  console.log('\n✅ Тесты завершены!')
}

// Запуск тестов
runAllTests().catch(console.error)

