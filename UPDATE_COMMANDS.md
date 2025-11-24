# Команды для обновления проектов на сервере

## 1. Обновление админки (Next.js)

```bash
# Перейти в директорию админки
cd /var/www/bingo/admin

# Обновить код из репозитория
git pull origin main

# Установить зависимости (если нужно)
npm install

# Сгенерировать Prisma client
npx prisma generate

# Собрать проект
npm run build

# Скопировать статические файлы для standalone
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
cp -r .next/BUILD_ID .next/standalone/.next/BUILD_ID 2>/dev/null || true
if [ -d "public" ]; then
  cp -r public .next/standalone/public
fi

# Перезапустить через PM2
pm2 restart bingo-admin

# Проверить статус
pm2 status bingo-admin
pm2 logs bingo-admin --lines 20
```

## 2. Обновление Telegram бота (Python)

```bash
# Перейти в директорию бота
cd /var/www/bingo/telegram_bot

# Обновить код из репозитория
git pull origin main

# Активировать виртуальное окружение
source .venv/bin/activate

# Установить зависимости (если нужно)
pip install -r requirements.txt

# Перезапустить через PM2
pm2 restart bingo-bot

# Проверить статус
pm2 status bingo-bot
pm2 logs bingo-bot --lines 20
```

## 3. Обновление формы оплаты (Flask)

```bash
# Перейти в директорию формы оплаты
cd /var/www/bingo/payment_site

# Обновить код из репозитория
git pull origin main

# Активировать виртуальное окружение
source .venv/bin/activate

# Установить зависимости (если нужно)
pip install -r requirements.txt

# Перезапустить через PM2
pm2 restart bingo-payment

# Проверить статус
pm2 status bingo-payment
pm2 logs bingo-payment --lines 20
```

## 4. Обновление всех проектов одной командой

```bash
# Админка
cd /var/www/bingo/admin && \
git pull origin main && \
npm install && \
npx prisma generate && \
npm run build && \
mkdir -p .next/standalone/.next && \
cp -r .next/static .next/standalone/.next/static && \
cp -r .next/BUILD_ID .next/standalone/.next/BUILD_ID 2>/dev/null || true && \
[ -d "public" ] && cp -r public .next/standalone/public || true && \
pm2 restart bingo-admin

# Бот
cd /var/www/bingo/telegram_bot && \
git pull origin main && \
source .venv/bin/activate && \
pip install -r requirements.txt && \
pm2 restart bingo-bot

# Форма оплаты
cd /var/www/bingo/payment_site && \
git pull origin main && \
source .venv/bin/activate && \
pip install -r requirements.txt && \
pm2 restart bingo-payment

# Проверить статус всех
pm2 status
```

## 5. Быстрое обновление (только git pull + перезапуск)

Если зависимости не изменились, можно просто обновить код и перезапустить:

```bash
# Админка
cd /var/www/bingo/admin && git pull origin main && npm run build && pm2 restart bingo-admin

# Бот
cd /var/www/bingo/telegram_bot && git pull origin main && pm2 restart bingo-bot

# Форма оплаты
cd /var/www/bingo/payment_site && git pull origin main && pm2 restart bingo-payment
```

## 6. Проверка после обновления

```bash
# Проверить статус всех процессов
pm2 status

# Проверить логи всех процессов
pm2 logs --lines 50

# Проверить конкретный процесс
pm2 logs bingo-admin --lines 50
pm2 logs bingo-bot --lines 50
pm2 logs bingo-payment --lines 50

# Проверить API админки
curl http://127.0.0.1:3002/api/public/payment-settings

# Проверить переменные окружения
pm2 env bingo-admin | grep DATABASE_URL
```

## 7. Если возникли проблемы

### Если git pull не работает (divergent branches):
```bash
cd /var/www/bingo/admin  # или telegram_bot, payment_site
git fetch origin
git reset --hard origin/main
```

### Если сборка админки не работает:
```bash
cd /var/www/bingo/admin
rm -rf .next node_modules
npm install
npx prisma generate
npm run build
```

### Если PM2 не видит изменения:
```bash
pm2 delete bingo-admin
cd /var/www/bingo/admin
pm2 start "NODE_ENV=production PORT=3002 node .next/standalone/server.js" --name bingo-admin
pm2 save
```

