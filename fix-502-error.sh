#!/bin/bash

# Скрипт для исправления ошибки 502 Bad Gateway
# Использование: sudo bash fix-502-error.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}🔧 Исправление ошибки 502 Bad Gateway...${NC}"
echo ""

# 1. Проверка PM2
echo -e "${YELLOW}1. Проверка статуса PM2 приложений:${NC}"
pm2 status
echo ""

# 2. Проверка payment site
echo -e "${YELLOW}2. Проверка payment site:${NC}"
if pm2 list | grep -q "bingo-payment"; then
    echo -e "${GREEN}✅ bingo-payment найден в PM2${NC}"
    
    # Проверяем статус
    PAYMENT_STATUS=$(pm2 jlist | grep -A 10 '"name":"bingo-payment"' | grep '"pm2_env":{"status"' | grep -o '"status":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
    echo "   Статус: $PAYMENT_STATUS"
    
    if [ "$PAYMENT_STATUS" != "online" ]; then
        echo -e "${RED}❌ Payment site не запущен! Перезапускаем...${NC}"
        pm2 restart bingo-payment
        sleep 3
    fi
else
    echo -e "${RED}❌ bingo-payment не найден в PM2${NC}"
    echo -e "${YELLOW}   Запускаем из ecosystem.config.js...${NC}"
    pm2 start ecosystem.config.js --only bingo-payment
    sleep 3
fi
echo ""

# 3. Проверка порта 3002
echo -e "${YELLOW}3. Проверка порта 3002:${NC}"
if netstat -tlnp 2>/dev/null | grep -q ':3002'; then
    echo -e "${GREEN}✅ Порт 3002 открыт${NC}"
    netstat -tlnp 2>/dev/null | grep ':3002'
else
    echo -e "${RED}❌ Порт 3002 не открыт${NC}"
    echo -e "${YELLOW}   Проверяем логи payment site...${NC}"
    pm2 logs bingo-payment --lines 20 --nostream
    echo ""
    echo -e "${YELLOW}   Возможно нужно установить gunicorn:${NC}"
    echo "   cd payment_site"
    echo "   source venv/bin/activate  # или python3 -m venv venv && source venv/bin/activate"
    echo "   pip install gunicorn"
fi
echo ""

# 4. Проверка локального подключения
echo -e "${YELLOW}4. Проверка локального подключения:${NC}"
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3002 | grep -q "200\|301\|302"; then
    echo -e "${GREEN}✅ Payment site отвечает на localhost:3002${NC}"
else
    echo -e "${RED}❌ Payment site не отвечает на localhost:3002${NC}"
    echo -e "${YELLOW}   Пробуем перезапустить...${NC}"
    pm2 restart bingo-payment
    sleep 5
    
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3002 | grep -q "200\|301\|302"; then
        echo -e "${GREEN}✅ После перезапуска работает!${NC}"
    else
        echo -e "${RED}❌ Все еще не работает. Проверьте логи:${NC}"
        echo "   pm2 logs bingo-payment"
    fi
fi
echo ""

# 5. Проверка nginx
echo -e "${YELLOW}5. Проверка nginx:${NC}"
if systemctl is-active --quiet nginx; then
    echo -e "${GREEN}✅ Nginx запущен${NC}"
    
    # Проверяем конфигурацию
    if nginx -t 2>&1 | grep -q "successful"; then
        echo -e "${GREEN}✅ Конфигурация nginx корректна${NC}"
        systemctl reload nginx
    else
        echo -e "${RED}❌ Ошибка в конфигурации nginx${NC}"
        nginx -t
    fi
else
    echo -e "${RED}❌ Nginx не запущен${NC}"
    systemctl start nginx
fi
echo ""

# 6. Финальная проверка
echo -e "${YELLOW}6. Финальная проверка:${NC}"
echo "Проверяем порты:"
netstat -tlnp 2>/dev/null | grep -E ':3001|:3002' || echo "Порты не найдены"
echo ""

echo -e "${GREEN}✅ Диагностика завершена!${NC}"
echo ""
echo -e "${YELLOW}📋 Если проблема осталась:${NC}"
echo "   1. Проверьте логи: pm2 logs bingo-payment"
echo "   2. Проверьте логи nginx: sudo tail -f /var/log/nginx/error.log"
echo "   3. Убедитесь что gunicorn установлен: pip install gunicorn"
echo "   4. Перезапустите все: pm2 restart all"

