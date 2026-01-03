# 🚀 Быстрый старт - Развертывание на сервере

## 📋 Что нужно сделать

### 1. Подключение к серверу

```bash
# Используйте созданный SSH ключ
ssh -i ~/.ssh/id_ed25519_bingo username@your-server.com
```

### 2. Установка зависимостей

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Python 3.10+
sudo apt install -y python3 python3-pip python3-venv

# PM2 для управления процессами
sudo npm install -g pm2

# Nginx для reverse proxy
sudo apt install -y nginx certbot python3-certbot-nginx

# PostgreSQL клиент
sudo apt install -y postgresql-client git
```

### 3. Настройка проекта

```bash
# Перейдите в директорию проекта
cd ~/projects/bingo_bot

# Или склонируйте проект
# cd ~
# mkdir -p projects
# cd projects
# git clone <repository> bingo_bot
# cd bingo_bot
```

### 4. Настройка Admin Panel (Next.js)

```bash
cd admin

# Установка зависимостей
npm install

# Создайте .env файл
nano .env
```

Содержимое `.env`:
```env
DATABASE_URL="postgresql://gen_user:dastan10dz@92.51.38.85:5432/default_db?schema=public"
JWT_SECRET="измените-этот-секретный-ключ-на-уникальный"
NODE_ENV="production"
BOT_TOKEN="8413027203:AAHhXadiHxW8WUSGp8tzxPqOF7iLHf8lI_s"
OPERATOR_BOT_TOKEN="8279477654:AAHZHyx5Ez_qeOYx610ayISgHhtz9Uy7F_0"
```

```bash
# Генерация Prisma Client
npm run db:generate

# Сборка проекта
npm run build

# Создание первого администратора
ADMIN_USERNAME=admin ADMIN_PASSWORD=ваш_пароль ADMIN_EMAIL=admin@bingo.com npm run create-admin
```

### 5. Настройка Telegram Bot

```bash
cd ../telegram_bot

# Создание виртуального окружения
python3 -m venv venv
source venv/bin/activate

# Установка зависимостей
pip install -r requirements.txt

# Создайте .env файл
nano .env
```

Содержимое `.env`:
```env
BOT_TOKEN=8413027203:AAHhXadiHxW8WUSGp8tzxPqOF7iLHf8lI_s
OPERATOR_BOT_TOKEN=8279477654:AAHZHyx5Ez_qeOYx610ayISgHhtz9Uy7F_0
API_BASE_URL=https://fqxgmrzplndwsyvkeu.ru/api
PAYMENT_SITE_URL=https://gldwueprxkmbtqsnva.ru
```

```bash
deactivate
```

### 6. Настройка Payment Site (Flask)

```bash
cd ../payment_site

# Создание виртуального окружения
python3 -m venv venv
source venv/bin/activate

# Установка зависимостей
pip install -r requirements.txt
pip install gunicorn

deactivate
```

### 7. Запуск всех сервисов

#### Вариант А: Используя ecosystem.config.js

Создайте файл `ecosystem.config.js` в корне проекта:

```javascript
module.exports = {
  apps: [
    {
      name: 'bingo-admin',
      cwd: './admin',
      script: 'npm',
      args: 'start',
      env: { NODE_ENV: 'production', PORT: 3001 }
    },
    {
      name: 'bingo-bot',
      cwd: './telegram_bot',
      script: 'bot.py',
      interpreter: 'python3',
      env: { PYTHONUNBUFFERED: '1' }
    },
    {
      name: 'bingo-payment',
      cwd: './payment_site',
      script: 'gunicorn',
      args: '-w 4 -b 0.0.0.0:3002 app:app',
      env: { FLASK_ENV: 'production' }
    }
  ]
};
```

Запуск:
```bash
cd ~/projects/bingo_bot
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Выполните предложенную команду
```

#### Вариант Б: Запуск по отдельности

```bash
# Admin Panel
cd ~/projects/bingo_bot/admin
pm2 start npm --name "bingo-admin" -- start

# Telegram Bot
cd ~/projects/bingo_bot/telegram_bot
pm2 start bot.py --name "bingo-bot" --interpreter python3

# Payment Site
cd ~/projects/bingo_bot/payment_site
pm2 start gunicorn --name "bingo-payment" -- -w 4 -b 0.0.0.0:3002 app:app

# Сохранение
pm2 save
pm2 startup
```

### 8. Настройка Nginx

#### Admin Panel (fqxgmrzplndwsyvkeu.ru)

```bash
sudo nano /etc/nginx/sites-available/bingo-admin
```

```nginx
server {
    listen 80;
    server_name fqxgmrzplndwsyvkeu.ru;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### Payment Site (gldwueprxkmbtqsnva.ru)

```bash
sudo nano /etc/nginx/sites-available/bingo-payment
```

```nginx
server {
    listen 80;
    server_name gldwueprxkmbtqsnva.ru;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Активация:
```bash
sudo ln -s /etc/nginx/sites-available/bingo-admin /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/bingo-payment /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 9. Настройка SSL (HTTPS)

```bash
sudo certbot --nginx -d fqxgmrzplndwsyvkeu.ru -d gldwueprxkmbtqsnva.ru
```

### 10. Настройка файрвола

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## ✅ Проверка работы

```bash
# Проверка процессов
pm2 list

# Просмотр логов
pm2 logs

# Проверка портов
sudo netstat -tulpn | grep -E '3001|3002'

# Проверка Nginx
sudo systemctl status nginx
```

---

## 📊 Полезные команды

```bash
# Перезапуск всех процессов
pm2 restart all

# Просмотр логов конкретного процесса
pm2 logs bingo-admin
pm2 logs bingo-bot
pm2 logs bingo-payment

# Мониторинг
pm2 monit

# Обновление проекта
cd ~/projects/bingo_bot
git pull  # если используете Git
cd admin && npm install && npm run build && pm2 restart bingo-admin
cd ../telegram_bot && source venv/bin/activate && pip install -r requirements.txt && pm2 restart bingo-bot
cd ../payment_site && source venv/bin/activate && pip install -r requirements.txt && pm2 restart bingo-payment
```

---

## 🆘 Решение проблем

**Процесс не запускается:**
```bash
pm2 logs <имя-процесса> --err
```

**Не работает подключение к БД:**
```bash
psql -h 92.51.38.85 -U gen_user -d default_db -p 5432
```

**Nginx не работает:**
```bash
sudo nginx -t
sudo tail -f /var/log/nginx/error.log
```

---

## 📚 Подробная документация

См. файл `SERVER_SETUP.md` для полной документации.









