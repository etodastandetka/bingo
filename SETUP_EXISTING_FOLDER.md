# Настройка существующей папки /var/www/bingo

## Если у вас уже есть папка с admin_nextjs

### Вариант 1: Инициализировать git в существующей папке (рекомендуется)

```bash
cd /var/www/bingo

# Инициализируйте git
git init

# Добавьте remote
git remote add origin https://github.com/etodastandetka/bingo.git

# Включите sparse checkout (чтобы не скачивать лишнее)
git config core.sparseCheckout true

# Укажите какие папки нужны
echo "admin_nextjs/*" > .git/info/sparse-checkout
echo "payment_site/*" >> .git/info/sparse-checkout
echo "telegram_bot/*" >> .git/info/sparse-checkout
echo "ecosystem.server.config.js" >> .git/info/sparse-checkout
echo "SERVER_SETUP.md" >> .git/info/sparse-checkout

# Получите файлы из репозитория
git fetch origin main
git checkout -b main origin/main

# Если admin_nextjs уже существует, git может спросить что делать
# В этом случае можно сделать:
git checkout main -- payment_site telegram_bot ecosystem.server.config.js SERVER_SETUP.md
```

### Вариант 2: Если admin_nextjs уже есть и вы не хотите его перезаписывать

```bash
cd /var/www/bingo

# Инициализируйте git
git init
git remote add origin https://github.com/etodastandetka/bingo.git

# Включите sparse checkout
git config core.sparseCheckout true

# Укажите только нужные папки (кроме admin_nextjs, если он уже настроен)
echo "payment_site/*" > .git/info/sparse-checkout
echo "telegram_bot/*" >> .git/info/sparse-checkout
echo "ecosystem.server.config.js" >> .git/info/sparse-checkout
echo "SERVER_SETUP.md" >> .git/info/sparse-checkout

# Получите только эти файлы
git fetch origin main
git checkout -b main origin/main

# Если нужно обновить admin_nextjs из репозитория:
echo "admin_nextjs/*" >> .git/info/sparse-checkout
git read-tree -mu HEAD
```

### Вариант 3: Просто добавить недостающие папки вручную

Если admin_nextjs уже настроен и работает, можно просто скачать нужные папки:

```bash
cd /var/www/bingo

# Инициализируйте git
git init
git remote add origin https://github.com/etodastandetka/bingo.git

# Включите sparse checkout
git config core.sparseCheckout true

# Укажите только недостающие папки
echo "payment_site/*" > .git/info/sparse-checkout
echo "telegram_bot/*" >> .git/info/sparse-checkout
echo "ecosystem.server.config.js" >> .git/info/sparse-checkout

# Получите файлы
git fetch origin main
git checkout main -- payment_site telegram_bot ecosystem.server.config.js
```

## После настройки

Теперь вы сможете делать `git pull`:

```bash
cd /var/www/bingo
git pull origin main
```

## Если нужно обновить admin_nextjs из репозитория

```bash
cd /var/www/bingo

# Добавьте admin_nextjs в sparse-checkout
echo "admin_nextjs/*" >> .git/info/sparse-checkout

# Обновите файлы
git read-tree -mu HEAD
git pull origin main
```

## Проверка статуса

```bash
cd /var/www/bingo
git status
git remote -v
```

