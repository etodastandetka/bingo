# 🚀 Руководство по развертыванию Bingo Bot на сервере

## 📋 Архитектура системы

Система состоит из 3 компонентов:

1. **Next.js Admin Panel** (порт 3001) - Админ-панель для управления
2. **Telegram Bot** (Python) - Бот для пользователей
3. **Payment Site** (Flask, порт 3002) - Сайт для оплаты с QR кодами
4. **PostgreSQL** - База данных (уже настроена на 92.51.38.85:5432)

```
┌─────────────────┐
│  Telegram Users │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│  Telegram Bot   │────▶│  Admin API   │────▶│ PostgreSQL  │
│   (Python)      │     │  (Next.js)   │     │  Database   │
└─────────────────┘     └──────┬───────┘     └─────────────┘
                               │
                               ▼
                        ┌──────────────┐
                        │ Payment Site │
                        │   (Flask)    │
                        └──────────────┘
```

---

## 🔐 Шаг 1: Подключение к серверу через SSH

### 1.1 Использование созданного SSH ключа

```bash
# Подключение к серверу
ssh -i ~/.ssh/id_ed25519_bingo username@your-server.com

# Или добавьте в ~/.ssh/config:
Host bingo-server
    HostName your-server.com
    User your-username
    IdentityFile ~/.ssh/id_ed25519_bingo

# Тогда можно просто:
ssh bingo-server
```

### 1.2 Добавление SSH ключа на сервер

Если ключ еще не добавлен на сервер:

```bash
# На вашем локальном компьютере
cat ~/.ssh/id_ed25519_bingo.pub

# Скопируйте вывод и на сервере выполните:
mkdir -p ~/.ssh
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFc9dUc4MasxfY89XvqlW1KJCG1LWWVxNuafZgsc39wo bingo_bot_server" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
chmod 700 ~/.ssh
```

---

## 📦 Шаг 2: Подготовка сервера

### 2.1 Установка системных зависимостей

```bash
# Обновление системы (Ubuntu/Debian)
sudo apt update && sudo apt upgrade -y

# Установка Node.js 18+ (для Next.js)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Установка Python 3.10+ и pip
sudo apt install -y python3 python3-pip python3-venv

# Установка PostgreSQL клиента (для подключения к БД)
sudo apt install -y postgresql-client

# Установка Git (для клонирования проекта)
sudo apt install -y git

# Установка PM2 для управления процессами Node.js
sudo npm install -g pm2

# Установка Nginx (для reverse proxy и HTTPS)
sudo apt install -y nginx
sudo apt install -y certbot python3-certbot-nginx
```

### 2.2 Проверка установки

```bash
node --version    # Должно быть v18+
npm --version
python3 --version # Должно быть 3.10+
pm2 --version
nginx -v
```

---

## 📂 Шаг 3: Клонирование и настройка проекта

### 3.1 Клонирование проекта

```bash
# Перейдите в домашнюю директорию или создайте рабочую директорию
cd ~
mkdir -p projects
cd projects

# Если проект уже есть, перейдите в него
cd bingo_bot

# Если нужно клонировать:
# git clone <repository-url> bingo_bot
# cd bingo_bot
```

### 3.2 Структура проекта на сервере

```
~/projects/bingo_bot/
├── admin/              # Next.js админ-панель
├── telegram_bot/       # Python Telegram бот
├── payment_site/       # Flask сайт оплаты
└── ...
```

---

## 🗄️ Шаг 4: Настройка базы данных

База данных уже настроена на `92.51.38.85:5432`. Проверьте подключение:

```bash
# Проверка подключения к БД
psql -h 92.51.38.85 -U gen_user -d default_db -p 5432
# Введите пароль: dastan10dz

# Если подключение успешно, выйдите:
\q
```

---

## 🔧 Шаг 5: Настройка Next.js Admin Panel

### 5.1 Установка зависимостей

```bash
cd ~/projects/bingo_bot/admin

# Установка зависимостей
npm install

# Генерация Prisma Client
npm run db:generate

# Применение схемы БД (если нужно)
npm run db:push
```

### 5.2 Создание .env файла

```bash
cd ~/projects/bingo_bot/admin
nano .env
```

Добавьте:

```env
DATABASE_URL="postgresql://gen_user:dastan10dz@92.51.38.85:5432/default_db?schema=public"
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
NODE_ENV="production"
BOT_TOKEN="8413027203:AAHhXadiHxW8WUSGp8tzxPqOF7iLHf8lI_s"
OPERATOR_BOT_TOKEN="8279477654:AAHZHyx5Ez_qeOYx610ayISgHhtz9Uy7F_0"
```

### 5.3 Создание администратора

```bash
cd ~/projects/bingo_bot/admin
ADMIN_USERNAME=admin ADMIN_PASSWORD=your_secure_password ADMIN_EMAIL=admin@bingo.com npm run create-admin
```

