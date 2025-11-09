#!/bin/bash

# Скрипт для проверки статуса админ-панели
# Использование: ./check-status.sh

set -e

echo "🔍 Проверка статуса BINGO Admin Panel..."
echo ""

cd /var/www/bingo/admin_nextjs

# 1. Проверяем PM2 процессы
echo "📊 Статус PM2 процессов:"
pm2 status | grep -E "bingo-admin|bingo-email" || echo "⚠️ Процессы не найдены!"

echo ""

# 2. Проверяем, слушает ли порт 3002
echo "🔌 Проверка порта 3002:"
if netstat -tlnp 2>/dev/null | grep -q ":3002" || ss -tlnp 2>/dev/null | grep -q ":3002"; then
    echo "✅ Порт 3002 открыт"
    netstat -tlnp 2>/dev/null | grep ":3002" || ss -tlnp 2>/dev/null | grep ":3002"
else
    echo "❌ Порт 3002 НЕ открыт! Приложение не запущено."
fi

echo ""

# 3. Проверяем доступность приложения
echo "🌐 Проверка доступности приложения:"
if curl -s http://127.0.0.1:3002 > /dev/null; then
    echo "✅ Приложение отвечает на http://127.0.0.1:3002"
    curl -I http://127.0.0.1:3002 2>/dev/null | head -5
else
    echo "❌ Приложение НЕ отвечает на http://127.0.0.1:3002"
fi

echo ""

# 4. Проверяем Nginx
echo "🌐 Проверка Nginx:"
if systemctl is-active --quiet nginx; then
    echo "✅ Nginx запущен"
else
    echo "❌ Nginx НЕ запущен!"
fi

echo ""

# 5. Проверяем конфигурацию Nginx
echo "📋 Проверка конфигурации Nginx:"
if sudo nginx -t 2>&1 | grep -q "successful"; then
    echo "✅ Конфигурация Nginx корректна"
else
    echo "❌ Ошибка в конфигурации Nginx:"
    sudo nginx -t
fi

echo ""

# 6. Проверяем логи PM2
echo "📋 Последние логи bingo-admin (последние 10 строк):"
pm2 logs bingo-admin --lines 10 --nostream 2>/dev/null | tail -10 || echo "⚠️ Логи не найдены"

echo ""

# 7. Проверяем наличие .env файла
echo "📝 Проверка .env файла:"
if [ -f ".env" ]; then
    echo "✅ .env файл существует"
    if grep -q "DATABASE_URL" .env; then
        echo "✅ DATABASE_URL настроен"
    else
        echo "⚠️ DATABASE_URL не найден в .env"
    fi
else
    echo "❌ .env файл НЕ существует!"
fi

echo ""

# 8. Проверяем подключение к БД
echo "🗄️ Проверка подключения к БД:"
if npx prisma db execute --stdin <<< "SELECT 1" > /dev/null 2>&1; then
    echo "✅ Подключение к БД работает"
else
    echo "⚠️ Не удалось проверить подключение к БД"
fi

echo ""

# 9. Проверяем наличие пользователей в БД
echo "👥 Проверка пользователей в БД:"
if command -v npx > /dev/null; then
    npx tsx -e "
    import { PrismaClient } from '@prisma/client';
    const prisma = new PrismaClient();
    prisma.adminUser.findMany().then(users => {
        console.log('Найдено пользователей:', users.length);
        users.forEach(u => console.log('  -', u.username, u.email || ''));
        process.exit(0);
    }).catch(e => {
        console.error('Ошибка:', e.message);
        process.exit(1);
    });
    " 2>/dev/null || echo "⚠️ Не удалось проверить пользователей"
else
    echo "⚠️ npx не найден"
fi

echo ""
echo "✅ Проверка завершена!"

