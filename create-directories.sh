#!/bin/bash

# Скрипт для создания необходимых директорий на сервере
# Использование: sudo ./create-directories.sh

set -e

echo "📁 Создаем директории для BINGO Admin Panel..."

# Создаем основную директорию проекта
echo "Создаем /var/www/bingo..."
sudo mkdir -p /var/www/bingo
sudo chown -R $USER:$USER /var/www/bingo

# Создаем директорию для логов PM2
echo "Создаем /var/log/pm2..."
sudo mkdir -p /var/log/pm2
sudo chown -R $USER:$USER /var/log/pm2

# Создаем директорию для Nginx (если нужно)
echo "Создаем директорию для Nginx конфигов..."
sudo mkdir -p /etc/nginx/sites-available
sudo mkdir -p /etc/nginx/sites-enabled

echo "✅ Директории созданы!"
echo ""
echo "📋 Созданные директории:"
echo "  - /var/www/bingo (основная директория проекта)"
echo "  - /var/log/pm2 (логи PM2)"
echo ""
echo "🔐 Права доступа установлены для пользователя: $USER"
echo ""
echo "📥 Теперь можно клонировать репозиторий:"
echo "   cd /var/www/bingo"
echo "   git clone https://github.com/etodastandetka/bingo.git admin_nextjs"

