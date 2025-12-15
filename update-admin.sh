#!/bin/bash

# Скрипт для обновления и перезапуска Admin Panel
# Использование: ./update-admin.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🔄 Обновление Admin Panel...${NC}"

PROJECT_DIR="$HOME/projects/bingo_bot"
if [ ! -d "$PROJECT_DIR" ]; then
    PROJECT_DIR="/var/www/bingo_bot"
fi

if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "${RED}❌ Проект не найден!${NC}"
    exit 1
fi

cd "$PROJECT_DIR/admin"

echo -e "${YELLOW}📥 Получение последних изменений из Git...${NC}"
git pull

echo -e "${YELLOW}📦 Установка зависимостей (если нужно)...${NC}"
npm install

echo -e "${YELLOW}🔨 Генерация Prisma Client...${NC}"
npm run db:generate

echo -e "${YELLOW}🏗️ Сборка проекта...${NC}"
npm run build

echo -e "${YELLOW}🔄 Перезапуск PM2 процесса...${NC}"
cd ..
pm2 restart bingo-admin

echo -e "${GREEN}✅ Admin Panel успешно обновлен!${NC}"
echo ""
echo "📊 Статус:"
pm2 status bingo-admin

