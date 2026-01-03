#!/bin/bash

# Скрипт для получения SSL сертификатов через Certbot
# Использование: sudo bash get-ssl-certificates.sh

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

echo -e "${YELLOW}🔐 Получение SSL сертификатов для доменов...${NC}"
echo ""

# Получение сертификатов для обоих доменов
echo -e "${YELLOW}Получаем сертификаты для:${NC}"
echo "  - gdsfafdsdf.me (админка)"
echo "  - erwerewrew.me (форма оплаты)"
echo ""

certbot --nginx -d gdsfafdsdf.me -d erwerewrew.me

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Сертификаты успешно получены!${NC}"
    echo ""
    
    # Тестовое обновление
    echo -e "${YELLOW}🧪 Тестирование автоматического обновления...${NC}"
    certbot renew --dry-run
    
    echo ""
    echo -e "${GREEN}✅ Все готово!${NC}"
    echo ""
    echo -e "${GREEN}🌐 Проверьте работу сайтов:${NC}"
    echo "   - https://gdsfafdsdf.me"
    echo "   - https://erwerewrew.me"
    echo ""
    echo -e "${YELLOW}📋 Просмотр установленных сертификатов:${NC}"
    echo "   sudo certbot certificates"
else
    echo ""
    echo -e "${RED}❌ Ошибка при получении сертификатов${NC}"
    echo ""
    echo "Возможные причины:"
    echo "  1. DNS записи еще не распространились"
    echo "  2. Порты 80/443 закрыты в firewall"
    echo "  3. Nginx не запущен"
    echo ""
    echo "Проверьте:"
    echo "  - DNS: dig gdsfafdsdf.me"
    echo "  - Firewall: sudo ufw status"
    echo "  - Nginx: sudo systemctl status nginx"
fi

