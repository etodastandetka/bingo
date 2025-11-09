# Настройка .env файлов

## 1. Для бота: `/var/www/bingo/telegram_bot/.env`

```bash
cd /var/www/bingo/telegram_bot
nano .env
```

Содержимое:
```env
BOT_TOKEN=ваш_токен_бота_здесь
API_BASE_URL=https://fqxgmrzplndwsyvkeu.ru/api
PAYMENT_SITE_URL=https://gldwueprxkmbtqsnva.ru
```

## 2. Для админки: `/var/www/bingo/admin_nextjs/.env`

```bash
cd /var/www/bingo/admin_nextjs
nano .env
```

Содержимое:
```env
DATABASE_URL=postgresql://gen_user:dastan10dz@92.51.38.85:5432/default_db
BOT_TOKEN=ваш_токен_бота_здесь
NEXTAUTH_SECRET=сгенерируйте_случайную_строку_здесь
NODE_ENV=production
PORT=3002
```

Для генерации `NEXTAUTH_SECRET`:
```bash
openssl rand -base64 32
```

## 3. Для формы оплаты: `/var/www/bingo/payment_site/.env`

```bash
cd /var/www/bingo/payment_site
nano .env
```

Содержимое:
```env
API_BASE_URL=https://fqxgmrzplndwsyvkeu.ru/api
FLASK_ENV=production
PORT=3003
```

## Быстрая команда для создания всех файлов:

```bash
# Бот
cd /var/www/bingo/telegram_bot
cat > .env << 'EOF'
BOT_TOKEN=ваш_токен_бота_здесь
API_BASE_URL=https://fqxgmrzplndwsyvkeu.ru/api
PAYMENT_SITE_URL=https://gldwueprxkmbtqsnva.ru
EOF

# Админка
cd /var/www/bingo/admin_nextjs
cat > .env << 'EOF'
DATABASE_URL=postgresql://gen_user:dastan10dz@92.51.38.85:5432/default_db
BOT_TOKEN=ваш_токен_бота_здесь
NEXTAUTH_SECRET=сгенерируйте_случайную_строку
NODE_ENV=production
PORT=3002
EOF

# Форма оплаты
cd /var/www/bingo/payment_site
cat > .env << 'EOF'
API_BASE_URL=https://fqxgmrzplndwsyvkeu.ru/api
FLASK_ENV=production
PORT=3003
EOF
```

## Важно:

1. **Замените `ваш_токен_бота_здесь`** на реальный токен бота из @BotFather
2. **Сгенерируйте `NEXTAUTH_SECRET`** командой: `openssl rand -base64 32`
3. **Проверьте права доступа** (файлы должны быть доступны только root):
```bash
chmod 600 /var/www/bingo/telegram_bot/.env
chmod 600 /var/www/bingo/admin_nextjs/.env
chmod 600 /var/www/bingo/payment_site/.env
```

## После создания .env файлов:

```bash
# Перезапустите все через PM2
pm2 restart all

# Проверьте логи
pm2 logs
```

