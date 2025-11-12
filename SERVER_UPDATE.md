# Команды для обновления на сервере

## Полная последовательность команд

```bash
# 1. Перейти в директорию проекта
cd /var/www/bingo

# 2. Обновить основной репозиторий
git pull origin main

# 3. Обновить submodule admin_nextjs
cd admin_nextjs
git pull origin main
cd ..

# 4. Вернуться в admin_nextjs и установить зависимости
cd admin_nextjs

# 5. Установить зависимости (если нужно)
npm install

# 6. Сгенерировать Prisma клиент
npx prisma generate

# 7. Пересобрать проект
npm run build

# 8. Остановить текущий PM2 процесс
pm2 stop bingo-admin

# 9. Запустить новый процесс
pm2 start "NODE_ENV=production PORT=3002 node .next/standalone/server.js" --name bingo-admin

# 10. Сохранить конфигурацию PM2
pm2 save

# 11. Проверить статус
pm2 status
pm2 logs bingo-admin --lines 50
```

## Быстрый вариант (если зависимости уже установлены)

```bash
cd /var/www/bingo/admin_nextjs
git pull origin main
npx prisma generate
npm run build
pm2 restart bingo-admin
```

## Проверка работы

```bash
# Проверить что приложение работает
curl http://127.0.0.1:3002/api/public/payment-settings

# Проверить логи
pm2 logs bingo-admin --lines 50

# Проверить статус
pm2 status
```

