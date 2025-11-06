#!/bin/bash

# Скрипт деплоя BINGO Admin Panel
# Использование: ./deploy.sh [--no-build] [--no-pull]

set -e

SKIP_BUILD=false
SKIP_PULL=false

# Парсим аргументы
for arg in "$@"; do
    case $arg in
        --no-build)
            SKIP_BUILD=true
            shift
            ;;
        --no-pull)
            SKIP_PULL=true
            shift
            ;;
    esac
done

echo "🚀 Начинаем деплой BINGO Admin Panel..."

# Переходим в директорию проекта
cd /var/www/bingo/admin_nextjs

# Получаем последние изменения из GitHub
if [ "$SKIP_PULL" = false ]; then
    echo "📥 Получаем изменения из GitHub..."
    git stash 2>/dev/null || true  # Сохраняем локальные изменения если есть
    git pull origin main || echo "⚠️ Не удалось получить изменения (возможно, нет сети)"
fi

# Устанавливаем зависимости (если нужно)
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
    echo "📦 Устанавливаем зависимости..."
    npm install
fi

# Генерируем Prisma клиент
echo "🗄️ Генерируем Prisma клиент..."
npm run db:generate

# Применяем изменения схемы БД (если есть)
echo "🔄 Применяем изменения БД..."
npm run db:push || echo "⚠️ Ошибка при применении БД (возможно, нет изменений)"

# Собираем Next.js приложение
if [ "$SKIP_BUILD" = false ]; then
    echo "🏗️ Собираем приложение..."
    npm run build
else
    echo "⏭️ Пропускаем сборку (--no-build)"
fi

# Перезапускаем PM2 процессы
echo "🔄 Перезапускаем PM2 процессы..."
if pm2 list | grep -q "bingo-admin"; then
    echo "   Перезагружаем существующие процессы..."
    pm2 reload ecosystem.config.js --update-env
else
    echo "   Запускаем новые процессы..."
    pm2 start ecosystem.config.js
fi

# Сохраняем конфигурацию PM2
pm2 save

echo ""
echo "✅ Деплой завершен!"
echo ""
echo "📊 Статус процессов:"
pm2 status

echo ""
echo "📋 Полезные команды:"
echo "   pm2 logs bingo-admin          - просмотр логов админки"
echo "   pm2 logs bingo-email-watcher - просмотр логов watcher"
echo "   pm2 restart all              - перезапуск всех процессов"
echo "   pm2 monit                     - мониторинг процессов"

