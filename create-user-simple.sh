#!/bin/bash

# Простой скрипт для создания пользователя через переменные окружения
# Использование: ./create-user-simple.sh <username> <password> <email>

set -e

cd /var/www/bingo/admin_nextjs

if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Использование: ./create-user-simple.sh <username> <password> <email>"
    echo "Пример: ./create-user-simple.sh 'Mercedes-Benz' 'E63 AMG' 'admin@bingo.com'"
    exit 1
fi

USERNAME="$1"
PASSWORD="$2"
EMAIL="${3:-admin@bingo.com}"

echo "👤 Создаем пользователя администратора..."
echo "Логин: $USERNAME"
echo "Email: $EMAIL"

# Убеждаемся, что зависимости установлены
if [ ! -d "node_modules/@prisma/client" ]; then
    echo "📦 Устанавливаем зависимости..."
    npm install
    echo "🗄️ Генерируем Prisma клиент..."
    npm run db:generate
fi

# Создаем пользователя через переменные окружения
export ADMIN_USERNAME="$USERNAME"
export ADMIN_PASSWORD="$PASSWORD"
export ADMIN_EMAIL="$EMAIL"

echo "🔄 Запускаем создание пользователя..."
npm run create-admin

echo ""
echo "✅ Готово! Теперь можно войти с:"
echo "   Логин: $USERNAME"
echo "   Пароль: $PASSWORD"

