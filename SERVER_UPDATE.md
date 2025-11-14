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

# 8. КРИТИЧНО: Скопировать статические файлы в standalone (иначе 404 на CSS/JS)
# Создаем директорию .next внутри standalone если её нет
mkdir -p .next/standalone/.next

# Копируем статические файлы
cp -r .next/static .next/standalone/.next/static
cp -r .next/BUILD_ID .next/standalone/.next/BUILD_ID 2>/dev/null || true

# Копируем public папку если есть
if [ -d "public" ]; then
  cp -r public .next/standalone/public
fi

# 9. Остановить текущий PM2 процесс
pm2 stop bingo-admin

# 10. Удалить старый процесс если есть дубликаты
pm2 delete bingo-admin 2>/dev/null || true

# 11. Запустить новый процесс (из корня проекта)
pm2 start "NODE_ENV=production PORT=3002 node .next/standalone/server.js" --name bingo-admin

# 12. Сохранить конфигурацию PM2
pm2 save

# 13. Проверить статус
pm2 status
pm2 logs bingo-admin --lines 50
```

## Быстрый вариант (если зависимости уже установлены)

```bash
cd /var/www/bingo/admin_nextjs
git pull origin main
npx prisma generate
npm run build

# КРИТИЧНО: Скопировать статические файлы
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
cp -r .next/BUILD_ID .next/standalone/.next/BUILD_ID 2>/dev/null || true
if [ -d "public" ]; then
  cp -r public .next/standalone/public
fi

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

