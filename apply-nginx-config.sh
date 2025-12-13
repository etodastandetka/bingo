#!/bin/bash

# Скрипт для применения правильной конфигурации nginx
# Использование: sudo bash apply-nginx-config.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Проверка прав root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ Пожалуйста, запустите скрипт с sudo${NC}"
    exit 1
fi

echo -e "${YELLOW}📝 Применение конфигурации nginx...${NC}"

# Определяем путь к проекту
PROJECT_DIR=$(pwd)

if [ ! -f "$PROJECT_DIR/nginx-admin.conf" ] || [ ! -f "$PROJECT_DIR/nginx-payment.conf" ]; then
    echo -e "${RED}❌ Конфигурационные файлы не найдены!${NC}"
    echo "Убедитесь, что вы находитесь в корневой директории проекта"
    exit 1
fi

# Создаем резервную копию текущих конфигов
echo -e "${YELLOW}💾 Создание резервных копий...${NC}"
if [ -f /etc/nginx/sites-available/bingo-admin ]; then
    cp /etc/nginx/sites-available/bingo-admin /etc/nginx/sites-available/bingo-admin.backup.$(date +%Y%m%d_%H%M%S)
fi
if [ -f /etc/nginx/sites-available/bingo-payment ]; then
    cp /etc/nginx/sites-available/bingo-payment /etc/nginx/sites-available/bingo-payment.backup.$(date +%Y%m%d_%H%M%S)
fi

# Копируем новые конфиги
echo -e "${YELLOW}📋 Копирование конфигурационных файлов...${NC}"
cp "$PROJECT_DIR/nginx-admin.conf" /etc/nginx/sites-available/bingo-admin
cp "$PROJECT_DIR/nginx-payment.conf" /etc/nginx/sites-available/bingo-payment

# Проверяем, что certbot уже настроил сертификаты
if [ -f /etc/letsencrypt/live/gdsfafdsdf.me/fullchain.pem ]; then
    echo -e "${GREEN}✅ SSL сертификаты найдены${NC}"
else
    echo -e "${YELLOW}⚠️  SSL сертификаты не найдены. Убедитесь, что certbot выполнен успешно${NC}"
fi

# Проверка конфигурации
echo -e "${YELLOW}🔍 Проверка конфигурации Nginx...${NC}"
if nginx -t; then
    echo -e "${GREEN}✅ Конфигурация Nginx корректна${NC}"
    
    # Перезагрузка nginx
    echo -e "${YELLOW}🔄 Перезагрузка Nginx...${NC}"
    systemctl reload nginx
    
    echo -e "${GREEN}✅ Nginx успешно перезагружен!${NC}"
    echo ""
    echo -e "${GREEN}🌐 Проверьте работу сайтов:${NC}"
    echo "   - https://gdsfafdsdf.me"
    echo "   - https://erwerewrew.me"
    echo ""
    echo -e "${YELLOW}📋 Просмотр статуса:${NC}"
    echo "   sudo systemctl status nginx"
    echo "   sudo tail -f /var/log/nginx/admin-ssl-error.log"
    echo "   sudo tail -f /var/log/nginx/payment-ssl-error.log"
else
    echo -e "${RED}❌ Ошибка в конфигурации Nginx!${NC}"
    echo "Проверьте конфигурацию вручную:"
    echo "   sudo nginx -t"
    exit 1
fi

