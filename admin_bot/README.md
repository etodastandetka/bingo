# Админ-бот для управления PM2

Отдельный Telegram бот для управления PM2 процессами на сервере.

## Установка

1. Создайте виртуальное окружение (обязательно для систем с PEP 668):
```bash
cd admin_bot
python3 -m venv venv
source venv/bin/activate  # Для Linux/Mac
# или
venv\Scripts\activate  # Для Windows
```

2. Установите зависимости:
```bash
pip install -r requirements.txt
```

3. Добавьте в `admin/.env`:
```env
ADMIN_BOT_TOKEN=ваш_токен_бота
ADMIN_IDS=123456789,987654321
API_BASE_URL=http://localhost:3001/api
```

## Запуск

### Ручной запуск:
```bash
# Активируйте виртуальное окружение
source venv/bin/activate  # Linux/Mac
# или
venv\Scripts\activate  # Windows

# Запустите бота
python bot.py
```

### Запуск через PM2:

**Вариант 1: Через команду (без ecosystem.config.js):**

```bash
cd /var/www/bingo_bot/admin_bot
pm2 start venv/bin/python3 --name admin-bot -- bot.py
```

Или с полным путем:
```bash
pm2 start /var/www/bingo_bot/admin_bot/venv/bin/python3 --name admin-bot -- /var/www/bingo_bot/admin_bot/bot.py
```

**Вариант 2: Через ecosystem.config.js:**

Добавьте в `ecosystem.config.js`:

```javascript
{
  name: 'admin-bot',
  script: 'bot.py',
  cwd: '/var/www/bingo_bot/admin_bot',
  interpreter: '/var/www/bingo_bot/admin_bot/venv/bin/python3',
  autorestart: true,
  watch: false,
  max_memory_restart: '200M',
  env: {
    NODE_ENV: 'production'
  }
}
```

Затем запустите:
```bash
pm2 start ecosystem.config.js --only admin-bot
```

## Функционал

- `/start` - показывает 2 сообщения с кнопками:
  - 🛑 Отключить ботов (останавливает все боты кроме админ-бота)
  - ▶️ Включить ботов (перезапускает все боты кроме админ-бота)

**Важно:** Админ-бот всегда остается активным, даже при остановке всех остальных ботов, чтобы можно было включить их обратно.

## Управляемые процессы

Админ-бот управляет следующими процессами (исключая себя):
- bingo-admin
- bingo-bot
- bingo-bot-1xbet
- bingo-bot-mostbet
- bingo-email-watcher
- bingo-operator-bot
- bingo-payment

