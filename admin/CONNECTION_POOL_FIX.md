# Исправление проблемы с Connection Pool

## Проблема
```
Timed out fetching a new connection from the connection pool
Current connection pool timeout: 10, connection limit: 17
Error code: P2024
```

**Симптомы:**
- Множественные ошибки `P2024` в логах
- Запросы к БД занимают 12+ секунд
- Ошибки `Invalid prisma.*.findMany() invocation:` после таймаутов

## Решение

### 1. Проверьте текущую конфигурацию

```bash
cd admin
npx tsx scripts/check-connection-pool.ts
```

### 2. Обновите DATABASE_URL в `.env` файле

**Текущий формат (пример):**
```
DATABASE_URL="postgresql://user:password@host:5432/database"
```

**Новый формат (с параметрами пула):**
```
DATABASE_URL="postgresql://user:password@host:5432/database?connection_limit=100&pool_timeout=60"
```

### 3. Параметры:
- `connection_limit=100` - максимальное количество соединений в пуле (было 17 по умолчанию)
  - **Критично:** Рекомендуется 100 для высокой нагрузки
- `pool_timeout=60` - время ожидания свободного соединения в секундах (было 10)
  - **Критично:** Рекомендуется 60 для долгих транзакций

### 4. После изменения:
```bash
# Перезапустите все сервисы
pm2 restart all

# Проверьте логи
pm2 logs bingo-email-watcher --lines 50
```

### 5. Если проблема сохраняется:
- Увеличьте `connection_limit` до 100 или 150
- Увеличьте `pool_timeout` до 60
- Проверьте, нет ли утечек соединений (незакрытые транзакции)
- Проверьте нагрузку на БД
- Оптимизируйте медленные запросы (добавьте индексы)

## Проверка
После перезапуска проверьте логи - ошибки "Timed out fetching a new connection" должны исчезнуть.

## Дополнительная оптимизация PostgreSQL

**ВАЖНО:** Также нужно оптимизировать настройки PostgreSQL на сервере БД!

См. файл `POSTGRESQL_OPTIMIZATION.md` для детальных рекомендаций.

**Критично:** Установите `idle_in_transaction_session_timeout = 120000` (2 минуты) в настройках PostgreSQL!
- Это убьет зависшие транзакции, которые держат соединения
- Без этого изменения проблема может вернуться

## Быстрое исправление на сервере

```bash
# 1. Отредактируйте .env файл
cd /var/www/bingo_bot/admin
nano .env

# 2. Найдите DATABASE_URL и добавьте параметры:
# Было: DATABASE_URL="postgresql://..."
# Стало: DATABASE_URL="postgresql://...?connection_limit=100&pool_timeout=60"
# 
# ИЛИ запустите автоматический скрипт:
# npx tsx scripts/fix-connection-pool.ts

# 3. Перезапустите сервисы
pm2 restart all

# 4. Проверьте логи
pm2 logs --lines 100
```

