# Инструкция по выполнению миграции bot_type

## Проблема
Колонка `bot_type` не существует в таблице `requests` в базе данных, из-за чего все заявки не открываются.

## Решение: Выполнить SQL миграцию

### Способ 1: Через psql (рекомендуется)

1. Подключитесь к серверу по SSH:
```bash
ssh root@your-server
```

2. Перейдите в папку проекта:
```bash
cd /var/www/bingo_bot
```

3. Выполните SQL команды напрямую через psql:

```bash
# Если у вас есть DATABASE_URL в .env файле админки
cd admin
source .env 2>/dev/null || true

# Или подключитесь напрямую (замените параметры на свои)
psql -h 92.51.38.85 -U ваш_пользователь -d default_db << EOF
ALTER TABLE requests ADD COLUMN IF NOT EXISTS bot_type VARCHAR(20) DEFAULT 'main';
CREATE INDEX IF NOT EXISTS idx_requests_bot_type ON requests(bot_type);
EOF
```

### Способ 2: Через файл миграции

1. На сервере выполните:
```bash
cd /var/www/bingo_bot
psql -h 92.51.38.85 -U ваш_пользователь -d default_db -f admin/prisma/migrations/add_bot_type_to_request.sql
```

### Способ 3: Через Prisma migrate deploy (рекомендуется для продакшн)

```bash
cd /var/www/bingo_bot/admin
npx prisma migrate deploy
```

Эта команда применит все неприменённые миграции из папки `prisma/migrations/`, включая миграцию `20250101120000_add_bot_type_to_request`.

### Способ 3.1: Через Prisma db push (альтернатива)

```bash
cd /var/www/bingo_bot/admin
npx prisma db push
```

Эта команда синхронизирует схему Prisma с базой данных напрямую (без создания миграции).

### Способ 4: Вручную через psql

1. Подключитесь к базе:
```bash
psql -h 92.51.38.85 -U ваш_пользователь -d default_db
```

2. Выполните команды:
```sql
ALTER TABLE requests ADD COLUMN IF NOT EXISTS bot_type VARCHAR(20) DEFAULT 'main';
CREATE INDEX IF NOT EXISTS idx_requests_bot_type ON requests(bot_type);
\q
```

## Проверка

После выполнения миграции проверьте:
```sql
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'requests' AND column_name = 'bot_type';
```

Должна вернуться строка с информацией о колонке `bot_type`.

## После миграции

1. Перезапустите админку:
```bash
cd /var/www/bingo_bot/admin
pm2 restart admin
# или
npm run start
```

2. Проверьте, что заявки открываются в админ-панели.

