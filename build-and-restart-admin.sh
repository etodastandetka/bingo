#!/bin/bash

# Скрипт для сборки и перезапуска админки

echo "🔧 Сборка и перезапуск админки..."

# Переходим в директорию админки
cd /var/www/bingo_bot/admin || exit 1

echo "📦 Установка зависимостей..."
npm install

echo "🏗️ Сборка проекта..."
npm run build

# Проверяем, что сборка прошла успешно
if [ ! -d ".next/standalone" ]; then
    echo "❌ Ошибка: standalone build не создан!"
    echo "Проверьте, что в next.config.js установлено output: 'standalone'"
    exit 1
fi

# Проверяем, что статические файлы скопированы
if [ ! -d ".next/standalone/public" ]; then
    echo "⚠️  Предупреждение: папка public не найдена в standalone build"
    echo "Копируем файлы из public в .next/standalone/public..."
    mkdir -p .next/standalone/public
    cp -r public/* .next/standalone/public/ 2>/dev/null || true
fi

# Проверяем наличие изображений
if [ ! -d ".next/standalone/public/images" ]; then
    echo "⚠️  Предупреждение: папка images не найдена"
    echo "Копируем изображения..."
    mkdir -p .next/standalone/public/images
    cp -r public/images/* .next/standalone/public/images/ 2>/dev/null || true
fi

echo "✅ Сборка завершена успешно!"
echo "📁 Проверка статических файлов:"
ls -la .next/standalone/public/images/ 2>/dev/null || echo "⚠️  Изображения не найдены"

# Возвращаемся в корень
cd /var/www/bingo_bot || exit 1

echo "🔄 Перезапуск PM2..."
pm2 restart bingo-admin

echo "✅ Готово! Проверьте логи: pm2 logs bingo-admin"

