#!/bin/bash

# Скрипт для исправления ошибки 502 Bad Gateway
# Использование: ./fix-502.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🔧 Исправление ошибки 502 Bad Gateway...${NC}"
echo ""

PROJECT_DIR="/var/www/bingo_bot"
cd "$PROJECT_DIR/admin"

# 1. Остановка процесса
echo -e "${YELLOW}1. Остановка процесса bingo-admin...${NC}"
pm2 stop bingo-admin || true
sleep 2

# 2. Проверка и установка зависимостей
echo -e "${YELLOW}2. Проверка зависимостей...${NC}"
if [ ! -d "node_modules" ]; then
    echo "Установка зависимостей..."
    npm install
else
    echo -e "${GREEN}✓ Зависимости уже установлены${NC}"
fi

# 3. Генерация Prisma Client
echo -e "${YELLOW}3. Генерация Prisma Client...${NC}"
npm run db:generate

# 4. Сборка проекта
echo -e "${YELLOW}4. Сборка проекта...${NC}"
npm run build

# 5. Проверка сборки
if [ ! -d ".next" ]; then
    echo -e "${RED}❌ Ошибка: Директория .next не создана после сборки!${NC}"
    exit 1
fi

if [ ! -d ".next/static" ]; then
    echo -e "${RED}❌ Ошибка: Директория .next/static не создана!${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Сборка успешна${NC}"

# 6. Удаление старого процесса и запуск нового
echo -e "${YELLOW}5. Перезапуск PM2 процесса...${NC}"
cd "$PROJECT_DIR"
pm2 delete bingo-admin 2>/dev/null || true
cd admin
pm2 start npm --name "bingo-admin" -- start
pm2 save

# 7. Ожидание запуска
echo -e "${YELLOW}6. Ожидание запуска (10 секунд)...${NC}"
sleep 10

# 8. Проверка статуса
echo -e "${YELLOW}7. Проверка статуса...${NC}"
pm2 status bingo-admin

# 9. Проверка подключения
echo -e "${YELLOW}8. Проверка подключения к приложению...${NC}"
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3001 | grep -q "200\|302\|301"; then
    echo -e "${GREEN}✅ Приложение успешно запущено и отвечает!${NC}"
else
    echo -e "${RED}❌ Приложение не отвечает. Проверьте логи:${NC}"
    echo "pm2 logs bingo-admin --lines 50"
fi

echo ""
echo -e "${GREEN}✅ Готово!${NC}"
echo ""
echo "Если проблема сохраняется, проверьте логи:"
echo "  pm2 logs bingo-admin --lines 100"
echo ""
echo "И проверьте конфигурацию nginx:"
echo "  sudo nginx -t"
echo "  sudo systemctl reload nginx"

