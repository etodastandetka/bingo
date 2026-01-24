#!/bin/bash

# Скрипт для применения миграции лимитов казино
# Использование: ./apply_casino_limits.sh

echo "Применение миграции casino_limits..."

# Определяем путь к .env файлу (в текущей директории или в родительской)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ADMIN_DIR/.env"

# Загружаем переменные из .env файла
if [ -f "$ENV_FILE" ]; then
    echo "Загрузка переменных из .env файла..."
    set -a
    source "$ENV_FILE"
    set +a
    echo "✅ Переменные загружены из $ENV_FILE"
else
    echo "⚠️  Предупреждение: .env файл не найден в $ENV_FILE"
fi

# Проверяем наличие DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Ошибка: DATABASE_URL не установлен"
    echo "Проверьте, что DATABASE_URL указан в .env файле"
    exit 1
fi

echo "Подключение к базе данных..."

# Применяем миграцию через psql
psql "$DATABASE_URL" -f "$SCRIPT_DIR/add_casino_limits.sql"

if [ $? -eq 0 ]; then
    echo "✅ Миграция успешно применена!"
else
    echo "❌ Ошибка при применении миграции"
    exit 1
fi

