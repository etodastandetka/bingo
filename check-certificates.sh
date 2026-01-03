#!/bin/bash

# Скрипт для проверки структуры SSL сертификатов
# Использование: sudo bash check-certificates.sh

echo "🔍 Проверка SSL сертификатов..."
echo ""

# Проверка сертификатов
if [ -d /etc/letsencrypt/live ]; then
    echo "📁 Найденные сертификаты:"
    ls -la /etc/letsencrypt/live/
    echo ""
    
    for domain_dir in /etc/letsencrypt/live/*/; do
        if [ -d "$domain_dir" ]; then
            domain=$(basename "$domain_dir")
            echo "📋 Домен: $domain"
            if [ -f "$domain_dir/fullchain.pem" ]; then
                echo "   ✅ fullchain.pem найден"
                # Проверяем какие домены в сертификате
                echo "   Домены в сертификате:"
                openssl x509 -in "$domain_dir/fullchain.pem" -noout -text | grep -A 1 "Subject Alternative Name" || openssl x509 -in "$domain_dir/fullchain.pem" -noout -text | grep "DNS:"
            else
                echo "   ❌ fullchain.pem не найден"
            fi
            echo ""
        fi
    done
else
    echo "❌ Директория /etc/letsencrypt/live не найдена"
fi

echo ""
echo "📋 Список всех сертификатов certbot:"
sudo certbot certificates

