import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import * as readline from 'readline'

const prisma = new PrismaClient()

// Функция для чтения ввода из консоли
function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

// Функция для скрытого ввода пароля (для Unix-систем)
function askPassword(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    // На Windows просто показываем пароль, на Unix можно использовать readline с stdin
    rl.question(query, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

async function validateUsername(username: string): Promise<string | null> {
  if (!username || username.trim().length === 0) {
    return 'Имя пользователя не может быть пустым'
  }
  if (username.length < 3) {
    return 'Имя пользователя должно быть не менее 3 символов'
  }
  if (username.length > 50) {
    return 'Имя пользователя должно быть не более 50 символов'
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return 'Имя пользователя может содержать только буквы, цифры и подчеркивание'
  }
  
  const existing = await prisma.adminUser.findUnique({
    where: { username },
  })
  
  if (existing) {
    return 'Пользователь с таким именем уже существует'
  }
  
  return null
}

async function validatePassword(password: string): Promise<string | null> {
  if (!password || password.length === 0) {
    return 'Пароль не может быть пустым'
  }
  if (password.length < 6) {
    return 'Пароль должен быть не менее 6 символов'
  }
  if (password.length > 100) {
    return 'Пароль должен быть не более 100 символов'
  }
  return null
}

async function validateEmail(email: string): Promise<string | null> {
  if (!email || email.trim().length === 0) {
    return null // Email опционален
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return 'Неверный формат email'
  }
  
  const existing = await prisma.adminUser.findUnique({
    where: { email },
  })
  
  if (existing) {
    return 'Пользователь с таким email уже существует'
  }
  
  return null
}

async function createUser() {
  console.log('🔐 Создание нового пользователя для админ-панели\n')

  // Получаем данные из аргументов командной строки или интерактивно
  let username: string | undefined = process.argv[2]
  let password: string | undefined = process.argv[3]
  let email: string | undefined = process.argv[4]
  let isSuperAdmin: boolean | undefined = process.argv[5] === 'true' || process.argv[5] === '1'

  // Если не переданы аргументы, запрашиваем интерактивно
  if (!username) {
    while (true) {
      username = await askQuestion('Введите имя пользователя: ')
      const error = await validateUsername(username)
      if (!error) {
        break
      }
      console.log(`❌ ${error}\n`)
    }
  } else {
    const error = await validateUsername(username)
    if (error) {
      console.error(`❌ ${error}`)
      process.exit(1)
    }
  }

  if (!password) {
    while (true) {
      password = await askPassword('Введите пароль: ')
      const error = await validatePassword(password)
      if (!error) {
        break
      }
      console.log(`❌ ${error}\n`)
    }
    
    // Подтверждение пароля
    while (true) {
      const confirmPassword = await askPassword('Подтвердите пароль: ')
      if (password === confirmPassword) {
        break
      }
      console.log('❌ Пароли не совпадают. Попробуйте снова.\n')
    }
  } else {
    const error = await validatePassword(password)
    if (error) {
      console.error(`❌ ${error}`)
      process.exit(1)
    }
  }

  if (!email) {
    while (true) {
      email = await askQuestion('Введите email (необязательно, нажмите Enter чтобы пропустить): ')
      if (!email || email.trim().length === 0) {
        email = undefined
        break
      }
      const error = await validateEmail(email)
      if (!error) {
        break
      }
      console.log(`❌ ${error}\n`)
    }
  } else if (email.trim().length > 0) {
    const error = await validateEmail(email)
    if (error) {
      console.error(`❌ ${error}`)
      process.exit(1)
    }
  } else {
    email = undefined
  }

  if (isSuperAdmin === undefined) {
    const superAdminAnswer = await askQuestion('Создать суперадмина? (y/n, по умолчанию n): ')
    isSuperAdmin = superAdminAnswer.toLowerCase() === 'y' || superAdminAnswer.toLowerCase() === 'yes'
  }

  // Хешируем пароль
  const hashedPassword = await bcrypt.hash(password, 10)

  try {
    const user = await prisma.adminUser.create({
      data: {
        username,
        password: hashedPassword,
        email: email || null,
        isActive: true,
        isSuperAdmin: isSuperAdmin || false,
      },
    })

    console.log('\n✅ Пользователь успешно создан!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`👤 Имя пользователя: ${user.username}`)
    if (user.email) {
      console.log(`📧 Email: ${user.email}`)
    }
    console.log(`🔑 Пароль: ${password}`)
    console.log(`⭐ Суперадмин: ${user.isSuperAdmin ? 'Да' : 'Нет'}`)
    console.log(`🆔 ID: ${user.id}`)
    console.log(`📅 Создан: ${user.createdAt.toLocaleString('ru-RU')}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('\n⚠️  ВАЖНО: Сохраните пароль в безопасном месте!')
    console.log('   Рекомендуется изменить пароль после первого входа.\n')
  } catch (error: any) {
    console.error('❌ Ошибка при создании пользователя:', error.message)
    if (error.code === 'P2002') {
      console.error('   Пользователь с таким именем или email уже существует')
    }
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Обработка ошибок
process.on('unhandledRejection', (error) => {
  console.error('❌ Необработанная ошибка:', error)
  process.exit(1)
})

createUser()