### 5.4 Сборка и запуск

```bash
cd ~/projects/bingo_bot/admin

# Сборка проекта
npm run build

# Запуск через PM2
pm2 start npm --name "bingo-admin" -- start

# Или для разработки:
# npm run dev

# Сохранение конфигурации PM2
pm2 save
pm2 startup  # Выполните предложенную команду для автозапуска
```

Админ-панель будет доступна на порту 3001.

---

## 🤖 Шаг 6: Настройка Telegram Bot

### 6.1 Создание виртуального окружения

```bash
cd ~/projects/bingo_bot/telegram_bot

# Создание виртуального окружения
python3 -m venv venv

# Активация
source venv/bin/activate

# Установка зависимостей
pip install -r requirements.txt
```

### 6.2 Создание .env файла

```bash
cd ~/projects/bingo_bot/telegram_bot
nano .env
```

Добавьте:

```env
BOT_TOKEN=8413027203:AAHhXadiHxW8WUSGp8tzxPqOF7iLHf8lI_s
OPERATOR_BOT_TOKEN=8279477654:AAHZHyx5Ez_qeOYx610ayISgHhtz9Uy7F_0
API_BASE_URL=https://fqxgmrzplndwsyvkeu.ru/api
PAYMENT_SITE_URL=https://gldwueprxkmbtqsnva.ru
```

### 6.3 Запуск бота

```bash
cd ~/projects/bingo_bot/telegram_bot
source venv/bin/activate

# Запуск через PM2
pm2 start bot.py --name "bingo-bot" --interpreter python3

# Или напрямую:
# python3 bot.py

# Сохранение конфигурации
pm2 save
```

---

## 💳 Шаг 7: Настройка Payment Site (Flask)

### 7.1 Создание виртуального окружения

```bash
cd ~/projects/bingo_bot/payment_site

# Создание виртуального окружения
python3 -m venv venv

# Активация
source venv/bin/activate

# Установка зависимостей
pip install -r requirements.txt
```

### 7.2 Создание .env файла (если нужно)

```bash
cd ~/projects/bingo_bot/payment_site
nano .env
```

Добавьте:

```env
API_BASE_URL=https://fqxgmrzplndwsyvkeu.ru/api
FLASK_ENV=production
FLASK_APP=app.py
```

### 7.3 Запуск Flask приложения

```bash
cd ~/projects/bingo_bot/payment_site
source venv/bin/activate

# Запуск через PM2
pm2 start app.py --name "bingo-payment" --interpreter python3

# Или с gunicorn (рекомендуется для production):
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:3002 app:app

# Через PM2 с gunicorn:
pm2 start gunicorn --name "bingo-payment" -- -w 4 -b 0.0.0.0:3002 app:app

# Сохранение конфигурации
pm2 save
```

---

## 🌐 Шаг 8: Настройка Nginx как Reverse Proxy

### 8.1 Создание конфигурации для Admin Panel

```bash
sudo nano /etc/nginx/sites-available/bingo-admin
```

Добавьте:

