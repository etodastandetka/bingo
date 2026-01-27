# Диагностика проблем подключения к БД

## Проблема в логах

```
Can't reach database server at '92.51.38.85:5432'
Please make sure your database server is running at '92.51.38.85:5432'
Invalid prisma.request.findUnique() invocation:
```

## Возможные причины

### 1. БД недоступна по сети (наиболее вероятно)

**Симптомы:**
- `Can't reach database server`
- `Please make sure your database server is running`

**Причины:**
- PostgreSQL не запущен на сервере
- Порт 5432 закрыт в firewall
- Проблемы с сетью между серверами
- БД перезапускается/обновляется

**Решение:**
```bash
# На сервере БД проверьте статус PostgreSQL
sudo systemctl status postgresql

# Если не запущен - запустите
sudo systemctl start postgresql

# Проверьте, слушает ли PostgreSQL порт 5432
sudo netstat -tlnp | grep 5432
# или
sudo ss -tlnp | grep 5432
```

### 2. Временная недоступность (во время обновления настроек)

**Симптомы:**
- Ошибки появляются периодически
- БД работает, но иногда недоступна

**Причина:**
- БД перезапускается после изменения настроек (`shared_buffers` требует перезапуска)

**Решение:**
- Подождите завершения перезапуска БД
- Проверьте статус: `sudo systemctl status postgresql`

### 3. Проблемы с firewall

**Симптомы:**
- БД работает локально, но недоступна извне

**Решение:**
```bash
# На сервере БД проверьте firewall
sudo ufw status
# или
sudo firewall-cmd --list-all

# Разрешите доступ к порту 5432
sudo ufw allow 5432/tcp
# или
sudo firewall-cmd --permanent --add-port=5432/tcp
sudo firewall-cmd --reload
```

### 4. Превышен лимит соединений

**Симптомы:**
- `connection pool timeout`
- `too many connections`

**Решение:**
- Увеличьте `max_connections` в PostgreSQL
- Добавьте `connection_limit` в DATABASE_URL

## Диагностика

### Шаг 1: Проверьте подключение

```bash
cd /var/www/bingo_bot/admin
npx tsx scripts/check-db-connection.ts
```

### Шаг 2: Проверьте доступность БД с сервера приложения

```bash
# Проверьте доступность порта
telnet 92.51.38.85 5432
# или
nc -zv 92.51.38.85 5432

# Если недоступно - проблема с сетью/firewall
```

### Шаг 3: Проверьте логи PostgreSQL на сервере БД

```bash
# На сервере БД
sudo tail -f /var/log/postgresql/postgresql-*.log
```

### Шаг 4: Проверьте активные соединения

```sql
-- Подключитесь к БД и выполните:
SELECT count(*) FROM pg_stat_activity;
SELECT * FROM pg_stat_activity WHERE state = 'active';
```

## Быстрое решение

### Если БД перезапускается после изменения настроек:

1. **Подождите 1-2 минуты** - БД должна перезапуститься
2. **Проверьте статус:**
   ```bash
   sudo systemctl status postgresql
   ```
3. **Перезапустите приложение:**
   ```bash
   pm2 restart bingo-email-watcher
   ```

### Если БД не запущена:

```bash
# На сервере БД
sudo systemctl start postgresql
sudo systemctl enable postgresql  # автозапуск
```

### Если проблема с сетью:

1. Проверьте, доступен ли сервер БД:
   ```bash
   ping 92.51.38.85
   ```

2. Проверьте firewall на сервере БД

3. Проверьте настройки `pg_hba.conf` (разрешает ли подключения с вашего IP)

## Проверка после исправления

```bash
# Проверьте подключение
cd /var/www/bingo_bot/admin
npx tsx scripts/check-db-connection.ts

# Проверьте логи
pm2 logs bingo-email-watcher --lines 50
```

## Дополнительная информация

**IP БД:** `92.51.38.85:5432`

**Если это управляемая БД (например, Timeweb):**
- Проверьте панель управления БД
- Убедитесь, что БД запущена
- Проверьте настройки доступа (разрешен ли ваш IP)




