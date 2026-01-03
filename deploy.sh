#!/bin/bash

# Скрипт автоматического развертывания Bingo Bot на сервере
# Использование: ./deploy.sh

set -e  # Остановка при ошибке

echo "🚀 Начало развертывания Bingo Bot..."

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Проверка, что скрипт запущен на сервере
if [ ! -f "/etc/os-release" ]; then
    echo -e "${RED}Ошибка: Этот скрипт должен запускаться на Linux сервере${NC}"
    exit 1
fi

# Определение дистрибутива
if [ -f /etc/debian_version ]; then
    OS="debian"
elif [ -f /etc/redhat-release ]; then
    OS="redhat"
else
    echo -e "${RED}Ошибка: Неподдерживаемый дистрибутив${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Обнаружен $OS дистрибутив${NC}"

# Функция для проверки команды
check_command() {
    if command -v $1 &> /dev/null; then
        echo -e "${GREEN}✓ $1 установлен${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠ $1 не установлен${NC}"
        return 1
    fi
}

# Проверка установленных компонентов
echo ""
echo "📦 Проверка установленных компонентов..."

check_command node || NEED_NODE=true
check_command python3 || NEED_PYTHON=true
check_command pm2 || NEED_PM2=true
check_command nginx || NEED_NGINX=true
check_command git || NEED_GIT=true

# Установка Node.js
if [ "$NEED_NODE" = true ]; then
    echo -e "${YELLOW}📥 Установка Node.js...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt install -y nodejs
fi

# Установка Python
if [ "$NEED_PYTHON" = true ]; then
    echo -e "${YELLOW}📥 Установка Python 3...${NC}"
    sudo apt update
    sudo apt install -y python3 python3-pip python3-venv
fi

# Установка PM2
if [ "$NEED_PM2" = true ]; then
    echo -e "${YELLOW}📥 Установка PM2...${NC}"
    sudo npm install -g pm2
fi

# Установка Nginx
if [ "$NEED_NGINX" = true ]; then
    echo -e "${YELLOW}📥 Установка Nginx...${NC}"
    sudo apt install -y nginx
fi

# Установка Git
if [ "$NEED_GIT" = true ]; then
    echo -e "${YELLOW}📥 Установка Git...${NC}"
    sudo apt install -y git
fi

# Установка PostgreSQL клиента
if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}📥 Установка PostgreSQL клиента...${NC}"
    sudo apt install -y postgresql-client
fi

echo ""
echo -e "${GREEN}✓ Все системные зависимости установлены${NC}"

# Проверка проекта
PROJECT_DIR="$HOME/projects/bingo_bot"
if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "${YELLOW}⚠ Проект не найден в $PROJECT_DIR${NC}"
    echo "Создайте директорию и скопируйте проект туда"
    exit 1
fi

cd "$PROJECT_DIR"

# Настройка Admin Panel
echo ""
echo "🔧 Настройка Admin Panel..."
cd admin

if [ ! -d "node_modules" ]; then
    echo "📦 Установка зависимостей..."
    npm install
fi

if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠ Файл .env не найден. Создайте его вручную!${NC}"
    echo "Пример содержимого:"
    echo "DATABASE_URL=\"postgresql://gen_user:dastan10dz@92.51.38.85:5432/default_db?schema=public\""
    echo "JWT_SECRET=\"your-secret-key\""
    echo "NODE_ENV=\"production\""
else
    echo -e "${GREEN}✓ .env файл найден${NC}"
fi

echo "🔨 Генерация Prisma Client..."
npm run db:generate

echo "🏗️ Сборка проекта..."
npm run build

echo -e "${GREEN}✓ Admin Panel настроен${NC}"

# Настройка Telegram Bot
echo ""
echo "🤖 Настройка Telegram Bot..."
cd ../telegram_bot

if [ ! -d "venv" ]; then
    echo "📦 Создание виртуального окружения..."
    python3 -m venv venv
fi

echo "📦 Установка зависимостей..."
source venv/bin/activate
pip install -r requirements.txt
deactivate

if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠ Файл .env не найден. Создайте его вручную!${NC}"
    echo "Пример содержимого:"
    echo "BOT_TOKEN=your_bot_token"
    echo "API_BASE_URL=https://fqxgmrzplndwsyvkeu.ru/api"
    echo "PAYMENT_SITE_URL=https://gldwueprxkmbtqsnva.ru"
else
    echo -e "${GREEN}✓ .env файл найден${NC}"
fi

echo -e "${GREEN}✓ Telegram Bot настроен${NC}"

# Настройка Payment Site
echo ""
echo "💳 Настройка Payment Site..."
cd ../payment_site

if [ ! -d "venv" ]; then
    echo "📦 Создание виртуального окружения..."
    python3 -m venv venv
fi

echo "📦 Установка зависимостей..."
source venv/bin/activate
pip install -r requirements.txt
pip install gunicorn 2>/dev/null || true
deactivate

echo -e "${GREEN}✓ Payment Site настроен${NC}"

# Управление процессами PM2
echo ""
echo "🔄 Настройка PM2..."

cd "$PROJECT_DIR"

# Проверка существования ecosystem.config.js
if [ -f "ecosystem.config.js" ]; then
    echo "📋 Использование ecosystem.config.js"
    pm2 delete ecosystem.config.js 2>/dev/null || true
    pm2 start ecosystem.config.js
else
    echo "📋 Запуск процессов вручную..."
    
    # Admin Panel
    pm2 delete bingo-admin 2>/dev/null || true
    cd admin
    pm2 start npm --name "bingo-admin" -- start
    cd ..
    
    # Telegram Bot
    pm2 delete bingo-bot 2>/dev/null || true
    cd telegram_bot
    pm2 start bot.py --name "bingo-bot" --interpreter python3
    cd ..
    
    # Payment Site
    pm2 delete bingo-payment 2>/dev/null || true
    cd payment_site
    pm2 start gunicorn --name "bingo-payment" -- -w 4 -b 0.0.0.0:3002 app:app
    cd ..
fi

pm2 save

echo ""
echo -e "${GREEN}✅ Развертывание завершено!${NC}"
echo ""
echo "📊 Статус процессов:"
pm2 list
echo ""
echo "📝 Полезные команды:"
echo "  pm2 logs              - Просмотр всех логов"
echo "  pm2 restart all       - Перезапуск всех процессов"
echo "  pm2 monit             - Мониторинг в реальном времени"
echo ""
echo -e "${YELLOW}⚠ Не забудьте:${NC}"
echo "  1. Настроить Nginx (см. SERVER_SETUP.md)"
echo "  2. Настроить SSL сертификаты"
echo "  3. Настроить файрвол"
echo "  4. Создать первого администратора: cd admin && npm run create-admin"









