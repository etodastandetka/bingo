# Миграция Casino Limits

## Проблема с Prisma Migrate

Если при выполнении `npx prisma migrate dev` возникает ошибка:
```
Error: P3014: Prisma Migrate could not create the shadow database
```

Это означает, что у пользователя БД нет прав на создание баз данных.

## Решение 1: Применить SQL миграцию напрямую

```bash
# Вариант 1: Через psql с DATABASE_URL
psql "$DATABASE_URL" -f migrations/add_casino_limits.sql

# Вариант 2: Через psql с явными параметрами
psql -h 92.51.38.85 -p 5432 -U your_user -d default_db -f migrations/add_casino_limits.sql

# Вариант 3: Использовать скрипт
chmod +x migrations/apply_casino_limits.sh
./migrations/apply_casino_limits.sh
```

## Решение 2: Использовать prisma migrate deploy (для продакшена)

```bash
npx prisma migrate deploy
```

Этот метод не требует shadow database, но требует, чтобы миграция была уже создана.

## Решение 3: Создать миграцию вручную

Если нужно использовать `prisma migrate dev`, можно создать миграцию вручную:

```bash
# Создать папку для миграции
mkdir -p prisma/migrations/$(date +%Y%m%d%H%M%S)_add_casino_limits

# Скопировать SQL в migration.sql
cp migrations/add_casino_limits.sql prisma/migrations/$(date +%Y%m%d%H%M%S)_add_casino_limits/migration.sql

# Затем применить через deploy
npx prisma migrate deploy
```

## Проверка

После применения миграции проверьте:

```sql
-- Проверить наличие таблиц
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('casino_limits', 'casino_limit_logs');

-- Проверить структуру таблиц
\d casino_limits
\d casino_limit_logs
```

