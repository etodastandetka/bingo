# PM2 Ecosystem Configuration

Файл `ecosystem.config.js` содержит конфигурацию для всех процессов, которые должны быть запущены через PM2.

## Список процессов

1. **bingo-admin** - Админ-панель (Next.js)
2. **bingo-bot** - Основной Telegram бот
3. **bingo-bot-1xbet** - Telegram бот для 1xbet
4. **bingo-bot-mostbet** - Telegram бот для Mostbet
5. **bingo-payment** - Сайт оплаты (Flask/Gunicorn)
6. **bingo-operator-bot** - Операторский бот для чатов
7. **bingo-email-watcher** - Email watcher для автопополнения
8. **admin-bot** - Админ-бот для управления PM2 процессами

## Установка и запуск

### Первый запуск

```bash
# Перейдите в корневую директорию проекта
cd /var/www/bingo_bot

# Убедитесь, что директория logs существует
mkdir -p logs

# Запустите все процессы из ecosystem.config.js
pm2 start ecosystem.config.js

# Сохраните конфигурацию PM2 для автозапуска
pm2 save
pm2 startup
```

### Запуск отдельных процессов

```bash
# Запустить только админ-панель
pm2 start ecosystem.config.js --only bingo-admin

# Запустить только боты
pm2 start ecosystem.config.js --only bingo-bot,bingo-bot-1xbet,bingo-bot-mostbet

# Запустить все, кроме админ-бота
pm2 start ecosystem.config.js --ignore admin-bot
```

### Перезапуск всех процессов

```bash
# Перезапустить все процессы
pm2 restart ecosystem.config.js

# Или перезапустить все процессы через ecosystem
pm2 restart all
```

### Остановка всех процессов

```bash
# Остановить все процессы
pm2 stop ecosystem.config.js

# Или остановить все процессы
pm2 stop all
```

### Удаление всех процессов

```bash
# Удалить все процессы из PM2
pm2 delete ecosystem.config.js

# Или удалить все процессы
pm2 delete all
```

## Настройка admin-bot с виртуальным окружением

Если у вас есть виртуальное окружение для `admin-bot`, обновите путь к интерпретатору в `ecosystem.config.js`:

```javascript
{
  name: 'admin-bot',
  cwd: './admin_bot',
  script: 'bot.py',
  interpreter: '/var/www/bingo_bot/admin_bot/venv/bin/python3', // Укажите полный путь
  // ...
}
```

## Логи

Все логи сохраняются в директории `./logs/`:

- `admin-error.log` / `admin-out.log` - логи админ-панели
- `bot-error.log` / `bot-out.log` - логи основного бота
- `bot-1xbet-error.log` / `bot-1xbet-out.log` - логи бота 1xbet
- `bot-mostbet-error.log` / `bot-mostbet-out.log` - логи бота Mostbet
- `payment-error.log` / `payment-out.log` - логи сайта оплаты
- `operator-bot-error.log` / `operator-bot-out.log` - логи операторского бота
- `email-watcher-error.log` / `email-watcher-out.log` - логи email watcher
- `admin-bot-error.log` / `admin-bot-out.log` - логи админ-бота

Просмотр логов:

```bash
# Просмотр логов конкретного процесса
pm2 logs bingo-admin

# Просмотр последних 100 строк
pm2 logs bingo-admin --lines 100

# Просмотр всех логов
pm2 logs
```

## Мониторинг

```bash
# Статус всех процессов
pm2 status

# Детальная информация о процессе
pm2 describe bingo-admin

# Мониторинг в реальном времени
pm2 monit
```

## Восстановление после сбоя

Если все процессы PM2 были удалены:

```bash
# 1. Перейдите в корневую директорию проекта
cd /var/www/bingo_bot

# 2. Убедитесь, что ecosystem.config.js существует
ls -la ecosystem.config.js

# 3. Запустите все процессы
pm2 start ecosystem.config.js

# 4. Проверьте статус
pm2 status

# 5. Сохраните конфигурацию для автозапуска
pm2 save
```

## Важные замечания

1. **bingo-admin** и **admin-bot** НЕ должны останавливаться через админ-бот, так как они нужны для работы API управления PM2.

2. Все процессы настроены на автоматический перезапуск при сбое (`autorestart: true`).

3. Лимиты памяти:
   - Админ-панель: 500M
   - Боты: 300M
   - Сайт оплаты: 500M
   - Email watcher: 300M
   - Админ-бот: 200M

4. Убедитесь, что все необходимые переменные окружения установлены в `.env` файлах соответствующих директорий.

