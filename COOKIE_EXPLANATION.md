# Объяснение работы куки по HTTP/HTTPS

## Как работают куки:

### ✅ Куки работают и по HTTP, и по HTTPS

**Разница только в флаге `secure`:**

1. **HTTP + `secure: false`** → ✅ Куки работают
2. **HTTP + `secure: true`** → ❌ Куки НЕ работают (браузер блокирует)
3. **HTTPS + `secure: false`** → ✅ Куки работают
4. **HTTPS + `secure: true`** → ✅ Куки работают (рекомендуется)

## Что было исправлено:

### Проблема:
- Раньше: `secure: isProduction` (всегда `true` в production)
- При HTTP: куки с `secure: true` не устанавливались браузером

### Решение:
- Теперь: `secure: isHttps` (определяется по протоколу)
- При HTTP: `secure: false` → куки работают ✅
- При HTTPS: `secure: true` → куки работают ✅

## Проверка работы куки:

### 1. В браузере (DevTools):
- F12 → Application → Cookies
- Должна быть кука `auth_token`
- Проверьте:
  - **Domain**: `fqxgmrzplndwsyvkeu.ru`
  - **Path**: `/`
  - **HttpOnly**: ✅ (галочка)
  - **Secure**: ❌ для HTTP, ✅ для HTTPS
  - **SameSite**: `Lax`

### 2. В Network (DevTools):
- F12 → Network → выберите запрос `/api/auth/login`
- Проверьте заголовок ответа: `Set-Cookie: auth_token=...`
- При следующем запросе должен быть заголовок: `Cookie: auth_token=...`

### 3. В логах PM2:
```bash
pm2 logs bingo-admin --lines 50
```

Должны быть сообщения:
- `🍪 Cookie установлен: { secure: false, ... }` для HTTP
- `🔐 Middleware check: { hasToken: true, ... }` при доступе к /dashboard

## Если куки не работают:

1. **Проверьте протокол**: HTTP или HTTPS?
2. **Проверьте флаг secure**: должен быть `false` для HTTP
3. **Проверьте домен**: куки должны быть для правильного домена
4. **Проверьте путь**: должен быть `/`
5. **Проверьте Nginx**: передает ли куки правильно

## Команды для проверки:

```bash
# Проверка логов
pm2 logs bingo-admin --lines 50

# Проверка Nginx
sudo nginx -t
sudo systemctl reload nginx

# Тест API логина
curl -X POST http://fqxgmrzplndwsyvkeu.ru/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"Mercedes-Benz","password":"E63 AMG"}' \
  -v
```

