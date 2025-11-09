# Настройка Nginx с SSL сертификатами

## Сертификаты получены! ✅

Сертификаты сохранены в:
- `/etc/letsencrypt/live/fqxgmrzplndwsyvkeu.ru/fullchain.pem`
- `/etc/letsencrypt/live/fqxgmrzplndwsyvkeu.ru/privkey.pem`
- `/etc/letsencrypt/live/gldwueprxkmbtqsnva.ru/fullchain.pem`
- `/etc/letsencrypt/live/gldwueprxkmbtqsnva.ru/privkey.pem`

## Настройка Nginx конфигов

### 1. Конфиг для админки (fqxgmrzplndwsyvkeu.ru)

Создайте файл `/etc/nginx/sites-available/bingo-admin`:

```nginx
server {
    listen 80;
    server_name fqxgmrzplndwsyvkeu.ru;
    
    # Редирект на HTTPS
    return 301 https://$server_name$request_uri;
}

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

### 2. Конфиг для формы оплаты (gldwueprxkmbtqsnva.ru)

Создайте файл `/etc/nginx/sites-available/bingo-payment`:

```nginx
server {
    listen 80;
    server_name gldwueprxkmbtqsnva.ru;
    
    # Редирект на HTTPS
    return 301 https://$server_name$request_uri;
}

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

## Активация конфигов

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

# Проверьте что порты слушаются
sudo netstat -tulpn | grep nginx

# Проверьте логи
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

## Проверка в браузере

1. Откройте `https://fqxgmrzplndwsyvkeu.ru` - должна открыться админка
2. Откройте `https://gldwueprxkmbtqsnva.ru/pay?amount=1000&request_id=1` - должна открыться форма оплаты
3. Проверьте что есть редирект с HTTP на HTTPS

## Автоматическое обновление сертификатов

Certbot уже настроил автоматическое обновление. Проверьте:

```bash
# Проверьте таймер
sudo systemctl status certbot.timer

# Если не активен, включите
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

# Проверьте когда будет следующее обновление
sudo certbot certificates
```

## Если что-то не работает

```bash
# Проверьте логи nginx
sudo tail -50 /var/log/nginx/error.log

# Проверьте что приложения запущены
pm2 status

# Проверьте что порты открыты
sudo ufw status
sudo netstat -tulpn | grep -E '3002|3003'
```

## Обновление конфигов после изменений

```bash
# Проверьте конфигурацию
sudo nginx -t

# Перезагрузите nginx
sudo systemctl reload nginx
# или
sudo systemctl restart nginx
```

