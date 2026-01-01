#!/bin/bash
# Скрипт для выполнения миграции bot_type на сервере

echo "🔧 Выполнение миграции для добавления поля bot_type в таблицу requests..."

# Получаем DATABASE_URL из .env файла админки
cd /var/www/bingo_bot/admin

# Если есть .env файл, загружаем переменные
if [ -f .env ]; then
    export $(cat .env | grep DATABASE_URL | xargs)
fi

# Извлекаем параметры подключения из DATABASE_URL
# Формат: postgresql://user:password@host:port/database
DB_URL=${DATABASE_URL:-"postgresql://user:password@92.51.38.85:5432/default_db"}

echo "📊 Подключение к базе данных..."

# Выполняем миграцию
psql "$DB_URL" << EOF
-- Add botType column to requests table
ALTER TABLE requests ADD COLUMN IF NOT EXISTS bot_type VARCHAR(20) DEFAULT 'main';

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_requests_bot_type ON requests(bot_type);

-- Проверяем, что колонка создана
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'requests' AND column_name = 'bot_type';
EOF

if [ $? -eq 0 ]; then
    echo "✅ Миграция выполнена успешно!"
else
    echo "❌ Ошибка при выполнении миграции"
    exit 1
fi

