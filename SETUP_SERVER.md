# Инструкция по настройке сервера

## 1. Создание .env файлов

### admin/.env
```bash
cd /var/www/bingo/admin
nano .env
```

Содержимое файла:
```env
DATABASE_URL="postgresql://gen_user:dastan10dz@92.51.38.85:5432/default_db?schema=public"
JWT_SECRET="your-secret-key-change-in-production-min-32-chars"
BOT_TOKEN="your-telegram-bot-token-here"
NODE_ENV="production"
```

**ВАЖНО:** Замените значения на реальные:
- `DATABASE_URL` - ваша строка подключения к PostgreSQL
- `JWT_SECRET` - случайная строка минимум 32 символа (для безопасности)
- `BOT_TOKEN` - токен Telegram бота (если нужен для уведомлений)

### telegram_bot/.env
```bash
cd /var/www/bingo/telegram_bot
nano .env
```

Содержимое файла:
```env
BOT_TOKEN="your-telegram-bot-token-here"
API_BASE_URL="https://fqxgmrzplndwsyvkeu.ru/api"
PAYMENT_SITE_URL="https://gldwueprxkmbtqsnva.ru"
```

### payment_site/.env (опционально)
```bash
cd /var/www/bingo/payment_site
nano .env
```

Содержимое файла:
```env
API_BASE_URL="https://fqxgmrzplndwsyvkeu.ru/api"
FLASK_ENV="production"
PORT="3003"
```

## 2. Установка и сборка админки

```bash
cd /var/www/bingo/admin

# 1. Установить зависимости
npm install

# 2. Сгенерировать Prisma client (ВАЖНО: после создания .env!)
npx prisma generate

# 3. Выполнить build
npm run build

# 4. Скопировать статические файлы
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
cp -r .next/BUILD_ID .next/standalone/.next/BUILD_ID 2>/dev/null || true
if [ -d "public" ]; then
  cp -r public .next/standalone/public
fi
```

## 3. Запуск через PM2 с переменными окружения

### Админка (Next.js)
```bash
cd /var/www/bingo/admin

# Остановить старый процесс
pm2 stop bingo-admin 2>/dev/null || true
pm2 delete bingo-admin 2>/dev/null || true

# Запустить с загрузкой .env файла
pm2 start "NODE_ENV=production PORT=3002 node .next/standalone/server.js" \
  --name bingo-admin \
  --update-env \
  --env admin/.env

# Или использовать ecosystem файл (см. ниже)
pm2 save
```

### Telegram бот
```bash
cd /var/www/bingo/telegram_bot

# Создать виртуальное окружение
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Остановить старый процесс
pm2 stop bingo-bot 2>/dev/null || true
pm2 delete bingo-bot 2>/dev/null || true

# Запустить
pm2 start ".venv/bin/python bot.py" \
  --name bingo-bot \
  --update-env \
  --env telegram_bot/.env
pm2 save
```

### Форма оплаты
```bash
cd /var/www/bingo/payment_site

# Создать виртуальное окружение
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Остановить старый процесс
pm2 stop bingo-payment 2>/dev/null || true
pm2 delete bingo-payment 2>/dev/null || true

# Запустить
pm2 start ".venv/bin/python app.py" \
  --name bingo-payment \
  --update-env \
  --env payment_site/.env
pm2 save
```

## 4. Альтернатива: PM2 Ecosystem файл

Создайте файл `ecosystem.config.js` в корне проекта:

```bash
cd /var/www/bingo
nano ecosystem.config.js
```

Содержимое:
```javascript
module.exports = {
  apps: [
    {
      name: 'bingo-admin',
      script: 'node .next/standalone/server.js',
      cwd: '/var/www/bingo/admin',
      env_file: '/var/www/bingo/admin/.env',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      }
    },
    {
      name: 'bingo-bot',
      script: 'bot.py',
      cwd: '/var/www/bingo/telegram_bot',
      interpreter: '.venv/bin/python',
      env_file: '/var/www/bingo/telegram_bot/.env'
    },
    {
      name: 'bingo-payment',
      script: 'app.py',
      cwd: '/var/www/bingo/payment_site',
      interpreter: '.venv/bin/python',
      env_file: '/var/www/bingo/payment_site/.env',
      env: {
        PORT: 3003
      }
    }
  ]
};
```

Запуск:
```bash
pm2 start ecosystem.config.js
pm2 save
```

## 5. Проверка работы

```bash
# Проверить статус
pm2 status

# Проверить логи
pm2 logs bingo-admin --lines 50
pm2 logs bingo-bot --lines 50
pm2 logs bingo-payment --lines 50

# Проверить переменные окружения
pm2 env bingo-admin | grep DATABASE_URL

# Проверить API
curl http://127.0.0.1:3002/api/public/payment-settings
```

## 6. Если DATABASE_URL все еще не находится

### Вариант 1: Использовать dotenv в коде
Убедитесь что в `admin/lib/prisma.ts` или где используется Prisma, загружается .env:

```typescript
import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'

dotenv.config({ path: '.env' })

export const prisma = new PrismaClient()
```

### Вариант 2: Загрузить переменные вручную в PM2
```bash
pm2 stop bingo-admin
pm2 delete bingo-admin

# Загрузить переменные из .env
export $(cat /var/www/bingo/admin/.env | xargs)
pm2 start "NODE_ENV=production PORT=3002 node .next/standalone/server.js" --name bingo-admin
pm2 save
```

### Вариант 3: Использовать --env-file (PM2 5.0+)
```bash
pm2 start "NODE_ENV=production PORT=3002 node .next/standalone/server.js" \
  --name bingo-admin \
  --env-file /var/www/bingo/admin/.env
pm2 save
```

## 7. Создание первого администратора

После настройки .env и запуска админки:

```bash
cd /var/www/bingo/admin
npx tsx scripts/create-admin.ts
```

Или с переменными:
```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD=admin123 ADMIN_EMAIL=admin@bingo.com npx tsx scripts/create-admin.ts
```

