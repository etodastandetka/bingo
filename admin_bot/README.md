# Админ-бот для управления PM2

Отдельный Telegram бот для управления PM2 процессами на сервере.

## Установка

1. Установите зависимости:
```bash
pip install -r requirements.txt
```

2. Добавьте в `admin/.env`:
```env
ADMIN_BOT_TOKEN=ваш_токен_бота
ADMIN_IDS=123456789,987654321
API_BASE_URL=http://localhost:3001/api
```

## Запуск

```bash
python bot.py
```

## Функционал

- `/start` - показывает 2 сообщения с кнопками:
  - 🛑 Отключить ботов (pm2 stop all)
  - ▶️ Включить ботов (pm2 restart all)

## Настройка PM2

Добавьте в `ecosystem.config.js`:

```javascript
{
  name: 'admin-bot',
  script: 'bot.py',
  cwd: '/path/to/admin_bot',
  interpreter: 'python3',
  autorestart: true,
  watch: false,
  max_memory_restart: '200M'
}
```

