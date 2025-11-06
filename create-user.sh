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

# Создаем временный скрипт для создания пользователя
cat > /tmp/create-user-temp.ts << EOF
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const username = '$USERNAME'
  const password = '$PASSWORD'
  const email = '$EMAIL'

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
        email: email || null
      }
    })
    console.log(\`✅ Пользователь \${username} обновлен!\`)
  } else {
    // Создаем нового пользователя
    await prisma.adminUser.create({
      data: {
        username,
        password: hashedPassword,
        email: email || null,
        isSuperAdmin: true
      }
    })
    console.log(\`✅ Пользователь \${username} создан!\`)
  }
}

main()
  .catch((e) => {
    console.error('❌ Ошибка:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.\$disconnect()
  })
EOF

# Запускаем скрипт
npx tsx /tmp/create-user-temp.ts

# Удаляем временный файл
rm -f /tmp/create-user-temp.ts

echo ""
echo "✅ Готово! Теперь можно войти с:"
echo "   Логин: $USERNAME"
echo "   Пароль: $PASSWORD"

