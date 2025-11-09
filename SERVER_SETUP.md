# Инструкция по настройке сервера для BINGO Admin Panel

## Шаг 1: Создание директорий

Выполните на сервере:

```bash
# Создаем директории
sudo mkdir -p /var/www/bingo
sudo mkdir -p /var/log/pm2

# Устанавливаем права доступа
sudo chown -R $USER:$USER /var/www/bingo
sudo chown -R $USER:$USER /var/log/pm2
```

Или используйте готовый скрипт (если уже склонировали репозиторий):

```bash
cd /var/www/bingo/admin_nextjs
chmod +x create-directories.sh
sudo ./create-directories.sh
```

## Шаг 2: Клонирование репозитория

### Если есть доступ к GitHub:

```bash
cd /var/www/bingo
git clone https://github.com/etodastandetka/bingo.git admin_nextjs
cd admin_nextjs
```

### Если нет доступа к GitHub (проблемы с сетью):

**Вариант 1: Использовать SSH (если настроен SSH ключ)**
```bash
cd /var/www/bingo
git clone git@github.com:etodastandetka/bingo.git admin_nextjs
cd admin_nextjs
```

**Вариант 2: Загрузить архив вручную**
1. Скачайте ZIP архив с GitHub на локальный компьютер
2. Загрузите на сервер через SCP/SFTP:
```bash
scp bingo-main.zip user@server:/var/www/bingo/
```
3. Распакуйте на сервере:
```bash
cd /var/www/bingo
unzip bingo-main.zip
mv bingo-main admin_nextjs
cd admin_nextjs
```

**Вариант 3: Исправить DNS/сеть**
```bash
# Проверьте DNS
nslookup github.com

# Если не работает, добавьте в /etc/hosts
echo "140.82.121.3 github.com" | sudo tee -a /etc/hosts

# Или используйте другой DNS
echo "nameserver 8.8.8.8" | sudo tee /etc/resolv.conf
```

## Шаг 3: Установка зависимостей

```bash
cd /var/www/bingo/admin_nextjs

# Устанавливаем Node.js (если не установлен)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Или для CentOS/RHEL
# curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
# sudo yum install -y nodejs

# Устанавливаем зависимости проекта
npm install
```

## Шаг 4: Настройка переменных окружения

```bash
cd /var/www/bingo/admin_nextjs

# Создаем .env файл
cat > .env << EOF
DATABASE_URL="postgresql://gen_user:dastan10dz@92.51.38.85:5432/default_db?schema=public"
JWT_SECRET="luxon-admin-secret-key-2025-change-in-production"
NODE_ENV="production"
ADMIN_USERNAME="dastan"
ADMIN_PASSWORD="dastan10dz"
ADMIN_EMAIL="admin@luxon.com"
EOF
```

## Шаг 5: Настройка базы данных

```bash
cd /var/www/bingo/admin_nextjs

# Генерируем Prisma клиент
npm run db:generate

# Применяем схему БД
npm run db:push

# Создаем администратора
npm run create-admin
```

## Шаг 6: Сборка приложения

```bash
cd /var/www/bingo/admin_nextjs
npm run build
```

## Шаг 7: Установка и настройка PM2

```bash
# Устанавливаем PM2 глобально
sudo npm install -g pm2

# Запускаем приложение
cd /var/www/bingo/admin_nextjs
pm2 start ecosystem.config.js

# Сохраняем конфигурацию
pm2 save

# Настраиваем автозапуск
pm2 startup
# Выполните команду, которую выведет PM2
```

## Шаг 8: Настройка Nginx

```bash
cd /var/www/bingo/admin_nextjs

# Копируем конфигурацию Nginx
sudo cp nginx.conf /etc/nginx/sites-available/bingo-admin

# Создаем символическую ссылку
sudo ln -sf /etc/nginx/sites-available/bingo-admin /etc/nginx/sites-enabled/

# Удаляем дефолтную конфигурацию (если нужно)
sudo rm -f /etc/nginx/sites-enabled/default

# Проверяем конфигурацию
sudo nginx -t

# Перезапускаем Nginx
sudo systemctl reload nginx
```

## Шаг 9: Получение SSL сертификата

```bash
# Устанавливаем Certbot
sudo apt update
sudo apt install certbot python3-certbot-nginx -y

# Получаем сертификат
sudo certbot --nginx -d fqxgmrzplndwsyvkeu.ru -d www.fqxgmrzplndwsyvkeu.ru
```

## Шаг 10: Проверка работы

```bash
# Проверяем статус PM2
pm2 status

# Проверяем логи
pm2 logs bingo-admin

# Проверяем Nginx
sudo systemctl status nginx

# Проверяем доступность сайта
curl http://localhost:3001
```

## Полезные команды

### Обновление приложения:
```bash
cd /var/www/bingo/admin_nextjs
./deploy.sh
```

### Просмотр логов:
```bash
pm2 logs bingo-admin
pm2 logs bingo-email-watcher
```

### Перезапуск приложения:
```bash
pm2 restart bingo-admin
pm2 restart all
```

### Проверка статуса:
```bash
pm2 status
pm2 monit
```

