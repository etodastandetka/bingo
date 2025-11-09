# Настройка обоих доменов в Nginx

## Структура:

- **fqxgmrzplndwsyvkeu.ru** → админка (порт 3002)
- **gldwueprxkmbtqsnva.ru** → форма оплаты (порт 3003)

## Конфиг для админки: `/etc/nginx/sites-available/bingo-admin`

```nginx
# Блокируем все другие домены
server {
    listen 80 default_server;
    server_name _;
    return 444;
}

# HTTP - редирект на HTTPS
server {
    listen 80;
    server_name fqxgmrzplndwsyvkeu.ru;
    
    return 301 https://$server_name$request_uri;
}

# HTTPS конфигурация для админки
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

    # Прокси на админку (порт 3002)
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
        proxy_pass_header Set-Cookie;
        
        # Таймауты
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

## Конфиг для формы оплаты: `/etc/nginx/sites-available/bingo-payment`

```nginx
# HTTP - редирект на HTTPS
server {
    listen 80;
    server_name gldwueprxkmbtqsnva.ru;
    
    return 301 https://$server_name$request_uri;
}

# HTTPS конфигурация для формы оплаты
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

    # Прокси на форму оплаты (порт 3003)
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

## Активация обоих конфигов

```bash
# Создайте символические ссылки
sudo ln -s /etc/nginx/sites-available/bingo-admin /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/bingo-payment /etc/nginx/sites-enabled/

# Проверьте конфигурацию
sudo nginx -t

# Если все ок, перезагрузите nginx
sudo systemctl reload nginx
```

## Проверка работы

```bash
# Проверьте статус nginx
sudo systemctl status nginx

# Проверьте что оба домена работают
curl -I https://fqxgmrzplndwsyvkeu.ru
curl -I https://gldwueprxkmbtqsnva.ru

# Проверьте что приложения запущены на правильных портах
pm2 status
# Должны быть:
# - bingo-admin на порту 3002
# - bingo-payment на порту 3003
```

## Проверка в браузере

1. **Админка**: `https://fqxgmrzplndwsyvkeu.ru` - должна открыться админка
2. **Форма оплаты**: `https://gldwueprxkmbtqsnva.ru/pay?amount=1000&request_id=1` - должна открыться форма оплаты

## Если что-то не работает

```bash
# Проверьте логи nginx
sudo tail -50 /var/log/nginx/error.log

# Проверьте что приложения запущены
pm2 status
pm2 logs bingo-admin
pm2 logs bingo-payment

# Проверьте что порты слушаются
sudo netstat -tulpn | grep -E '3002|3003'
```

## Важно:

- **Админка** (`fqxgmrzplndwsyvkeu.ru`) → порт **3002**
- **Форма оплаты** (`gldwueprxkmbtqsnva.ru`) → порт **3003**

Убедитесь, что в PM2 приложения запущены на правильных портах!

