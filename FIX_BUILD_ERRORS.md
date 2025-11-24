# Исправление ошибок сборки

## Ошибка: "Cannot find module 'tailwindcss'"

Эта ошибка возникает когда на сервере не установлены зависимости Node.js.

### Решение:

```bash
cd /var/www/bingo/admin

# 1. Удалить старые зависимости и lock файл
rm -rf node_modules package-lock.json

# 2. Установить все зависимости заново (включая devDependencies)
npm install

# 3. Проверить что tailwindcss установлен
npm list tailwindcss

# 4. Если tailwindcss не найден, установить явно
npm install tailwindcss@3.4.10 --save-dev

# 5. Сгенерировать Prisma client
npx prisma generate

# 6. Собрать проект
npm run build

# 7. Скопировать статические файлы
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
cp -r .next/BUILD_ID .next/standalone/.next/BUILD_ID 2>/dev/null || true
[ -d "public" ] && cp -r public .next/standalone/public || true

# 8. Перезапустить PM2
pm2 restart bingo-admin
```

## Ошибка: "Module not found: Can't resolve '@/lib/...'"

Эта ошибка уже исправлена в `next.config.js` с добавлением webpack конфигурации.

Если ошибка все еще возникает:

```bash
cd /var/www/bingo/admin

# 1. Обновить код
git pull origin main

# 2. Убедиться что next.config.js содержит webpack конфигурацию
cat next.config.js | grep webpack

# 3. Пересобрать проект
rm -rf .next
npm run build
```

## Ошибка: "Environment variable not found: DATABASE_URL"

Эта ошибка возникает когда не создан `.env` файл.

### Решение:

```bash
cd /var/www/bingo/admin

# Создать .env файл
cat > .env << 'EOF'
DATABASE_URL="postgresql://gen_user:dastan10dz@92.51.38.85:5432/default_db?schema=public"
JWT_SECRET="your-secret-key-change-in-production-min-32-chars"
BOT_TOKEN="your-telegram-bot-token-here"
NODE_ENV="production"
EOF

# Перезапустить PM2 с загрузкой переменных
pm2 restart bingo-admin --update-env
```

## Полная переустановка (если ничего не помогает)

```bash
cd /var/www/bingo/admin

# 1. Остановить PM2
pm2 stop bingo-admin

# 2. Удалить все сгенерированные файлы
rm -rf .next node_modules package-lock.json

# 3. Обновить код
git pull origin main

# 4. Установить зависимости
npm install

# 5. Создать .env если его нет
if [ ! -f .env ]; then
  cat > .env << 'EOF'
DATABASE_URL="postgresql://gen_user:dastan10dz@92.51.38.85:5432/default_db?schema=public"
JWT_SECRET="your-secret-key-change-in-production-min-32-chars"
BOT_TOKEN="your-telegram-bot-token-here"
NODE_ENV="production"
EOF
fi

# 6. Сгенерировать Prisma client
npx prisma generate

# 7. Собрать проект
npm run build

# 8. Скопировать статические файлы
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
cp -r .next/BUILD_ID .next/standalone/.next/BUILD_ID 2>/dev/null || true
[ -d "public" ] && cp -r public .next/standalone/public || true

# 9. Запустить через PM2
pm2 start "NODE_ENV=production PORT=3002 node .next/standalone/server.js" --name bingo-admin --update-env
pm2 save

# 10. Проверить статус
pm2 status
pm2 logs bingo-admin --lines 50
```

