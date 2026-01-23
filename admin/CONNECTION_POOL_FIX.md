# Исправление проблемы с Connection Pool

## Проблема
```
Timed out fetching a new connection from the connection pool
Current connection pool timeout: 10, connection limit: 17
```

## Решение

### 1. Обновите DATABASE_URL в `.env` файле

**Текущий формат (пример):**
```
DATABASE_URL="postgresql://user:password@host:5432/database"
```

**Новый формат (с параметрами пула):**
```
DATABASE_URL="postgresql://user:password@host:5432/database?connection_limit=50&pool_timeout=30"
```

### 2. Параметры:
- `connection_limit=50` - максимальное количество соединений в пуле (было 17 по умолчанию)
- `pool_timeout=30` - время ожидания свободного соединения в секундах (было 10)

### 3. После изменения:
```bash
# Перезапустите все сервисы
pm2 restart all
```

### 4. Если проблема сохраняется:
- Увеличьте `connection_limit` до 100
- Проверьте, нет ли утечек соединений (незакрытые транзакции)
- Проверьте нагрузку на БД

## Проверка
После перезапуска проверьте логи - ошибки "Timed out fetching a new connection" должны исчезнуть.

