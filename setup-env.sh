#!/bin/bash

# Скрипт для создания/проверки .env файла
# Использование: ./setup-env.sh

set -e

cd /var/www/bingo/admin_nextjs

echo "📝 Настройка .env файла..."
echo ""

# Проверяем, существует ли .env
if [ -f ".env" ]; then
    echo "✅ .env файл уже существует"
    echo ""
    echo "📋 Текущее содержимое:"
    echo "---"
    cat .env | grep -v "PASSWORD" | sed 's/PASSWORD=.*/PASSWORD=***/' || cat .env
    echo "---"
    echo ""
    read -p "Перезаписать? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Отменено. Используется существующий .env"
        exit 0
    fi
fi

# Запрашиваем данные
echo "Введите данные для .env файла:"
echo ""

# DATABASE_URL
read -p "DATABASE_URL [postgresql://gen_user:dastan10dz@92.51.38.85:5432/default_db?schema=public]: " DB_URL
DB_URL=${DB_URL:-"postgresql://gen_user:dastan10dz@92.51.38.85:5432/default_db?schema=public"}

# JWT_SECRET
read -p "JWT_SECRET [luxon-admin-secret-key-2025-change-in-production]: " JWT_SECRET
JWT_SECRET=${JWT_SECRET:-"luxon-admin-secret-key-2025-change-in-production"}

# NODE_ENV
read -p "NODE_ENV [production]: " NODE_ENV
NODE_ENV=${NODE_ENV:-"production"}

# ADMIN_USERNAME (опционально, для создания админа)
read -p "ADMIN_USERNAME (для создания админа) [Mercedes-Benz]: " ADMIN_USERNAME
ADMIN_USERNAME=${ADMIN_USERNAME:-"Mercedes-Benz"}

# ADMIN_PASSWORD
read -p "ADMIN_PASSWORD [E63 AMG]: " ADMIN_PASSWORD
ADMIN_PASSWORD=${ADMIN_PASSWORD:-"E63 AMG"}

# ADMIN_EMAIL
read -p "ADMIN_EMAIL [admin@bingo.com]: " ADMIN_EMAIL
ADMIN_EMAIL=${ADMIN_EMAIL:-"admin@bingo.com"}

# Создаем .env файл
cat > .env << EOF
DATABASE_URL="$DB_URL"
JWT_SECRET="$JWT_SECRET"
NODE_ENV="$NODE_ENV"
ADMIN_USERNAME="$ADMIN_USERNAME"
ADMIN_PASSWORD="$ADMIN_PASSWORD"
ADMIN_EMAIL="$ADMIN_EMAIL"
EOF

echo ""
echo "✅ .env файл создан!"
echo ""
echo "📋 Содержимое (пароль скрыт):"
cat .env | sed 's/ADMIN_PASSWORD=.*/ADMIN_PASSWORD=***/'
echo ""

# Проверяем обязательные переменные
echo "🔍 Проверяем обязательные переменные..."
MISSING=0

if ! grep -q "DATABASE_URL=" .env || [ -z "$DB_URL" ]; then
    echo "❌ DATABASE_URL не установлен"
    MISSING=1
fi

if ! grep -q "JWT_SECRET=" .env || [ -z "$JWT_SECRET" ]; then
    echo "❌ JWT_SECRET не установлен"
    MISSING=1
fi

if ! grep -q "NODE_ENV=" .env || [ -z "$NODE_ENV" ]; then
    echo "❌ NODE_ENV не установлен"
    MISSING=1
fi

if [ $MISSING -eq 0 ]; then
    echo "✅ Все обязательные переменные установлены"
else
    echo "⚠️ Некоторые переменные отсутствуют!"
    exit 1
fi

echo ""
echo "✅ Готово! Теперь можно:"
echo "   1. Создать пользователя: ./create-user.sh \"$ADMIN_USERNAME\" \"$ADMIN_PASSWORD\" \"$ADMIN_EMAIL\""
echo "   2. Перезапустить приложение: pm2 restart bingo-admin"

