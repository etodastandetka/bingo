#!/bin/bash

# Скрипт для быстрого перезапуска без сборки
# Использование: ./restart.sh

set -e

echo "🔄 Перезапускаем BINGO Admin Panel..."

cd /var/www/bingo/admin_nextjs

# Перезапускаем PM2 процессы
if pm2 list | grep -q "bingo-admin"; then
    echo "🔄 Перезагружаем процессы..."
    pm2 reload ecosystem.config.js --update-env
else
    echo "⚠️ Процессы не найдены, запускаем..."
    pm2 start ecosystem.config.js
fi

pm2 save

echo ""
echo "✅ Перезапуск завершен!"
echo ""
echo "📊 Статус процессов:"
pm2 status

