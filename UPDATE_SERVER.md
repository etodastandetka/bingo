# Инструкция по обновлению на сервере

## Что было изменено:
- ✅ Добавлена настройка канала в админке
- ✅ Добавлена проверка подписки на канал в боте
- ✅ Форма оплаты синхронизирована с настройками API
- ✅ Все компоненты работают через единый API

## Команды для выполнения на сервере:

### 1. Обновить админку (Next.js)

```bash
# ВАЖНО: Перейти в директорию админки (не в корень!)
# На сервере может быть admin_nextjs вместо admin
cd /var/www/bingo/admin_nextjs  # или /var/www/bingo/admin

# Проверить что мы в правильной директории
pwd  # Должно быть /var/www/bingo/admin_nextjs или /var/www/bingo/admin
ls package.json  # Должен существовать

# Обновить код из репозитория
# Если возникла ошибка divergent branches, используйте один из вариантов ниже:
git pull origin chore-update-admin-15325 --no-rebase
# или
git pull origin chore-update-admin-15325 --rebase

# Сгенерировать Prisma клиент (если нужно)
npx prisma generate

# Пересобрать проект (ВАЖНО: это может занять время)
npm run build

# Проверить что build успешен
ls .next/static  # Должна существовать директория

# КРИТИЧНО: Скопировать статические файлы в standalone
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
cp -r .next/BUILD_ID .next/standalone/.next/BUILD_ID 2>/dev/null || true

# Копируем public папку если есть
if [ -d "public" ]; then
  cp -r public .next/standalone/public
fi

# Перезапустить PM2 процесс
pm2 restart bingo-admin

# Проверить статус
pm2 status
pm2 logs bingo-admin --lines 50
```

### 2. Обновить бота (Python)

```bash
# Перейти в директорию бота
cd /var/www/bingo/telegram_bot

# Обновить код
git pull origin chore-update-admin-15325

# Установить зависимости (если нужно)
pip install -r requirements.txt

# Перезапустить бота через PM2
pm2 restart bingo-bot

# Если бот остановлен (stopped), запустить:
pm2 start bingo-bot

# Или если используется systemd:
sudo systemctl restart bingo-bot
sudo systemctl status bingo-bot

# Проверить статус
pm2 status
pm2 logs bingo-bot --lines 50
```

### 3. Обновить форму оплаты (Flask) - опционально

```bash
# Перейти в директорию формы оплаты
cd /var/www/bingo/payment_site

# Обновить код
git pull origin chore-update-admin-15325

# Установить зависимости (если нужно)
pip install -r requirements.txt

# Перезапустить (если используется systemd/PM2)
sudo systemctl restart payment-site
# или
pm2 restart payment-site
```

## Проверка работы:

### 1. Проверить админку:
```bash
# Проверить API настроек
curl http://127.0.0.1:3002/api/public/payment-settings

# Должен вернуть JSON с полями:
# - deposits (enabled, banks)
# - withdrawals (enabled, banks)
# - casinos
# - pause
# - maintenance_message
# - require_receipt_photo
# - channel (НОВОЕ!)
```

### 2. Проверить бота:
```bash
# Отправить /start боту и проверить:
# - Если канал настроен, должна быть проверка подписки
# - Если не подписан, должна появиться кнопка подписки
# - После подписки должен показаться главное меню
```

### 3. Проверить форму оплаты:
```bash
# Открыть форму оплаты через бота
# Проверить что:
# - Банки фильтруются по настройкам из админки
# - Фото чека обязательное только если require_receipt_photo = true
```

## Быстрый вариант (если все уже настроено):

```bash
# Админка (ВАЖНО: сначала перейти в директорию!)
cd /var/www/bingo/admin && \
git pull origin chore-update-admin-15325 && \
npm run build && \
ls .next/static && \  # Проверить что build успешен
mkdir -p .next/standalone/.next && \
cp -r .next/static .next/standalone/.next/static && \
cp -r .next/BUILD_ID .next/standalone/.next/BUILD_ID 2>/dev/null || true && \
pm2 restart bingo-admin

# Бот
cd /var/www/bingo/telegram_bot && \
git pull origin chore-update-admin-15325 && \
pm2 restart bingo-bot || pm2 start bingo-bot
```

## Исправление проблем (если возникли ошибки):

### Проблема: git pull - fatal: Need to specify how to reconcile divergent branches
**Причина:** Локальная и удаленная ветки разошлись  
**Решение:**
```bash
# Вариант 1: Сделать merge (рекомендуется)
git pull origin chore-update-admin-15325 --no-rebase

# Вариант 2: Сделать rebase
git pull origin chore-update-admin-15325 --rebase

# Вариант 3: Принудительно обновить с удаленной ветки (ОСТОРОЖНО: потеряете локальные изменения!)
git fetch origin
git reset --hard origin/chore-update-admin-15325

# Вариант 4: Настроить поведение по умолчанию
git config pull.rebase false  # для merge
# или
git config pull.rebase true   # для rebase
# затем просто
git pull origin chore-update-admin-15325
```

### Проблема: fatal: unable to auto-detect email address / Committer identity unknown
**Причина:** Git не знает кто делает коммиты  
**Решение:**
```bash
# Настроить git user (глобально для всех репозиториев)
git config --global user.email "admin@bingo.kg"
git config --global user.name "Bingo Admin"

# Или только для текущего репозитория
cd /var/www/bingo/admin_nextjs
git config user.email "admin@bingo.kg"
git config user.name "Bingo Admin"

# Проверить настройки
git config --list

# После настройки повторить pull
git pull origin chore-update-admin-15325 --no-rebase
```

### Проблема: npm error ENOENT package.json
**Причина:** Команда запущена не в той директории  
**Решение:**
```bash
# Убедиться что вы в правильной директории
# На сервере может быть admin_nextjs вместо admin
cd /var/www/bingo/admin_nextjs  # или /var/www/bingo/admin
pwd  # Проверить текущую директорию
ls package.json  # Должен существовать
```

### Проблема: cp: cannot stat '.next/static'
**Причина:** Build не выполнен или был прерван (видно ^C в выводе)  
**Решение:**
```bash
# Убедиться что в правильной директории
cd /var/www/bingo/admin_nextjs  # или /var/www/bingo/admin

# Выполнить build заново (НЕ прерывать процесс!)
npm run build

# Дождаться завершения build (может занять несколько минут)
# Должно появиться сообщение "Compiled successfully" или "Build completed"

# Проверить что директория создана
ls .next/static  # Должна существовать

# Если build падает с ошибкой, проверить логи:
npm run build 2>&1 | tee build.log
```

### Проблема: bingo-bot stopped
**Решение:**
```bash
# Запустить бота
pm2 start bingo-bot

# Или если нужно перезапустить
pm2 restart bingo-bot

# Проверить логи
pm2 logs bingo-bot --lines 50
```

## Важные моменты:

1. **После обновления админки** - обязательно проверить что API `/api/public/payment-settings` возвращает поле `channel`
2. **После обновления бота** - проверить что бот может проверить подписку на канал (нужны права бота в канале)
3. **Настройка канала** - зайти в админку → Настройки → указать канал (например: `@bingokg_news`)
4. **Права бота** - бот должен быть администратором канала или иметь права на проверку участников

## Если что-то не работает:

```bash
# Проверить логи админки
pm2 logs bingo-admin --lines 100

# Проверить логи бота
pm2 logs bingo-bot --lines 100
# или
journalctl -u bingo-bot -n 100

# Проверить что API доступен
curl http://127.0.0.1:3002/api/public/payment-settings | jq
```

