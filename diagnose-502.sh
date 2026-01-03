#!/bin/bash

# Скрипт для диагностики ошибки 502 Bad Gateway
# Использование: sudo bash diagnose-502.sh

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}🔍 Диагностика ошибки 502 Bad Gateway...${NC}"
echo ""

# 1. Проверка статуса PM2
echo -e "${YELLOW}1. Проверка статуса приложений PM2:${NC}"
pm2 status
echo ""

# 2. Проверка портов
echo -e "${YELLOW}2. Проверка портов 3001 и 3002:${NC}"
if netstat -tlnp 2>/dev/null | grep -q ':3001'; then
    echo -e "${GREEN}✅ Порт 3001 (админка) открыт${NC}"
    netstat -tlnp 2>/dev/null | grep ':3001'
else
    echo -e "${RED}❌ Порт 3001 (админка) не открыт${NC}"
fi
echo ""

if netstat -tlnp 2>/dev/null | grep -q ':3002'; then
    echo -e "${GREEN}✅ Порт 3002 (payment) открыт${NC}"
    netstat -tlnp 2>/dev/null | grep ':3002'
else
    echo -e "${RED}❌ Порт 3002 (payment) не открыт${NC}"
fi
echo ""

# 3. Проверка локального подключения
echo -e "${YELLOW}3. Проверка локального подключения:${NC}"
if curl -s http://localhost:3001 > /dev/null; then
    echo -e "${GREEN}✅ Админка отвечает на localhost:3001${NC}"
else
    echo -e "${RED}❌ Админка не отвечает на localhost:3001${NC}"
fi

if curl -s http://localhost:3002 > /dev/null; then
    echo -e "${GREEN}✅ Payment site отвечает на localhost:3002${NC}"
else
    echo -e "${RED}❌ Payment site не отвечает на localhost:3002${NC}"
fi
echo ""

# 4. Проверка nginx
echo -e "${YELLOW}4. Проверка статуса nginx:${NC}"
systemctl status nginx --no-pager -l | head -10
echo ""

# 5. Проверка конфигурации nginx
echo -e "${YELLOW}5. Проверка конфигурации nginx:${NC}"
nginx -t
echo ""

# 6. Проверка логов nginx
echo -e "${YELLOW}6. Последние ошибки nginx:${NC}"
tail -20 /var/log/nginx/error.log | grep -i "502\|bad gateway\|upstream\|connect" || echo "Нет ошибок в логах"
echo ""

# 7. Проверка логов payment
echo -e "${YELLOW}7. Логи payment site:${NC}"
pm2 logs bingo-payment --lines 10 --nostream 2>/dev/null || echo "Логи не найдены"
echo ""

# 8. Рекомендации
echo -e "${YELLOW}💡 Рекомендации:${NC}"
if ! netstat -tlnp 2>/dev/null | grep -q ':3002'; then
    echo -e "${RED}❌ Payment site не запущен на порту 3002${NC}"
    echo "   Запустите: pm2 restart bingo-payment"
    echo "   Или проверьте ecosystem.config.js"
fi

echo ""
echo -e "${YELLOW}📋 Полезные команды:${NC}"
echo "   pm2 restart bingo-payment    # Перезапуск payment site"
echo "   pm2 logs bingo-payment      # Просмотр логов"
echo "   sudo systemctl status nginx  # Статус nginx"
echo "   sudo tail -f /var/log/nginx/error.log  # Логи nginx"

