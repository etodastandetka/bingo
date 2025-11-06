#!/bin/bash

# Скрипт для отладки проблем с редиректом
# Использование: ./fix-redirect-debug.sh

set -e

echo "🔍 Отладка проблем с редиректом..."
echo ""

cd /var/www/bingo/admin_nextjs

# 1. Проверяем .env
echo "📝 Проверяем .env..."
if [ -f ".env" ]; then
    echo "✅ .env существует"
    if grep -q "NODE_ENV" .env; then
        NODE_ENV=$(grep "NODE_ENV" .env | cut -d '=' -f2 | tr -d '"')
        echo "   NODE_ENV: $NODE_ENV"
    else
        echo "⚠️ NODE_ENV не установлен"
    fi
else
    echo "❌ .env не существует!"
    echo "   Создайте его: ./setup-env.sh"
    exit 1
fi

# 2. Проверяем cookies в браузере
echo ""
echo "🍪 Проверка cookies:"
echo "   Откройте DevTools (F12) -> Application -> Cookies"
echo "   Проверьте наличие cookie 'auth_token'"
echo "   Должны быть установлены:"
echo "     - Domain: fqxgmrzplndwsyvkeu.ru"
echo "     - Path: /"
echo "     - HttpOnly: ✓"
echo "     - Secure: зависит от HTTPS"
echo "     - SameSite: Lax"

# 3. Проверяем логи
echo ""
echo "📋 Проверяем логи PM2..."
echo "   Последние 20 строк логов:"
pm2 logs bingo-admin --lines 20 --nostream | tail -20 || echo "   Логи не найдены"

# 4. Тестируем API логина
echo ""
echo "🧪 Тестируем API логина..."
echo "   Выполните в браузере (F12 -> Console):"
echo ""
cat << 'EOF'
fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'Mercedes-Benz', password: 'E63 AMG' })
})
.then(r => r.json())
.then(d => {
  console.log('Response:', d);
  console.log('Cookies:', document.cookie);
})
EOF

echo ""
echo "✅ Проверка завершена!"
echo ""
echo "💡 Если проблема сохраняется:"
echo "   1. Проверьте, что cookie устанавливается (DevTools -> Application -> Cookies)"
echo "   2. Проверьте логи PM2: pm2 logs bingo-admin --lines 50"
echo "   3. Проверьте Network tab в DevTools - смотрите заголовки Set-Cookie"
echo "   4. Убедитесь, что домен правильный и нет проблем с HTTPS/HTTP"

