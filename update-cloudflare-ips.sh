#!/bin/bash

# Скрипт для автоматического обновления IP-адресов Cloudflare в конфигурации Nginx
# Использование: sudo ./update-cloudflare-ips.sh

set -e

echo "🌐 Обновление IP-адресов Cloudflare для Nginx..."

# Создаем временный файл для IP-адресов
TMP_FILE=$(mktemp)

# Получаем IPv4 адреса Cloudflare
echo "# IPv4 адреса Cloudflare" > "$TMP_FILE"
curl -s https://www.cloudflare.com/ips-v4 | sed 's/^/allow /;s/$/;/' >> "$TMP_FILE"

# Получаем IPv6 адреса Cloudflare
echo "" >> "$TMP_FILE"
echo "# IPv6 адреса Cloudflare" >> "$TMP_FILE"
curl -s https://www.cloudflare.com/ips-v6 | sed 's/^/allow /;s/$/;/' >> "$TMP_FILE"

# Добавляем deny all в конец
echo "" >> "$TMP_FILE"
echo "deny all;" >> "$TMP_FILE"

# Создаем конфигурационный файл для включения в Nginx
NGINX_CF_FILE="/etc/nginx/conf.d/cloudflare-ips.conf"

echo "📝 Создание конфигурационного файла: $NGINX_CF_FILE"
sudo cp "$TMP_FILE" "$NGINX_CF_FILE"
sudo chmod 644 "$NGINX_CF_FILE"

# Очищаем временный файл
rm "$TMP_FILE"

echo "✅ IP-адреса Cloudflare обновлены!"
echo ""
echo "📋 Теперь обновите конфигурации Nginx для ваших сайтов:"
echo "   - /etc/nginx/sites-available/bingo-admin"
echo "   - /etc/nginx/sites-available/bingo-payment"
echo ""
echo "Добавьте в начало location блока:"
echo "   include /etc/nginx/conf.d/cloudflare-ips.conf;"
echo ""
echo "Или замените блоки allow/deny на:"
echo "   include /etc/nginx/conf.d/cloudflare-ips.conf;"
echo ""
echo "После обновления проверьте конфигурацию:"
echo "   sudo nginx -t"
echo ""
echo "И перезагрузите Nginx:"
echo "   sudo systemctl reload nginx"

