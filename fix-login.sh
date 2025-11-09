#!/bin/bash

# Скрипт для исправления проблем с входом
# Использование: ./fix-login.sh

set -e

echo "🔧 Исправление проблем с входом..."

cd /var/www/bingo/admin_nextjs

# 1. Убеждаемся, что зависимости установлены
echo "📦 Проверяем зависимости..."
if [ ! -d "node_modules" ]; then
    echo "   Устанавливаем зависимости..."
    npm install
fi

# 2. Генерируем Prisma клиент
echo "🗄️ Генерируем Prisma клиент..."
npm run db:generate

# 3. Применяем схему БД
echo "🔄 Применяем схему БД..."
npm run db:push || echo "⚠️ Ошибка при применении БД"

# 4. Собираем приложение (если не собрано)
if [ ! -d ".next" ]; then
    echo "🏗️ Собираем приложение..."
    npm run build
fi

# 5. Проверяем/запускаем PM2 процессы
echo "🚀 Проверяем PM2 процессы..."
if pm2 list | grep -q "bingo-admin"; then
    echo "   Перезапускаем процессы..."
    pm2 restart ecosystem.config.js --update-env
else
    echo "   Запускаем процессы..."
    pm2 start ecosystem.config.js
fi

pm2 save

# 6. Проверяем доступность
echo ""
echo "⏳ Ждем 3 секунды для запуска..."
sleep 3

echo ""
echo "🔍 Проверяем доступность..."
if curl -s http://127.0.0.1:3002 > /dev/null; then
    echo "✅ Приложение работает на http://127.0.0.1:3002"
else
    echo "❌ Приложение не отвечает!"
    echo "📋 Проверьте логи:"
    echo "   pm2 logs bingo-admin --lines 50"
fi

echo ""
echo "✅ Готово!"
echo ""
echo "📋 Если все еще не работает, проверьте:"
echo "   1. Логи: pm2 logs bingo-admin --lines 50"
echo "   2. Статус: pm2 status"
echo "   3. Порт: netstat -tlnp | grep 3002"

