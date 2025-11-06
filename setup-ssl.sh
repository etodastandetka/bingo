#!/bin/bash

# Скрипт для получения SSL сертификата и настройки HTTPS

set -e

echo "🔒 Настройка SSL сертификата для BINGO Admin Panel..."

# 1. Проверяем, установлен ли certbot
if ! command -v certbot &> /dev/null; then
    echo "📦 Устанавливаем Certbot..."
    sudo apt update
    sudo apt install certbot python3-certbot-nginx -y
else
    echo "✅ Certbot уже установлен"
fi

# 2. Получаем SSL сертификат
echo ""
echo "🔐 Получаем SSL сертификат для fqxgmrzplndwsyvkeu.ru..."
sudo certbot --nginx -d fqxgmrzplndwsyvkeu.ru -d www.fqxgmrzplndwsyvkeu.ru --non-interactive --agree-tos --email admin@fqxgmrzplndwsyvkeu.ru || {
    echo "⚠️ Автоматическая настройка не удалась, попробуем вручную..."
    echo "Выполните: sudo certbot --nginx -d fqxgmrzplndwsyvkeu.ru -d www.fqxgmrzplndwsyvkeu.ru"
    exit 1
}

# 3. Обновляем конфигурацию Nginx (раскомментируем HTTPS секцию)
echo ""
echo "🔄 Обновляем конфигурацию Nginx для HTTPS..."

cd /var/www/bingo/admin_nextjs
git pull origin main

# Создаем конфигурацию с HTTPS
cat > /tmp/bingo-admin-https.conf << 'EOF'
# Блокируем все другие домены и редиректы
server {
    listen 80 default_server;
    server_name _;
    return 444;
}

# Редирект HTTP на HTTPS
server {
    listen 80;
    server_name fqxgmrzplndwsyvkeu.ru www.fqxgmrzplndwsyvkeu.ru;
    return 301 https://$server_name$request_uri;
}

# HTTPS конфигурация
server {
    listen 443 ssl http2;
    server_name fqxgmrzplndwsyvkeu.ru www.fqxgmrzplndwsyvkeu.ru;

    ssl_certificate /etc/letsencrypt/live/fqxgmrzplndwsyvkeu.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fqxgmrzplndwsyvkeu.ru/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# Копируем обновленную конфигурацию
sudo cp /tmp/bingo-admin-https.conf /etc/nginx/sites-available/bingo-admin

# 4. Проверяем синтаксис
echo ""
echo "🔍 Проверяем синтаксис конфигурации..."
if sudo nginx -t; then
    echo "✅ Синтаксис корректен!"
    
    # 5. Перезапускаем Nginx
    echo ""
    echo "🔄 Перезапускаем Nginx..."
    sudo systemctl reload nginx
    
    echo ""
    echo "✅ SSL сертификат настроен!"
    echo ""
    echo "🌐 Админка доступна по адресу:"
    echo "   https://fqxgmrzplndwsyvkeu.ru"
    echo ""
    echo "📋 Проверка сертификата:"
    echo "   curl -I https://fqxgmrzplndwsyvkeu.ru"
else
    echo "❌ Ошибка в конфигурации!"
    exit 1
fi

