# Оптимизация PostgreSQL для решения проблем с Connection Pool

## Критические проблемы в текущих настройках:

### 1. `idle_in_transaction_session_timeout = 0` ⚠️ КРИТИЧНО
**Проблема:** Зависшие транзакции держат соединения вечно, исчерпывая пул.

**Решение:** Установить `60000` (60 секунд) или `120000` (2 минуты)
- Убивает транзакции, которые зависли без активности
- Освобождает соединения для других запросов

### 2. `shared_buffers = 31232` (30MB) ⚠️ СЛИШКОМ МАЛО
**Проблема:** Мало памяти для кэширования данных.

**Решение:** Увеличить до `262144` (256MB) или `524288` (512MB)
- Улучшает производительность чтения из БД
- Рекомендуется 25% от RAM, но минимум 128MB

### 3. `work_mem = 436` (436KB) ⚠️ СЛИШКОМ МАЛО
**Проблема:** Мало памяти для сортировок и JOIN'ов при параллельных запросах.

**Решение:** Увеличить до `16384` (16MB)
- Формула: `work_mem = (RAM - shared_buffers) / (max_connections * 2)`
- При 200 соединениях: `(2GB - 512MB) / (200 * 2) = 3.75MB`, но можно больше

### 4. `effective_cache_size = 524288` (512MB)
**Можно увеличить** до `1048576` (1GB) если есть свободная RAM
- Помогает планировщику запросов выбирать лучшие планы

## Рекомендуемые изменения:

```
max_connections = 200                    # Оставить как есть
shared_buffers = 262144                  # Увеличить до 256MB (было 30MB)
effective_cache_size = 1048576           # Увеличить до 1GB (было 512MB)
work_mem = 16384                         # Увеличить до 16MB (было 436KB)
maintenance_work_mem = 33554432          # Оставить 32MB
idle_in_transaction_session_timeout = 120000  # Установить 2 минуты (было 0)
statement_timeout = 300000               # Установить 5 минут (было 0)
```

## Дополнительные оптимизации:

### `statement_timeout = 300000` (5 минут)
- Убивает запросы, которые выполняются дольше 5 минут
- Защита от зависших запросов

### `lock_timeout = 10000` (10 секунд)
- Убивает запросы, которые ждут блокировку дольше 10 секунд
- Предотвращает deadlock'и

## Важно:

1. **`idle_in_transaction_session_timeout`** - это самое критичное изменение!
   - Убьет зависшие транзакции, которые держат соединения
   - Освободит connection pool

2. После изменений перезапустите PostgreSQL:
   ```bash
   # На сервере БД
   sudo systemctl restart postgresql
   # или
   sudo service postgresql restart
   ```

3. Мониторьте логи после изменений:
   ```bash
   tail -f /var/log/postgresql/postgresql-*.log
   ```

## Проверка после изменений:

```sql
-- Проверка активных соединений
SELECT count(*) FROM pg_stat_activity;

-- Проверка зависших транзакций
SELECT count(*) FROM pg_stat_activity 
WHERE state = 'idle in transaction' 
AND now() - state_change > interval '1 minute';

-- Проверка долгих запросов
SELECT pid, now() - query_start as duration, query 
FROM pg_stat_activity 
WHERE state = 'active' 
AND now() - query_start > interval '30 seconds';
```

