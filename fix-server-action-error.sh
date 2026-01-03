#!/bin/bash

# Быстрое исправление ошибки "Server Action 'x'" в Next.js
# Использование: ./fix-server-action-error.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}🔧 Исправление ошибки Server Action...${NC}"

# Определяем директорию проекта
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$SCRIPT_DIR"

if [ -d "$PROJECT_DIR/admin" ]; then
    echo -e "${GREEN}✓ Проект найден: $PROJECT_DIR${NC}"
else
    if [ -d "/var/www/bingo_bot/admin" ]; then
        PROJECT_DIR="/var/www/bingo_bot"
    else
        echo -e "${RED}❌ Проект не найден!${NC}"
        exit 1
    fi
fi

cd "$PROJECT_DIR/admin"

echo -e "${YELLOW}🧹 Очистка кеша Next.js...${NC}"
rm -rf .next
rm -rf node_modules/.cache
rm -rf .next/cache 2>/dev/null || true

echo -e "${YELLOW}🏗️ Пересборка проекта...${NC}"
npm run build

echo -e "${YELLOW}🔄 Перезапуск PM2 процесса...${NC}"
cd ..
pm2 restart bingo-admin --update-env

echo -e "${GREEN}✅ Приложение перезапущено!${NC}"
echo ""
echo "📊 Статус:"
pm2 status bingo-admin
echo ""
echo "📋 Логи (последние 20 строк):"
pm2 logs bingo-admin --lines 20 --nostream

