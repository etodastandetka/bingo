#!/bin/bash

# Скрипт для проверки и исправления конфигурации Nginx

set -e

echo "🔍 Проверяем конфигурацию Nginx..."

cd /var/www/bingo/admin_nextjs

# 1. Проверяем текущую конфигурацию на сервере
echo "📋 Текущая конфигурация на сервере:"
sudo grep -n "proxy_pass" /etc/nginx/sites-available/bingo-admin || echo "Файл не найден или нет proxy_pass"

# 2. Проверяем локальную конфигурацию
echo ""
echo "📋 Локальная конфигурация:"
grep -n "proxy_pass" nginx.conf || echo "proxy_pass не найден"

# 3. Обновляем конфигурацию
echo ""
echo "🔄 Обновляем конфигурацию..."
sudo cp nginx.conf /etc/nginx/sites-available/bingo-admin

# 4. Проверяем, что обновилось
echo ""
echo "✅ Проверяем обновленную конфигурацию:"
sudo grep -n "proxy_pass" /etc/nginx/sites-available/bingo-admin

# 5. Проверяем синтаксис
echo ""
echo "🔍 Проверяем синтаксис..."
if sudo nginx -t; then
    echo "✅ Синтаксис корректен!"
    
    # 6. Перезапускаем Nginx
    echo ""
    echo "🔄 Перезапускаем Nginx..."
    sudo systemctl reload nginx
    
    echo ""
    echo "✅ Nginx успешно перезапущен!"
    echo ""
    echo "📊 Статус Nginx:"
    sudo systemctl status nginx --no-pager -l | head -20
else
    echo "❌ Ошибка в конфигурации!"
    exit 1
fi

