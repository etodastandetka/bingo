# Инструкция по деплою и перезапуску BINGO Admin Panel

## Когда нужна сборка?

**Сборка НУЖНА:**
- После изменений в коде (TypeScript/React файлы)
- После обновления зависимостей
- После изменений в конфигурации Next.js
- После `git pull` с изменениями в коде

**Сборка НЕ НУЖНА:**
- Только перезапуск после изменений в `.env`
- Только перезапуск для применения изменений без кода
- Быстрый перезапуск для проверки

## Команды для деплоя

### Полный деплой (с обновлением и сборкой):

```bash
cd /var/www/bingo/admin_nextjs
./deploy.sh
```

Это выполнит:
1. `git pull` - получение обновлений
2. `npm install` - установка зависимостей
3. `npm run db:generate` - генерация Prisma клиента
4. `npm run db:push` - применение изменений БД
5. `npm run build` - сборка приложения
6. `pm2 reload` - перезапуск процессов

### Деплой без сборки (только обновление кода):

```bash
cd /var/www/bingo/admin_nextjs
./deploy.sh --no-build
```

### Деплой без обновления из Git:

```bash
cd /var/www/bingo/admin_nextjs
./deploy.sh --no-pull
```

### Только перезапуск (без сборки и обновлений):

```bash
cd /var/www/bingo/admin_nextjs
./restart.sh
```

Или вручную:

```bash
pm2 restart bingo-admin
pm2 restart bingo-email-watcher
# Или все сразу:
pm2 restart all
```

## Ручной процесс деплоя

### 1. Обновление кода:

```bash
cd /var/www/bingo/admin_nextjs
git pull origin main
```

### 2. Установка зависимостей (если нужно):

```bash
npm install
```

### 3. Генерация Prisma клиента:

```bash
npm run db:generate
```

### 4. Применение изменений БД:

```bash
npm run db:push
```

### 5. Сборка приложения:

```bash
npm run build
```

### 6. Перезапуск PM2:

```bash
pm2 reload ecosystem.config.js --update-env
# Или если процессы не запущены:
pm2 start ecosystem.config.js
```

### 7. Сохранение конфигурации:

```bash
pm2 save
```

## Полезные команды PM2

```bash
# Просмотр статуса
pm2 status

# Просмотр логов
pm2 logs bingo-admin
pm2 logs bingo-email-watcher
pm2 logs bingo-admin --lines 50  # последние 50 строк

# Мониторинг в реальном времени
pm2 monit

# Перезапуск конкретного процесса
pm2 restart bingo-admin
pm2 restart bingo-email-watcher

# Перезапуск всех процессов
pm2 restart all

# Остановка процессов
pm2 stop bingo-admin
pm2 stop all

# Удаление процессов
pm2 delete bingo-admin
pm2 delete all

# Просмотр информации о процессе
pm2 show bingo-admin
```

## Проверка работы

```bash
# Проверяем, что приложение запущено
pm2 status

# Проверяем доступность
curl http://127.0.0.1:3002

# Проверяем логи на ошибки
pm2 logs bingo-admin --lines 20 --err
```

## Типичные сценарии

### Обновление кода с GitHub:

```bash
cd /var/www/bingo/admin_nextjs
./deploy.sh
```

### Изменение переменных окружения (.env):

```bash
# 1. Редактируем .env
nano .env

# 2. Перезапускаем без сборки
./restart.sh
```

### Только перезапуск после сбоя:

```bash
pm2 restart bingo-admin
```

### Полная переустановка (если что-то сломалось):

```bash
cd /var/www/bingo/admin_nextjs
rm -rf node_modules .next
npm install
npm run db:generate
npm run build
pm2 delete bingo-admin bingo-email-watcher
pm2 start ecosystem.config.js
pm2 save
```

