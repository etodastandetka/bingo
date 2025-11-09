# Инструкция по деплою на сервер

## 1. Получение SSL сертификатов через Certbot

### Для домена админки (fqxgmrzplndwsyvkeu.ru):
```bash
sudo certbot certonly --standalone -d fqxgmrzplndwsyvkeu.ru
```

### Для домена формы оплаты (gldwueprxkmbtqsnva.ru):
```bash
sudo certbot certonly --standalone -d gldwueprxkmbtqsnva.ru
```

## 2. Настройка Nginx

### Конфигурация для админки (fqxgmrzplndwsyvkeu.ru)

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

    ssl_certificate /etc/letsencrypt/live/fqxgmrzplndwsyvkeu.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fqxgmrzplndwsyvkeu.ru/privkey.pem;

    # SSL настройки
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
        
        # Важно: передаем куки от клиента к Next.js
        proxy_set_header Cookie $http_cookie;
        
        # Передаем куки от Next.js к клиенту
        proxy_pass_header Set-Cookie;
    }
}
```

### Конфигурация для формы оплаты (gldwueprxkmbtqsnva.ru)

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

    ssl_certificate /etc/letsencrypt/live/gldwueprxkmbtqsnva.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gldwueprxkmbtqsnva.ru/privkey.pem;

    # SSL настройки
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

### Активация конфигураций:

```bash
sudo ln -s /etc/nginx/sites-available/bingo-admin /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/bingo-payment /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 3. Настройка PM2

### Установка PM2 (если не установлен):
```bash
sudo npm install -g pm2
```

### Создание конфигурации PM2

Создайте файл `ecosystem.config.js` в корне проекта:

```javascript
module.exports = {
  apps: [
    {
      name: 'bingo-admin',
      cwd: '/var/www/bingo/admin_nextjs',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      },
      error_file: '/var/log/pm2/bingo-admin-error.log',
      out_file: '/var/log/pm2/bingo-admin-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '1G'
    },
    {
      name: 'bingo-payment',
      cwd: '/var/www/bingo/payment_site',
      script: 'python',
      args: 'app.py',
      interpreter: 'python3',
      env: {
        FLASK_ENV: 'production',
        PORT: 3003
      },
      error_file: '/var/log/pm2/bingo-payment-error.log',
      out_file: '/var/log/pm2/bingo-payment-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '500M'
    },
    {
      name: 'bingo-bot',
      cwd: '/var/www/bingo/telegram_bot',
      script: 'python',
      args: 'bot.py',
      interpreter: 'python3',
      error_file: '/var/log/pm2/bingo-bot-error.log',
      out_file: '/var/log/pm2/bingo-bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '500M'
    }
  ]
};
```

### Запуск через PM2:

```bash
# Перейти в корень проекта
cd /var/www/bingo

# Запустить все приложения
pm2 start ecosystem.config.js

# Сохранить конфигурацию PM2
pm2 save

# Настроить автозапуск при перезагрузке сервера
pm2 startup
```

### Управление приложениями:

```bash
# Просмотр статуса
pm2 status

# Просмотр логов
pm2 logs bingo-admin
pm2 logs bingo-payment
pm2 logs bingo-bot

# Перезапуск
pm2 restart bingo-admin
pm2 restart bingo-payment
pm2 restart bingo-bot

# Остановка
pm2 stop bingo-admin

# Удаление из PM2
pm2 delete bingo-admin
```

## 4. Настройка переменных окружения

### Для админки (`/var/www/bingo/admin_nextjs/.env`):
```env
DATABASE_URL=postgresql://gen_user:dastan10dz@92.51.38.85:5432/default_db
BOT_TOKEN=your_bot_token_here
NEXTAUTH_SECRET=your_secret_here
NODE_ENV=production
PORT=3002
```

### Для бота (`/var/www/bingo/telegram_bot/.env`):
```env
BOT_TOKEN=your_bot_token_here
API_BASE_URL=https://fqxgmrzplndwsyvkeu.ru/api
PAYMENT_SITE_URL=https://gldwueprxkmbtqsnva.ru
```

### Для сайта оплаты (`/var/www/bingo/payment_site/.env`):
```env
API_BASE_URL=https://fqxgmrzplndwsyvkeu.ru/api
FLASK_ENV=production
PORT=3003
```

## 5. Сборка Next.js приложения

```bash
cd /var/www/bingo/admin_nextjs
npm install
npm run build
```

## 6. Обновление сертификатов (автоматически)

Certbot автоматически обновляет сертификаты. Проверьте, что таймер работает:

```bash
sudo systemctl status certbot.timer
```

## 7. Проверка работы

1. Проверьте админку: `https://fqxgmrzplndwsyvkeu.ru`
2. Проверьте форму оплаты: `https://gldwueprxkmbtqsnva.ru/pay?amount=1000&request_id=1`
3. Проверьте статус PM2: `pm2 status`
4. Проверьте логи: `pm2 logs`

