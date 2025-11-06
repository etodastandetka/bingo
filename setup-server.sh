#!/bin/bash

# Скрипт первоначальной настройки сервера
# Использование: ./setup-server.sh

set -e

echo "🔧 Настройка сервера для BINGO Admin Panel..."

# Создаем директорию проекта
echo "📁 Создаем директорию проекта..."
sudo mkdir -p /var/www/bingo
sudo chown -R $USER:$USER /var/www/bingo

# Создаем директорию для логов PM2
echo "📁 Создаем директорию для логов..."
sudo mkdir -p /var/log/pm2
sudo chown -R $USER:$USER /var/log/pm2

# Клонируем репозиторий
echo "📥 Клонируем репозиторий..."
cd /var/www/bingo
if [ -d "admin_nextjs" ]; then
    echo "⚠️ Директория уже существует, пропускаем клонирование"
    cd admin_nextjs
    echo "🔄 Обновляем существующий репозиторий..."
    git pull origin main || echo "⚠️ Не удалось обновить (возможно, нет сети или изменений)"
else
    echo "📥 Клонируем репозиторий..."
    git clone https://github.com/etodastandetka/bingo.git admin_nextjs || {
        echo "❌ Ошибка при клонировании репозитория!"
        echo "💡 Возможные причины:"
        echo "   - Нет подключения к интернету"
        echo "   - Проблемы с DNS (не может разрешить github.com)"
        echo "   - Проблемы с доступом к GitHub"
        echo ""
        echo "🔧 Решения:"
        echo "   1. Проверьте подключение к интернету: ping github.com"
        echo "   2. Проверьте DNS: nslookup github.com"
        echo "   3. Попробуйте использовать SSH вместо HTTPS:"
        echo "      git clone git@github.com:etodastandetka/bingo.git admin_nextjs"
        exit 1
    }
    cd admin_nextjs
fi

cd admin_nextjs

# Устанавливаем зависимости
echo "📦 Устанавливаем зависимости..."
npm install

# Создаем .env файл (если его нет)
if [ ! -f ".env" ]; then
    echo "📝 Создаем .env файл..."
    cat > .env << EOF
DATABASE_URL="postgresql://gen_user:dastan10dz@92.51.38.85:5432/default_db?schema=public"
JWT_SECRET="luxon-admin-secret-key-2025-change-in-production"
NODE_ENV="production"
ADMIN_USERNAME="dastan"
ADMIN_PASSWORD="dastan10dz"
ADMIN_EMAIL="admin@luxon.com"
EOF
    echo "⚠️ Не забудьте обновить .env файл с правильными значениями!"
fi

# Генерируем Prisma клиент
echo "🗄️ Генерируем Prisma клиент..."
npm run db:generate

# Применяем схему БД
echo "🔄 Применяем схему БД..."
npm run db:push

# Собираем приложение
echo "🏗️ Собираем приложение..."
npm run build

# Устанавливаем PM2 глобально (если не установлен)
if ! command -v pm2 &> /dev/null; then
    echo "📦 Устанавливаем PM2..."
    sudo npm install -g pm2
fi

# Запускаем приложение через PM2
echo "🚀 Запускаем приложение через PM2..."
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# Настраиваем Nginx
echo "🌐 Настраиваем Nginx..."
sudo cp nginx.conf /etc/nginx/sites-available/bingo-admin
sudo ln -sf /etc/nginx/sites-available/bingo-admin /etc/nginx/sites-enabled/

# Проверяем конфигурацию Nginx
sudo nginx -t

# Перезапускаем Nginx
sudo systemctl reload nginx

echo "✅ Настройка сервера завершена!"
echo ""
echo "📋 Следующие шаги:"
echo "1. Убедитесь, что домен fqxgmrzplndwsyvkeu.ru указывает на IP сервера"
echo "2. Получите SSL сертификат: sudo certbot --nginx -d fqxgmrzplndwsyvkeu.ru"
echo "3. После получения сертификата раскомментируйте HTTPS секцию в nginx.conf"
echo "4. Перезапустите Nginx: sudo systemctl reload nginx"

