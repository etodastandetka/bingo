#!/bin/bash

# Скрипт для проверки .env файла
# Использование: ./check-env.sh

set -e

cd /var/www/bingo/admin_nextjs

echo "🔍 Проверка .env файла..."
echo ""

if [ ! -f ".env" ]; then
    echo "❌ .env файл НЕ существует!"
    echo ""
    echo "💡 Создайте его командой:"
    echo "   ./setup-env.sh"
    exit 1
fi

echo "✅ .env файл существует"
echo ""

# Проверяем обязательные переменные
REQUIRED_VARS=("DATABASE_URL" "JWT_SECRET" "NODE_ENV")
MISSING=0

for VAR in "${REQUIRED_VARS[@]}"; do
    if grep -q "^${VAR}=" .env; then
        VALUE=$(grep "^${VAR}=" .env | cut -d '=' -f2- | tr -d '"')
        if [ -n "$VALUE" ] && [ "$VALUE" != "" ]; then
            if [ "$VAR" == "ADMIN_PASSWORD" ]; then
                echo "✅ $VAR: *** (скрыт)"
            else
                # Показываем только первые 50 символов для безопасности
                DISPLAY_VALUE=$(echo "$VALUE" | cut -c1-50)
                if [ ${#VALUE} -gt 50 ]; then
                    echo "✅ $VAR: ${DISPLAY_VALUE}..."
                else
                    echo "✅ $VAR: $DISPLAY_VALUE"
                fi
            fi
        else
            echo "⚠️ $VAR: установлен, но пуст"
            MISSING=1
        fi
    else
        echo "❌ $VAR: не найден"
        MISSING=1
    fi
done

echo ""

# Проверяем опциональные переменные
OPTIONAL_VARS=("ADMIN_USERNAME" "ADMIN_PASSWORD" "ADMIN_EMAIL")
for VAR in "${OPTIONAL_VARS[@]}"; do
    if grep -q "^${VAR}=" .env; then
        VALUE=$(grep "^${VAR}=" .env | cut -d '=' -f2- | tr -d '"')
        if [ "$VAR" == "ADMIN_PASSWORD" ]; then
            echo "ℹ️ $VAR: *** (скрыт)"
        else
            echo "ℹ️ $VAR: $VALUE"
        fi
    else
        echo "ℹ️ $VAR: не установлен (опционально)"
    fi
done

echo ""

if [ $MISSING -eq 0 ]; then
    echo "✅ Все обязательные переменные установлены!"
    exit 0
else
    echo "❌ Некоторые обязательные переменные отсутствуют!"
    echo ""
    echo "💡 Исправьте .env файл или создайте заново:"
    echo "   ./setup-env.sh"
    exit 1
fi

