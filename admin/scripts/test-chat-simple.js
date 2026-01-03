/**
 * Простой тест для проверки работы API операторского чата
 * Запуск: node scripts/test-chat-simple.js [USER_ID]
 */

const TEST_USER_ID = process.argv[2] || '123456789'
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001'

async function testSaveMessage() {
  console.log('\n📨 Тест: Сохранение сообщения от пользователя')
  console.log('='.repeat(60))
  
  const testData = {
    userId: TEST_USER_ID,
    messageText: `Тестовое сообщение ${new Date().toLocaleTimeString('ru-RU')}`,
    messageType: 'text',
    direction: 'in',
    botType: 'operator',
    telegramMessageId: Date.now().toString(),
    username: 'test_user',
    firstName: 'Test',
    lastName: 'User',
  }

  console.log('📤 Отправка запроса:', {
    url: `${API_BASE_URL}/api/chat-message`,
    method: 'POST',
    data: testData,
  })

  try {
    const response = await fetch(`${API_BASE_URL}/api/chat-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData),
    })

    const data = await response.json()
    
    console.log('📥 Статус ответа:', response.status)
    console.log('📥 Тело ответа:', JSON.stringify(data, null, 2))

    if (data.success) {
      console.log('✅ Сообщение успешно сохранено!')
      console.log('   ID сообщения:', data.data.id)
      console.log('   User ID:', data.data.userId)
      console.log('   Bot Type:', data.data.botType)
      console.log('   Direction:', data.data.direction)
      return data.data
    } else {
      console.error('❌ Ошибка:', data.error)
      return null
    }
  } catch (error) {
    console.error('❌ Ошибка запроса:', error.message)
    if (error.code === 'ECONNREFUSED') {
      console.error('   ⚠️  Сервер не запущен или недоступен по адресу:', API_BASE_URL)
    }
    return null
  }
}

async function testCORS() {
  console.log('\n🌐 Тест: Проверка CORS')
  console.log('='.repeat(60))
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat-message`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:3000',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type',
      },
    })

    console.log('📥 Статус OPTIONS:', response.status)
    const headers = {}
    response.headers.forEach((value, key) => {
      if (key.toLowerCase().startsWith('access-control')) {
        headers[key] = value
      }
    })
    console.log('📥 CORS заголовки:', headers)

    if (headers['access-control-allow-origin']) {
      console.log('✅ CORS настроен правильно')
    } else {
      console.log('⚠️  CORS заголовки отсутствуют')
    }
  } catch (error) {
    console.error('❌ Ошибка CORS теста:', error.message)
  }
}

async function runTests() {
  console.log('🚀 Запуск тестов операторского чата')
  console.log('='.repeat(60))
  console.log(`🌐 API URL: ${API_BASE_URL}`)
  console.log(`👤 User ID: ${TEST_USER_ID}`)
  console.log('')

  // Тест CORS
  await testCORS()

  // Тест сохранения сообщения
  const result = await testSaveMessage()

  if (result) {
    console.log('\n✅ Все тесты пройдены успешно!')
    console.log('\n💡 Следующие шаги:')
    console.log('   1. Проверьте, что сообщение появилось в админке')
    console.log('   2. Проверьте список чатов: /dashboard/operator-chats')
    console.log('   3. Откройте чат с пользователем и проверьте сообщение')
  } else {
    console.log('\n❌ Тесты не пройдены. Проверьте:')
    console.log('   1. Запущен ли сервер Next.js (npm run dev)')
    console.log('   2. Правильно ли настроен API_BASE_URL')
    console.log('   3. Доступен ли endpoint /api/chat-message')
  }
}

runTests().catch(console.error)

