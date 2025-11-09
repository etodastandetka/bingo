# Исправление проблем с ботом и формой оплаты

## Проблема 1: TelegramUnauthorizedError (бот)

Ошибка означает, что BOT_TOKEN неверный или не загружается из .env файла.

### Решение:

```bash
# 1. Проверьте что .env файл существует
cat /var/www/bingo/telegram_bot/.env

# 2. Убедитесь что токен правильный (должен начинаться с цифр и двоеточия)
# Пример: 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz

# 3. Если файла нет или токен неверный, создайте/отредактируйте:
cd /var/www/bingo/telegram_bot
nano .env
```

Содержимое `.env`:
```env
BOT_TOKEN=ваш_реальный_токен_здесь
API_BASE_URL=https://fqxgmrzplndwsyvkeu.ru/api
PAYMENT_SITE_URL=https://gldwueprxkmbtqsnva.ru
```

**Важно**: Замените `ваш_реальный_токен_здесь` на реальный токен из @BotFather!

## Проблема 2: Форма оплаты (SyntaxError с python)

PM2 пытается запустить бинарник python как скрипт.

### Решение:

Конфиг уже исправлен в репозитории. Обновите:

```bash
cd /var/www/bingo
git pull origin main

# Удалите старый процесс
pm2 delete bingo-payment

# Перезапустите с новым конфигом
pm2 start ecosystem.server.config.js

# Или перезапустите все
pm2 restart all
```

## Проверка после исправления:

```bash
# Проверьте логи бота
pm2 logs bingo-bot --lines 20

# Должно быть:
# "Бот запущен!"
# "Start polling"
# Без ошибок "Unauthorized"

# Проверьте логи формы оплаты
pm2 logs bingo-payment --lines 10

# Не должно быть ошибок "SyntaxError"
```

## Если токен не работает:

1. Проверьте токен в @BotFather: `/mybots` → выберите бота → API Token
2. Убедитесь что токен скопирован полностью (без пробелов)
3. Перезапустите бота: `pm2 restart bingo-bot`

