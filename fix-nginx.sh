#!/bin/bash

# Скрипт для исправления конфигурации Nginx

set -e

echo "🔧 Исправляем конфигурацию Nginx..."

# 1. Отключаем старую конфигурацию
echo "❌ Отключаем mnogo-penisa..."
sudo rm -f /etc/nginx/sites-enabled/mnogo-penisa

# 2. Копируем правильную конфигурацию
echo "📝 Копируем конфигурацию bingo-admin..."
cd /var/www/bingo/admin_nextjs
sudo cp nginx.conf /etc/nginx/sites-available/bingo-admin

# 3. Убеждаемся, что симлинк создан
echo "🔗 Создаем симлинк..."
sudo ln -sf /etc/nginx/sites-available/bingo-admin /etc/nginx/sites-enabled/bingo-admin

# 4. Удаляем дефолтную конфигурацию (если есть)
sudo rm -f /etc/nginx/sites-enabled/default

# 5. Проверяем синтаксис
echo "✅ Проверяем синтаксис конфигурации..."
if sudo nginx -t; then
    echo "✅ Конфигурация корректна!"
    
    # 6. Перезапускаем Nginx
    echo "🔄 Перезапускаем Nginx..."
    sudo systemctl reload nginx
    
    echo "✅ Nginx успешно перезапущен!"
    echo ""
    echo "📋 Активные конфигурации:"
    ls -la /etc/nginx/sites-enabled/
    echo ""
    echo "🌐 Проверьте доступность:"
    echo "   curl http://localhost"
    echo "   curl -H 'Host: fqxgmrzplndwsyvkeu.ru' http://localhost"
else
    echo "❌ Ошибка в конфигурации! Проверьте логи выше."
    exit 1
fi

