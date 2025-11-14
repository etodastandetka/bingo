# Исправление проблемы зависания админки

## Проблема
Сайт висит на загрузке после обновления и перезапуска PM2.

## Причина
В `next.config.js` отсутствовала настройка `output: 'standalone'`, которая необходима для работы с PM2.

## Решение

### 1. На сервере выполните:

```bash
cd /var/www/bingo/admin_nextjs

# Обновить код
git pull origin chore-update-admin-15325

# Установить зависимости (если нужно)
npm install

# Сгенерировать Prisma клиент
npx prisma generate

# Пересобрать проект (ВАЖНО: с новым next.config.js)
npm run build

# КРИТИЧНО: Скопировать статические файлы в standalone (иначе 404 на CSS/JS)
# Создаем директорию .next внутри standalone если её нет
mkdir -p .next/standalone/.next

# Копируем статические файлы
cp -r .next/static .next/standalone/.next/static
cp -r .next/BUILD_ID .next/standalone/.next/BUILD_ID 2>/dev/null || true

# Копируем public папку если есть
if [ -d "public" ]; then
  cp -r public .next/standalone/public
fi

# Остановить PM2
pm2 stop bingo-admin

# Удалить старый процесс если есть дубликаты
pm2 delete bingo-admin 2>/dev/null || true

# Запустить заново (из корня проекта, но указываем путь к standalone)
pm2 start "NODE_ENV=production PORT=3002 node .next/standalone/server.js" --name bingo-admin

# Сохранить конфигурацию
pm2 save

# Проверить логи
pm2 logs bingo-admin --lines 50
```

### 2. Проверка работы:

```bash
# Проверить статус
pm2 status

# Проверить что API отвечает
curl http://127.0.0.1:3002/api/public/payment-settings

# Проверить логи на ошибки
pm2 logs bingo-admin --lines 100 | grep -i error
```

### 3. Если проблема сохраняется:

1. Проверьте подключение к базе данных:
   ```bash
   # Проверить переменные окружения
   pm2 env bingo-admin | grep DATABASE_URL
   ```

2. Проверьте, что порт 3002 свободен:
   ```bash
   netstat -tulpn | grep 3002
   ```

3. Проверьте логи на ошибки подключения к БД:
   ```bash
   pm2 logs bingo-admin --lines 200 | grep -i "prisma\|database\|connection"
   ```

## Что было исправлено:

1. ✅ Добавлен `output: 'standalone'` в `next.config.js`
2. ✅ Проверен middleware.ts (работает корректно)
3. ✅ Проверены API endpoints

## Важно:

После обновления `next.config.js` **обязательно** нужно пересобрать проект (`npm run build`), иначе изменения не применятся!

