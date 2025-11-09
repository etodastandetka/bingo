# Исправление конфига Nginx

## Проблема
HTTPS блок закомментирован, хотя сертификаты уже получены.

## Правильный конфиг для `/etc/nginx/sites-available/bingo-admin`:

```nginx
# Блокируем все другие домены и редиректы
server {
    listen 80 default_server;
    server_name _;
    return 444;
}

# HTTP - редирект на HTTPS
server {
    listen 80;
    server_name fqxgmrzplndwsyvkeu.ru;
    
    # Редирект на HTTPS
    return 301 https://$server_name$request_uri;
}

# HTTPS конфигурация
server {
    listen 443 ssl http2;
    server_name fqxgmrzplndwsyvkeu.ru;

    # SSL сертификаты
    ssl_certificate /etc/letsencrypt/live/fqxgmrzplndwsyvkeu.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fqxgmrzplndwsyvkeu.ru/privkey.pem;

    # SSL настройки
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Безопасность
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Важно: передаем куки от клиента к Next.js
        proxy_set_header Cookie $http_cookie;
        
        # Передаем куки от Next.js к клиенту
        proxy_pass_header Set-Cookie;
        
        # Таймауты
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

## Что изменить:

1. **Раскомментируйте HTTPS блок** (уберите все `#` в начале строк)
2. **Включите редирект** - раскомментируйте строку `return 301 https://$server_name$request_uri;`
3. **Уберите www из server_name** (если сертификат только для основного домена)

## Для формы оплаты `/etc/nginx/sites-available/bingo-payment`:

```nginx
# HTTP - редирект на HTTPS
server {
    listen 80;
    server_name gldwueprxkmbtqsnva.ru;
    
    # Редирект на HTTPS
    return 301 https://$server_name$request_uri;
}

# HTTPS конфигурация
server {
    listen 443 ssl http2;
    server_name gldwueprxkmbtqsnva.ru;

    # SSL сертификаты
    ssl_certificate /etc/letsencrypt/live/gldwueprxkmbtqsnva.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gldwueprxkmbtqsnva.ru/privkey.pem;

    # SSL настройки
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Безопасность
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;

    location / {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Таймауты
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

## После изменений:

```bash
# Проверьте конфигурацию
sudo nginx -t

# Если все ок, перезагрузите nginx
sudo systemctl reload nginx

# Проверьте что работает
curl -I https://fqxgmrzplndwsyvkeu.ru
curl -I https://gldwueprxkmbtqsnva.ru
```

