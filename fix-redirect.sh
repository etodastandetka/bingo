#!/bin/bash

# Скрипт для исправления редиректа на mnogo-rolly

set -e

echo "🔍 Проверяем конфигурации Nginx..."

# 1. Показываем все активные конфигурации
echo "📋 Активные конфигурации Nginx:"
ls -la /etc/nginx/sites-enabled/

# 2. Ищем конфигурации с mnogo-rolly
echo ""
echo "🔍 Ищем конфигурации с mnogo-rolly:"
sudo grep -r "mnogo-rolly" /etc/nginx/sites-available/ /etc/nginx/sites-enabled/ 2>/dev/null || echo "Не найдено"

# 3. Проверяем конфигурацию bingo-admin
echo ""
echo "📋 Конфигурация bingo-admin:"
sudo cat /etc/nginx/sites-available/bingo-admin | head -20

# 4. Отключаем все конфигурации кроме bingo-admin
echo ""
echo "❌ Отключаем все конфигурации кроме bingo-admin..."
cd /etc/nginx/sites-enabled/
sudo rm -f default
sudo rm -f mnogo-penisa 2>/dev/null || true
sudo rm -f *mnogo* 2>/dev/null || true

# Оставляем только bingo-admin
sudo ln -sf /etc/nginx/sites-available/bingo-admin /etc/nginx/sites-enabled/bingo-admin

# 5. Проверяем, что осталось
echo ""
echo "✅ Активные конфигурации после очистки:"
ls -la /etc/nginx/sites-enabled/

# 6. Обновляем конфигурацию bingo-admin
echo ""
echo "🔄 Обновляем конфигурацию bingo-admin..."
cd /var/www/bingo/admin_nextjs
sudo cp nginx.conf /etc/nginx/sites-available/bingo-admin

# 7. Проверяем синтаксис
echo ""
echo "🔍 Проверяем синтаксис..."
if sudo nginx -t; then
    echo "✅ Синтаксис корректен!"
    
    # 8. Перезапускаем Nginx
    echo ""
    echo "🔄 Перезапускаем Nginx..."
    sudo systemctl reload nginx
    
    echo ""
    echo "✅ Nginx перезапущен!"
    echo ""
    echo "🌐 Проверьте доступность:"
    echo "   curl -H 'Host: fqxgmrzplndwsyvkeu.ru' http://localhost"
else
    echo "❌ Ошибка в конфигурации!"
    exit 1
fi

