/**
 * Прямой тест работы с БД для проверки сохранения сообщений
 * Запуск: npm run test:operator-chat-direct
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TEST_USER_ID = process.argv[2] || '123456789'

async function testDirectDatabase() {
  console.log('🧪 Прямой тест работы с БД')
  console.log('='.repeat(60))
  console.log(`👤 User ID: ${TEST_USER_ID}`)
  console.log('')

  try {
    // Тест 1: Проверка подключения
    console.log('📊 Тест 1: Подключение к БД')
    await prisma.$connect()
    console.log('✅ Подключение успешно\n')

    // Тест 2: Создание/обновление пользователя
    console.log('👤 Тест 2: Создание/обновление пользователя')
    const user = await prisma.botUser.upsert({
      where: { userId: BigInt(TEST_USER_ID) },
      update: {
        username: 'test_user',
        firstName: 'Test',
        lastName: 'User',
      },
      create: {
        userId: BigInt(TEST_USER_ID),
        username: 'test_user',
        firstName: 'Test',
        lastName: 'User',
        language: 'ru',
        isActive: true,
      },
    })
    console.log('✅ Пользователь создан/обновлен:', {
      userId: user.userId.toString(),
      username: user.username,
      name: `${user.firstName} ${user.lastName}`,
    })
    console.log('')

    // Тест 3: Сохранение сообщения от пользователя
    console.log('📨 Тест 3: Сохранение сообщения от пользователя (direction=in)')
    const userMessage = await prisma.chatMessage.create({
      data: {
        userId: BigInt(TEST_USER_ID),
        messageText: `Тестовое сообщение от пользователя ${new Date().toLocaleTimeString('ru-RU')}`,
        messageType: 'text',
        direction: 'in',
        botType: 'operator',
        telegramMessageId: BigInt(Date.now()),
      },
    })
    console.log('✅ Сообщение сохранено:', {
      id: userMessage.id,
      userId: userMessage.userId.toString(),
      botType: userMessage.botType,
      direction: userMessage.direction,
      messageText: userMessage.messageText?.substring(0, 50),
      createdAt: userMessage.createdAt,
    })
    console.log('')

    // Тест 4: Сохранение сообщения от оператора
    console.log('🤖 Тест 4: Сохранение сообщения от оператора (direction=out)')
    const operatorMessage = await prisma.chatMessage.create({
      data: {
        userId: BigInt(TEST_USER_ID),
        messageText: `Тестовое сообщение от оператора ${new Date().toLocaleTimeString('ru-RU')}`,
        messageType: 'text',
        direction: 'out',
        botType: 'operator',
        telegramMessageId: BigInt(Date.now() + 1),
      },
    })
    console.log('✅ Сообщение сохранено:', {
      id: operatorMessage.id,
      userId: operatorMessage.userId.toString(),
      botType: operatorMessage.botType,
      direction: operatorMessage.direction,
      messageText: operatorMessage.messageText?.substring(0, 50),
      createdAt: operatorMessage.createdAt,
    })
    console.log('')

    // Тест 5: Получение всех сообщений оператора
    console.log('📋 Тест 5: Получение всех сообщений оператора')
    const allMessages = await prisma.chatMessage.findMany({
      where: {
        userId: BigInt(TEST_USER_ID),
        botType: 'operator',
      },
      orderBy: {
        createdAt: 'asc',
      },
    })
    console.log(`✅ Найдено сообщений: ${allMessages.length}`)
    allMessages.forEach((msg, idx) => {
      const dir = msg.direction === 'in' ? '👤 Пользователь' : '🤖 Оператор'
      console.log(`   ${idx + 1}. ${dir}: ${msg.messageText?.substring(0, 40)}...`)
    })
    console.log('')

    // Тест 6: Проверка группировки по пользователям
    console.log('👥 Тест 6: Группировка пользователей с сообщениями')
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
    console.log(`✅ Найдено пользователей: ${usersWithMessages.length}`)
    usersWithMessages.forEach((group, idx) => {
      console.log(`   ${idx + 1}. UserID: ${group.userId.toString()}, Сообщений: ${group._count.id}`)
    })
    console.log('')

    // Тест 7: Проверка последнего сообщения
    console.log('📝 Тест 7: Получение последнего сообщения')
    const lastMessage = await prisma.chatMessage.findFirst({
      where: {
        userId: BigInt(TEST_USER_ID),
        botType: 'operator',
      },
      orderBy: {
        createdAt: 'desc',
      },
    })
    if (lastMessage) {
      console.log('✅ Последнее сообщение:', {
        id: lastMessage.id,
        direction: lastMessage.direction,
        text: lastMessage.messageText?.substring(0, 50),
        time: lastMessage.createdAt,
      })
    }
    console.log('')

    console.log('✅ Все тесты пройдены успешно!')
    console.log('\n💡 Проверьте в админке:')
    console.log('   1. Откройте /dashboard/operator-chats')
    console.log('   2. Найдите пользователя с ID:', TEST_USER_ID)
    console.log('   3. Откройте чат и проверьте сообщения')

  } catch (error: any) {
    console.error('❌ Ошибка:', error.message)
    console.error(error.stack)
  } finally {
    await prisma.$disconnect()
  }
}

testDirectDatabase()










