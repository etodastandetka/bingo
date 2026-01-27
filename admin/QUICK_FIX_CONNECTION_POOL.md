# 🚨 СРОЧНОЕ ИСПРАВЛЕНИЕ: Connection Pool Timeout

## Проблема
В логах видны ошибки:
```
Timed out fetching a new connection from the connection pool
Current connection pool timeout: 10, connection limit: 17
Error code: P2024
```

## Быстрое решение (5 минут)

### 1. На сервере отредактируйте `.env` файл:
```bash
cd /var/www/bingo_bot/admin
nano .env
```

### 2. Найдите строку `DATABASE_URL` и добавьте параметры:

**Было:**
```
DATABASE_URL="postgresql://gen_user:dastan10dz@92.51.38.85:5432/default_db"
```

**Должно быть:**
```
DATABASE_URL="postgresql://gen_user:dastan10dz@92.51.38.85:5432/default_db?connection_limit=50&pool_timeout=30"
```

### 3. Сохраните файл (Ctrl+O, Enter, Ctrl+X)

### 4. Перезапустите все сервисы:
```bash
pm2 restart all
```

### 5. Проверьте логи (ошибки должны исчезнуть):
```bash
pm2 logs bingo-email-watcher --lines 50
```

## Если проблема сохраняется

Увеличьте параметры еще больше:
```
DATABASE_URL="postgresql://gen_user:dastan10dz@92.51.38.85:5432/default_db?connection_limit=100&pool_timeout=60"
```

И снова:
```bash
pm2 restart all
```

## Проверка конфигурации

После исправления можно проверить:
```bash
cd /var/www/bingo_bot/admin
npx tsx scripts/check-connection-pool.ts
```

---

**Подробная документация:** `CONNECTION_POOL_FIX.md`




