# Инструкция по настройке на сервере

## 1. Клонирование/Обновление репозитория

```bash
cd /var/www/bingo
git pull origin main
```

## 2. Обновление зависимостей

### Админка (Next.js):
```bash
cd /var/www/bingo/admin_nextjs
npm install
npm run build
```

### Сайт оплаты (Flask):
```bash
cd /var/www/bingo/payment_site
pip3 install -r requirements.txt
```

### Бот (Python):
```bash
cd /var/www/bingo/telegram_bot
pip3 install -r requirements.txt
```

## 3. Настройка переменных окружения

### Админка (`/var/www/bingo/admin_nextjs/.env`):
```env
DATABASE_URL=postgresql://gen_user:dastan10dz@92.51.38.85:5432/default_db
BOT_TOKEN=your_bot_token_here
NEXTAUTH_SECRET=your_secret_here
NODE_ENV=production
PORT=3002
```

### Бот (`/var/www/bingo/telegram_bot/.env`):
```env
BOT_TOKEN=your_bot_token_here
API_BASE_URL=https://fqxgmrzplndwsyvkeu.ru/api
PAYMENT_SITE_URL=https://gldwueprxkmbtqsnva.ru
```

### Сайт оплаты (`/var/www/bingo/payment_site/.env`):
```env
API_BASE_URL=https://fqxgmrzplndwsyvkeu.ru/api
FLASK_ENV=production
PORT=3003
```

## 4. Получение SSL сертификатов

```bash
# Остановите nginx временно
sudo systemctl stop nginx

# Получите сертификаты
sudo certbot certonly --standalone -d fqxgmrzplndwsyvkeu.ru
sudo certbot certonly --standalone -d gldwueprxkmbtqsnva.ru

# Запустите nginx обратно
sudo systemctl start nginx
```

## 5. Настройка Nginx

### Создайте `/etc/nginx/sites-available/bingo-admin`:
```nginx
server {
    listen 80;
    server_name fqxgmrzplndwsyvkeu.ru;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name fqxgmrzplndwsyvkeu.ru;

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
        proxy_set_header Cookie $http_cookie;
        proxy_pass_header Set-Cookie;
    }
}
```

### Создайте `/etc/nginx/sites-available/bingo-payment`:
```nginx
server {
    listen 80;
    server_name gldwueprxkmbtqsnva.ru;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name gldwueprxkmbtqsnva.ru;

    ssl_certificate /etc/letsencrypt/live/gldwueprxkmbtqsnva.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gldwueprxkmbtqsnva.ru/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

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
    }
}
```

### Активация конфигов:
```bash
sudo ln -s /etc/nginx/sites-available/bingo-admin /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/bingo-payment /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 6. Запуск через PM2

```bash
cd /var/www/bingo

# Обновите ecosystem.config.js для сервера (пути должны быть /var/www/bingo)
# Или используйте существующий, но проверьте пути

# Запустите приложения
pm2 start ecosystem.config.js

# Или если уже запущены - перезапустите
pm2 restart all

# Сохраните конфигурацию
pm2 save

# Настройте автозапуск
pm2 startup
```

## 7. Проверка работы

```bash
# Проверьте статус PM2
pm2 status

# Проверьте логи
pm2 logs bingo-admin
pm2 logs bingo-payment
pm2 logs bingo-bot

# Проверьте сайты
curl -I https://fqxgmrzplndwsyvkeu.ru
curl -I https://gldwueprxkmbtqsnva.ru
```

## Быстрая команда для обновления:

```bash
cd /var/www/bingo && \
git pull origin main && \
cd admin_nextjs && npm install && npm run build && \
cd ../payment_site && pip3 install -r requirements.txt && \
cd ../telegram_bot && pip3 install -r requirements.txt && \
cd .. && pm2 restart all
```