```nginx
server {
    listen 80;
    server_name fqxgmrzplndwsyvkeu.ru;

    # Редирект на HTTPS (после получения сертификата)
    # return 301 https://$server_name$request_uri;

    location / {
        proxy_pass http://localhost:3001;
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

### 8.2 Создание конфигурации для Payment Site

```bash
sudo nano /etc/nginx/sites-available/bingo-payment
```

Добавьте:

```nginx
server {
    listen 80;
    server_name gldwueprxkmbtqsnva.ru;

    # Редирект на HTTPS (после получения сертификата)
    # return 301 https://$server_name$request_uri;

    location / {
        proxy_pass http://localhost:3002;
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

### 8.3 Активация конфигураций

```bash
# Создание символических ссылок
sudo ln -s /etc/nginx/sites-available/bingo-admin /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/bingo-payment /etc/nginx/sites-enabled/

# Проверка конфигурации
sudo nginx -t

# Перезагрузка Nginx
sudo systemctl reload nginx
```

### 8.4 Настройка SSL (HTTPS)

```bash
# Получение SSL сертификатов через Let's Encrypt
sudo certbot --nginx -d fqxgmrzplndwsyvkeu.ru -d gldwueprxkmbtqsnva.ru

# Автоматическое обновление сертификатов
sudo certbot renew --dry-run
```

После получения сертификатов раскомментируйте редиректы на HTTPS в конфигурациях.

---

## 🔄 Шаг 9: Управление процессами с PM2

### 9.1 Полезные команды PM2

```bash
# Просмотр всех процессов
pm2 list

# Просмотр логов
pm2 logs bingo-admin
pm2 logs bingo-bot
pm2 logs bingo-payment

# Просмотр всех логов
pm2 logs

# Перезапуск процесса
pm2 restart bingo-admin

# Остановка процесса
pm2 stop bingo-admin

# Удаление процесса
pm2 delete bingo-admin

# Мониторинг в реальном времени
pm2 monit

# Сохранение текущего списка процессов
pm2 save

# Автозапуск при перезагрузке сервера
pm2 startup
# Выполните предложенную команду
```

### 9.2 Создание файла конфигурации PM2

Создайте `ecosystem.config.js` в корне проекта:

```bash
cd ~/projects/bingo_bot
nano ecosystem.config.js
```

```javascript
module.exports = {
  apps: [
    {
      name: 'bingo-admin',
      cwd: './admin',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    },
    {
      name: 'bingo-bot',
      cwd: './telegram_bot',
      script: 'bot.py',
      interpreter: 'python3',
      interpreter_args: '-u',
      env: {
        PYTHONUNBUFFERED: '1'
      }
    },
    {
      name: 'bingo-payment',
      cwd: './payment_site',
      script: 'gunicorn',
      args: '-w 4 -b 0.0.0.0:3002 app:app',
      env: {
        FLASK_ENV: 'production'
      }
    }
  ]
};
```

Запуск всех процессов:

```bash
cd ~/projects/bingo_bot
pm2 start ecosystem.config.js
pm2 save
```

---

## 📊 Шаг 10: Мониторинг и логи

### 10.1 Просмотр логов

```bash
# Логи Next.js админ-панели
pm2 logs bingo-admin --lines 100

# Логи Telegram бота
pm2 logs bingo-bot --lines 100

# Логи Payment Site
pm2 logs bingo-payment --lines 100

# Логи Nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### 10.2 Проверка статуса

```bash
# Статус всех сервисов
pm2 status

# Статус Nginx
sudo systemctl status nginx

# Проверка портов
sudo netstat -tulpn | grep -E '3001|3002'
```

---

## 🔄 Шаг 11: Обновление приложения

### 11.1 Процесс обновления

```bash
# Подключение к серверу
ssh bingo-server

# Переход в директорию проекта
cd ~/projects/bingo_bot

# Обновление кода (если используется Git)
git pull origin main

# Обновление Admin Panel
cd admin
npm install
npm run build
pm2 restart bingo-admin

# Обновление Telegram Bot
cd ../telegram_bot
source venv/bin/activate
pip install -r requirements.txt
pm2 restart bingo-bot

# Обновление Payment Site
cd ../payment_site
source venv/bin/activate
pip install -r requirements.txt
pm2 restart bingo-payment
```

---

## 🛡️ Шаг 12: Безопасность

### 12.1 Настройка файрвола

```bash
# Разрешить SSH
sudo ufw allow 22/tcp

# Разрешить HTTP и HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Включить файрвол
sudo ufw enable

# Проверка статуса
sudo ufw status
```

### 12.2 Обновление секретов

⚠️ **ВАЖНО**: После первого запуска обязательно:

1. Смените `JWT_SECRET` в `.env` файле админ-панели
2. Смените пароль администратора
3. Обновите токены ботов (если нужно)

---

## 🚨 Решение проблем

### Проблема: Процесс не запускается

```bash
# Проверьте логи
pm2 logs <process-name> --err

# Проверьте переменные окружения
pm2 env <process-id>

# Перезапустите процесс
pm2 restart <process-name>
```

### Проблема: Не подключается к базе данных

```bash
# Проверьте подключение
psql -h 92.51.38.85 -U gen_user -d default_db -p 5432

# Проверьте DATABASE_URL в .env файлах
cat admin/.env | grep DATABASE_URL
```

### Проблема: Nginx не проксирует запросы

```bash
# Проверьте конфигурацию
sudo nginx -t

# Проверьте логи
sudo tail -f /var/log/nginx/error.log

# Проверьте, что приложения запущены
pm2 list
netstat -tulpn | grep -E '3001|3002'
```

---

## ✅ Чеклист развертывания

- [ ] Установлены все системные зависимости (Node.js, Python, PostgreSQL client)
- [ ] Проект склонирован/скопирован на сервер
- [ ] Настроены все `.env` файлы
- [ ] База данных подключена и работает
- [ ] Admin Panel собран и запущен через PM2
- [ ] Telegram Bot запущен через PM2
- [ ] Payment Site запущен через PM2
- [ ] Nginx настроен как reverse proxy
- [ ] SSL сертификаты установлены
- [ ] Файрвол настроен
- [ ] Все процессы запущены и работают
- [ ] Секреты изменены с дефолтных значений

---

## 📞 Контакты и поддержка

При возникновении проблем проверьте:
1. Логи PM2: `pm2 logs`
2. Логи Nginx: `sudo tail -f /var/log/nginx/error.log`
3. Статус процессов: `pm2 status`
4. Порты: `sudo netstat -tulpn`

Удачи! 🚀









