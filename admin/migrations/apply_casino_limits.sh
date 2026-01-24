#!/bin/bash

# Скрипт для применения миграции лимитов казино
# Использование: ./apply_casino_limits.sh

echo "Применение миграции casino_limits..."

# Проверяем наличие DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
    echo "Ошибка: DATABASE_URL не установлен"
    exit 1
fi

# Извлекаем параметры подключения из DATABASE_URL
# Формат: postgresql://user:password@host:port/database

# Применяем миграцию через psql
psql "$DATABASE_URL" -f migrations/add_casino_limits.sql

if [ $? -eq 0 ]; then
    echo "✅ Миграция успешно применена!"
else
    echo "❌ Ошибка при применении миграции"
    exit 1
fi

