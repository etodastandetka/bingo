#!/bin/bash

# Скрипт деплоя BINGO Admin Panel
# Использование: ./deploy.sh

set -e

echo "🚀 Начинаем деплой BINGO Admin Panel..."

# Переходим в директорию проекта
cd /var/www/bingo/admin_nextjs

# Получаем последние изменения из GitHub
echo "📥 Получаем изменения из GitHub..."
git pull origin main

# Устанавливаем зависимости
echo "📦 Устанавливаем зависимости..."
npm install

# Генерируем Prisma клиент
echo "🗄️ Генерируем Prisma клиент..."
npm run db:generate

# Применяем изменения схемы БД (если есть)
echo "🔄 Применяем изменения БД..."
npm run db:push || echo "⚠️ Ошибка при применении БД (возможно, нет изменений)"

# Собираем Next.js приложение
echo "🏗️ Собираем приложение..."
npm run build

# Перезапускаем PM2 процессы
echo "🔄 Перезапускаем PM2 процессы..."
pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js

# Сохраняем конфигурацию PM2
pm2 save

echo "✅ Деплой завершен!"
echo "📊 Статус процессов:"
pm2 status

