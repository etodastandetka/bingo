#!/bin/bash

# Скрипт для автоматической установки Nginx и SSL сертификатов
# Использование: sudo bash setup-nginx-ssl.sh

set -e

echo "🚀 Начинаем установку Nginx и SSL сертификатов..."

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Проверка прав root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ Пожалуйста, запустите скрипт с sudo${NC}"
    exit 1
fi

# Шаг 1: Установка Nginx
echo -e "${YELLOW}📦 Установка Nginx...${NC}"
apt update
apt install nginx -y
systemctl enable nginx
systemctl start nginx

# Шаг 2: Копирование конфигурационных файлов
echo -e "${YELLOW}📝 Копирование конфигурационных файлов...${NC}"

# Определяем путь к проекту
PROJECT_DIR=$(pwd)

if [ ! -f "$PROJECT_DIR/nginx-admin.conf" ] || [ ! -f "$PROJECT_DIR/nginx-payment.conf" ]; then
    echo -e "${RED}❌ Конфигурационные файлы не найдены!${NC}"
    echo "Убедитесь, что вы находитесь в корневой директории проекта"
    exit 1
fi

# Копируем конфиги
cp "$PROJECT_DIR/nginx-admin.conf" /etc/nginx/sites-available/bingo-admin
cp "$PROJECT_DIR/nginx-payment.conf" /etc/nginx/sites-available/bingo-payment

# Создаем символические ссылки
ln -sf /etc/nginx/sites-available/bingo-admin /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/bingo-payment /etc/nginx/sites-enabled/

# Удаляем дефолтный конфиг
if [ -f /etc/nginx/sites-enabled/default ]; then
    rm /etc/nginx/sites-enabled/default
fi

# Проверка конфигурации
echo -e "${YELLOW}🔍 Проверка конфигурации Nginx...${NC}"
if nginx -t; then
    echo -e "${GREEN}✅ Конфигурация Nginx корректна${NC}"
    systemctl reload nginx
else
    echo -e "${RED}❌ Ошибка в конфигурации Nginx!${NC}"
    exit 1
fi

# Шаг 3: Установка Certbot
echo -e "${YELLOW}📦 Установка Certbot...${NC}"
apt install snapd -y
snap install core; snap refresh core
snap install --classic certbot

# Создание символической ссылки
ln -sf /snap/bin/certbot /usr/bin/certbot

# Шаг 4: Проверка DNS
echo -e "${YELLOW}🌐 Проверка DNS записей...${NC}"
echo "Проверяем gdsfafdsdf.me..."
dig +short gdsfafdsdf.me || echo -e "${YELLOW}⚠️  Не удалось получить IP для gdsfafdsdf.me${NC}"

echo "Проверяем erwerewrew.me..."
dig +short erwerewrew.me || echo -e "${YELLOW}⚠️  Не удалось получить IP для erwerewrew.me${NC}"

echo -e "${YELLOW}⚠️  Убедитесь, что DNS записи настроены правильно перед получением сертификатов!${NC}"

# Шаг 5: Получение SSL сертификатов
echo -e "${YELLOW}🔐 Получение SSL сертификатов...${NC}"
echo -e "${YELLOW}Этот шаг требует интерактивного ввода.${NC}"
read -p "Продолжить получение сертификатов? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    certbot --nginx -d gdsfafdsdf.me -d erwerewrew.me
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Сертификаты успешно получены!${NC}"
        
        # Тестовое обновление
        echo -e "${YELLOW}🧪 Тестирование автоматического обновления...${NC}"
        certbot renew --dry-run
        
        echo -e "${GREEN}✅ Установка завершена!${NC}"
        echo -e "${GREEN}🌐 Проверьте работу сайтов:${NC}"
        echo "   - https://gdsfafdsdf.me"
        echo "   - https://erwerewrew.me"
    else
        echo -e "${RED}❌ Ошибка при получении сертификатов${NC}"
        echo "Проверьте DNS записи и повторите попытку:"
        echo "   sudo certbot --nginx -d gdsfafdsdf.me -d erwerewrew.me"
    fi
else
    echo -e "${YELLOW}⏭️  Пропущено получение сертификатов${NC}"
    echo "Вы можете получить их позже командой:"
    echo "   sudo certbot --nginx -d gdsfafdsdf.me -d erwerewrew.me"
fi

# Финальная проверка
echo -e "${YELLOW}🔍 Финальная проверка...${NC}"
nginx -t
systemctl status nginx --no-pager -l

echo -e "${GREEN}✨ Готово!${NC}"

