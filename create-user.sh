#!/bin/bash

# Скрипт для создания пользователя администратора
# Использование: ./create-user.sh <username> <password> <email>

set -e

cd /var/www/bingo/admin_nextjs

if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Использование: ./create-user.sh <username> <password> <email>"
    echo "Пример: ./create-user.sh 'Mercedes-Benz' 'E63 AMG' 'admin@bingo.com'"
    exit 1
fi

USERNAME="$1"
PASSWORD="$2"
EMAIL="${3:-admin@bingo.com}"

echo "👤 Создаем пользователя администратора..."
echo "Логин: $USERNAME"
echo "Email: $EMAIL"

# Убеждаемся, что зависимости установлены
if [ ! -d "node_modules" ]; then
    echo "📦 Устанавливаем зависимости..."
    npm install
fi

# Генерируем Prisma клиент
echo "🗄️ Генерируем Prisma клиент..."
npm run db:generate

# Создаем скрипт в текущей директории (не в /tmp)
cat > create-user-temp.ts << 'SCRIPT_EOF'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const username = process.argv[2]
  const password = process.argv[3]
  const email = process.argv[4] || 'admin@bingo.com'

  if (!username || !password) {
    console.error('❌ Ошибка: не указаны username и password')
    process.exit(1)
  }

  // Хешируем пароль
  const hashedPassword = await bcrypt.hash(password, 10)

  // Проверяем, существует ли пользователь
  const existing = await prisma.adminUser.findUnique({
    where: { username }
  })

  if (existing) {
    // Обновляем существующего пользователя
    await prisma.adminUser.update({
      where: { username },
      data: {
        password: hashedPassword,
        email: email || null,
        isActive: true
      }
    })
    console.log(`✅ Пользователь ${username} обновлен!`)
  } else {
    // Создаем нового пользователя
    await prisma.adminUser.create({
      data: {
        username,
        password: hashedPassword,
        email: email || null,
        isActive: true,
        isSuperAdmin: true
      }
    })
    console.log(`✅ Пользователь ${username} создан!`)
  }
}

main()
  .catch((e) => {
    console.error('❌ Ошибка:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
SCRIPT_EOF

# Запускаем скрипт с аргументами
npx tsx create-user-temp.ts "$USERNAME" "$PASSWORD" "$EMAIL"

# Удаляем временный файл
rm -f create-user-temp.ts

echo ""
echo "✅ Готово! Теперь можно войти с:"
echo "   Логин: $USERNAME"
echo "   Пароль: $PASSWORD"

