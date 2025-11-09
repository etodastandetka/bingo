#!/bin/bash

# Скрипт для тестирования логина через API
# Использование: ./test-login.sh <username> <password>

set -e

cd /var/www/bingo/admin_nextjs

if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Использование: ./test-login.sh <username> <password>"
    echo "Пример: ./test-login.sh 'Mercedes-Benz' 'E63 AMG'"
    exit 1
fi

USERNAME="$1"
PASSWORD="$2"

echo "🔐 Тестируем логин для пользователя: $USERNAME"
echo ""

# Тестируем через API
echo "📡 Отправляем запрос на /api/auth/login..."
RESPONSE=$(curl -s -X POST http://127.0.0.1:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")

echo "📥 Ответ сервера:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

echo ""
echo ""

# Проверяем пользователя в БД
echo "🗄️ Проверяем пользователя в БД..."
npx tsx -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.adminUser.findUnique({
  where: { username: '$USERNAME' },
  select: {
    id: true,
    username: true,
    email: true,
    isActive: true,
    isSuperAdmin: true,
    password: { select: { length: true } }
  }
}).then(user => {
  if (user) {
    console.log('✅ Пользователь найден:');
    console.log('  ID:', user.id);
    console.log('  Username:', user.username);
    console.log('  Email:', user.email || 'не указан');
    console.log('  isActive:', user.isActive);
    console.log('  isSuperAdmin:', user.isSuperAdmin);
    console.log('  Password hash length:', user.password ? 'есть' : 'отсутствует');
  } else {
    console.log('❌ Пользователь не найден!');
  }
  process.exit(0);
}).catch(e => {
  console.error('❌ Ошибка:', e.message);
  process.exit(1);
});
"

echo ""
echo "✅ Тест завершен!"

