# Команды для получения SSL сертификата

## Быстрый способ (автоматический):

```bash
cd /var/www/bingo/admin_nextjs
chmod +x setup-ssl.sh
./setup-ssl.sh
```

## Ручной способ:

### 1. Установка Certbot (если не установлен):

```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx -y
```

### 2. Получение SSL сертификата:

```bash
sudo certbot --nginx -d fqxgmrzplndwsyvkeu.ru -d www.fqxgmrzplndwsyvkeu.ru
```

Certbot спросит:
- Email для уведомлений (введите email)
- Согласие с условиями (нажмите Y)
- Certbot автоматически настроит Nginx

### 3. Обновление конфигурации Nginx вручную (если нужно):

После получения сертификата обновите конфигурацию:

```bash
cd /var/www/bingo/admin_nextjs
git pull origin main

# Создайте конфигурацию с HTTPS
sudo nano /etc/nginx/sites-available/bingo-admin
```

Вставьте следующую конфигурацию:

```nginx
# Блокируем все другие домены
server {
    listen 80 default_server;
    server_name _;
    return 444;
}

# Редирект HTTP на HTTPS
server {
    listen 80;
    server_name fqxgmrzplndwsyvkeu.ru www.fqxgmrzplndwsyvkeu.ru;
    return 301 https://$server_name$request_uri;
}

# HTTPS конфигурация
server {
    listen 443 ssl http2;
    server_name fqxgmrzplndwsyvkeu.ru www.fqxgmrzplndwsyvkeu.ru;

    ssl_certificate /etc/letsencrypt/live/fqxgmrzplndwsyvkeu.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fqxgmrzplndwsyvkeu.ru/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

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
    }
}
```

### 4. Проверка и перезапуск:

```bash
# Проверяем синтаксис
sudo nginx -t

# Перезапускаем Nginx
sudo systemctl reload nginx

# Проверяем статус
sudo systemctl status nginx
```

### 5. Проверка работы HTTPS:

```bash
# Проверяем доступность
curl -I https://fqxgmrzplndwsyvkeu.ru

# Должен вернуть HTTP/2 200 или 301
```

## Автоматическое обновление сертификата:

Certbot автоматически настроит обновление. Проверить можно:

```bash
# Тестовое обновление
sudo certbot renew --dry-run

# Проверка статуса сертификата
sudo certbot certificates
```

## Полезные команды:

- Просмотр сертификатов: `sudo certbot certificates`
- Обновление вручную: `sudo certbot renew`
- Удаление сертификата: `sudo certbot delete --cert-name fqxgmrzplndwsyvkeu.ru`

