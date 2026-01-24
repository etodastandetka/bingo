# Применение миграции Casino Limits

## Способ 1: Через Prisma (рекомендуется)

```bash
cd /var/www/bingo_bot/admin
npx prisma migrate deploy
```

Этот способ не требует shadow database и работает в продакшене.

## Способ 2: Если есть конфликт с локальными изменениями

```bash
cd /var/www/bingo_bot/admin
# Отменить локальные изменения в скрипте (если они не нужны)
git checkout -- migrations/apply_casino_limits.sh

# Или сделать stash
git stash

# Затем pull и deploy
git pull
npx prisma migrate deploy
```

## Способ 3: Прямое применение SQL (если Prisma не работает)

```bash
cd /var/www/bingo_bot/admin
psql "$DATABASE_URL" -f prisma/migrations/20250124120000_add_casino_limits/migration.sql
```

