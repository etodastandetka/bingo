#!/bin/bash

# Агрессивный скрипт для исправления редиректа

set -e

echo "🔍 Полная проверка конфигураций Nginx..."

# 1. Показываем ВСЕ конфигурации
echo "📋 Все доступные конфигурации:"
ls -la /etc/nginx/sites-available/

echo ""
echo "📋 Все активные конфигурации:"
ls -la /etc/nginx/sites-enabled/

# 2. Ищем все упоминания mnogo-rolly
echo ""
echo "🔍 Ищем все упоминания mnogo-rolly:"
sudo grep -r "mnogo-rolly" /etc/nginx/ 2>/dev/null || echo "Не найдено в /etc/nginx/"

# 3. Ищем все редиректы
echo ""
echo "🔍 Ищем все редиректы (return 301, return 302):"
sudo grep -r "return 30" /etc/nginx/sites-available/ /etc/nginx/sites-enabled/ 2>/dev/null || echo "Не найдено"

# 4. Показываем содержимое всех активных конфигураций
echo ""
echo "📋 Содержимое всех активных конфигураций:"
for file in /etc/nginx/sites-enabled/*; do
    if [ -f "$file" ]; then
        echo "--- $(basename $file) ---"
        sudo cat "$file" | head -30
        echo ""
    fi
done

# 5. УДАЛЯЕМ все конфигурации кроме bingo-admin
echo ""
echo "❌ Удаляем ВСЕ конфигурации из sites-enabled..."
cd /etc/nginx/sites-enabled/
sudo rm -f *

# 6. Создаем только bingo-admin
echo ""
echo "✅ Создаем только bingo-admin..."
sudo ln -sf /etc/nginx/sites-available/bingo-admin /etc/nginx/sites-enabled/bingo-admin

# 7. Обновляем конфигурацию bingo-admin
echo ""
echo "🔄 Обновляем конфигурацию bingo-admin..."
cd /var/www/bingo/admin_nextjs
git pull origin main
sudo cp nginx.conf /etc/nginx/sites-available/bingo-admin

# 8. Показываем финальную конфигурацию
echo ""
echo "📋 Финальная конфигурация bingo-admin:"
sudo cat /etc/nginx/sites-available/bingo-admin

# 9. Проверяем синтаксис
echo ""
echo "🔍 Проверяем синтаксис..."
if sudo nginx -t; then
    echo "✅ Синтаксис корректен!"
    
    # 10. Перезапускаем Nginx
    echo ""
    echo "🔄 Перезапускаем Nginx..."
    sudo systemctl restart nginx
    
    echo ""
    echo "✅ Nginx перезапущен!"
    echo ""
    echo "📊 Статус Nginx:"
    sudo systemctl status nginx --no-pager -l | head -15
    
    echo ""
    echo "🌐 Проверьте доступность:"
    echo "   curl -v -H 'Host: fqxgmrzplndwsyvkeu.ru' http://localhost 2>&1 | grep -E 'HTTP|Location|Host'"
else
    echo "❌ Ошибка в конфигурации!"
    exit 1
fi

