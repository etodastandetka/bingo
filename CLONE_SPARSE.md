# Клонирование только нужных папок (Sparse Checkout)

## Вариант 1: Клонирование с sparse checkout (рекомендуется)

```bash
# Создайте папку и инициализируйте git
mkdir /var/www/bingo
cd /var/www/bingo
git init

# Добавьте remote
git remote add origin https://github.com/etodastandetka/bingo.git

# Включите sparse checkout
git config core.sparseCheckout true

# Укажите какие папки нужны
echo "admin_nextjs/*" >> .git/info/sparse-checkout
echo "payment_site/*" >> .git/info/sparse-checkout
echo "telegram_bot/*" >> .git/info/sparse-checkout
echo "ecosystem.server.config.js" >> .git/info/sparse-checkout
echo "SERVER_SETUP.md" >> .git/info/sparse-checkout

# Получите файлы
git pull origin main
```

## Вариант 2: Клонирование в текущую папку (если уже есть папка)

```bash
cd /var/www/bingo

# Если уже есть git репозиторий
git config core.sparseCheckout true

# Очистите sparse-checkout и добавьте нужные папки
echo "admin_nextjs/*" > .git/info/sparse-checkout
echo "payment_site/*" >> .git/info/sparse-checkout
echo "telegram_bot/*" >> .git/info/sparse-checkout
echo "ecosystem.server.config.js" >> .git/info/sparse-checkout
echo "SERVER_SETUP.md" >> .git/info/sparse-checkout

# Обновите рабочую директорию
git read-tree -mu HEAD
```

## Вариант 3: Клонирование только одной ветки (быстрее)

```bash
cd /var/www
git clone --depth 1 --filter=blob:none --sparse https://github.com/etodastandetka/bingo.git bingo
cd bingo
git sparse-checkout set admin_nextjs payment_site telegram_bot ecosystem.server.config.js SERVER_SETUP.md
```

## После клонирования

```bash
cd /var/www/bingo

# Обновите зависимости
cd admin_nextjs && npm install && npm run build && cd ..
cd payment_site && pip3 install -r requirements.txt && cd ..
cd telegram_bot && pip3 install -r requirements.txt && cd ..

# Запустите через PM2 (используйте ecosystem.server.config.js)
pm2 start ecosystem.server.config.js
pm2 save
```

## Обновление в будущем

Просто делайте `git pull` как обычно - будут обновляться только выбранные папки:

```bash
cd /var/www/bingo
git pull origin main
```

