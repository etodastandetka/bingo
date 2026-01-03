#!/bin/bash

# Скрипт диагностики проблем с Admin Panel
# Использование: ./diagnose-admin.sh

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🔍 Диагностика Admin Panel...${NC}"
echo ""

# 1. Проверка PM2 статуса
echo -e "${YELLOW}1. Проверка PM2 процессов:${NC}"
pm2 status bingo-admin
echo ""

# 2. Проверка порта 3001
echo -e "${YELLOW}2. Проверка порта 3001:${NC}"
if netstat -tuln 2>/dev/null | grep -q ":3001 "; then
    echo -e "${GREEN}✓ Порт 3001 слушается${NC}"
    netstat -tuln | grep ":3001 "
else
    echo -e "${RED}✗ Порт 3001 НЕ слушается!${NC}"
fi
echo ""

# 3. Проверка прямого подключения к приложению
echo -e "${YELLOW}3. Проверка прямого подключения к localhost:3001:${NC}"
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3001 | grep -q "200\|302\|301"; then
    echo -e "${GREEN}✓ Приложение отвечает на localhost:3001${NC}"
    curl -s -I http://localhost:3001 | head -1
else
    echo -e "${RED}✗ Приложение НЕ отвечает на localhost:3001${NC}"
    echo "Ответ:"
    curl -s -I http://localhost:3001 2>&1 | head -5
fi
echo ""

# 4. Последние логи PM2
echo -e "${YELLOW}4. Последние логи PM2 (последние 30 строк):${NC}"
pm2 logs bingo-admin --lines 30 --nostream 2>&1 | tail -30
echo ""

# 5. Проверка файлов сборки
echo -e "${YELLOW}5. Проверка наличия .next директории:${NC}"
if [ -d "/var/www/bingo_bot/admin/.next" ]; then
    echo -e "${GREEN}✓ Директория .next существует${NC}"
    echo "Размер: $(du -sh /var/www/bingo_bot/admin/.next 2>/dev/null | cut -f1)"
    
    if [ -d "/var/www/bingo_bot/admin/.next/static" ]; then
        echo -e "${GREEN}✓ Директория .next/static существует${NC}"
        echo "Количество файлов в chunks: $(find /var/www/bingo_bot/admin/.next/static/chunks -type f 2>/dev/null | wc -l)"
    else
        echo -e "${RED}✗ Директория .next/static НЕ существует!${NC}"
    fi
else
    echo -e "${RED}✗ Директория .next НЕ существует! Нужно собрать проект.${NC}"
fi
echo ""

# 6. Проверка nginx
echo -e "${YELLOW}6. Проверка статуса nginx:${NC}"
if systemctl is-active --quiet nginx; then
    echo -e "${GREEN}✓ Nginx работает${NC}"
else
    echo -e "${RED}✗ Nginx НЕ работает!${NC}"
fi
echo ""

# 7. Проверка последних ошибок nginx
echo -e "${YELLOW}7. Последние ошибки nginx (последние 10 строк):${NC}"
tail -10 /var/log/nginx/admin-ssl-error.log 2>/dev/null || echo "Файл логов не найден"
echo ""

# 8. Проверка переменных окружения
echo -e "${YELLOW}8. Проверка .env файла:${NC}"
if [ -f "/var/www/bingo_bot/admin/.env" ]; then
    echo -e "${GREEN}✓ Файл .env существует${NC}"
    if grep -q "DATABASE_URL" /var/www/bingo_bot/admin/.env; then
        echo -e "${GREEN}✓ DATABASE_URL настроен${NC}"
    else
        echo -e "${RED}✗ DATABASE_URL не найден в .env${NC}"
    fi
else
    echo -e "${RED}✗ Файл .env НЕ существует!${NC}"
fi
echo ""

# 9. Рекомендации
echo -e "${YELLOW}📋 Рекомендации:${NC}"
echo ""
echo "Если порт 3001 не слушается или приложение не отвечает:"
echo "  1. Перезапустите приложение: pm2 restart bingo-admin"
echo "  2. Проверьте логи: pm2 logs bingo-admin --lines 100"
echo ""
echo "Если директория .next отсутствует или пустая:"
echo "  1. cd /var/www/bingo_bot/admin"
echo "  2. npm run build"
echo ""
echo "Если есть ошибки в логах PM2:"
echo "  1. Проверьте подключение к базе данных"
echo "  2. Проверьте переменные окружения в .env"
echo "  3. Убедитесь, что все зависимости установлены: npm install"
echo ""

