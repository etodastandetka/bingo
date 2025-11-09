# Обновление без перезаписи admin_nextjs

## Проверка текущего состояния

```bash
cd /var/www/bingo
ls -la
```

## Если admin_nextjs уже настроен и работает

### Вариант 1: Исключить admin_nextjs из sparse checkout

```bash
cd /var/www/bingo

# Убедитесь, что admin_nextjs НЕ в sparse-checkout
cat .git/info/sparse-checkout

# Если admin_nextjs там есть, удалите его
echo "payment_site/*" > .git/info/sparse-checkout
echo "telegram_bot/*" >> .git/info/sparse-checkout
echo "ecosystem.server.config.js" >> .git/info/sparse-checkout

# Обновите рабочую директорию (admin_nextjs не тронет)
git read-tree -mu HEAD
```

### Вариант 2: Если admin_nextjs уже был перезаписан

Если git уже перезаписал admin_nextjs, можно восстановить из бэкапа или настроить заново. Но лучше проверить:

```bash
cd /var/www/bingo/admin_nextjs

# Проверьте, что файлы на месте
ls -la

# Проверьте .env файл
cat .env

# Если .env есть и настройки правильные - все ок
# Если нет - нужно будет настроить заново
```

## Правильная настройка sparse checkout (без admin_nextjs)

```bash
cd /var/www/bingo

# Убедитесь, что admin_nextjs НЕ включен в sparse-checkout
echo "payment_site/*" > .git/info/sparse-checkout
echo "telegram_bot/*" >> .git/info/sparse-checkout
echo "ecosystem.server.config.js" >> .git/info/sparse-checkout
echo "SERVER_SETUP.md" >> .git/info/sparse-checkout

# Обновите файлы (admin_nextjs не тронет)
git read-tree -mu HEAD
```

## Обновление в будущем (только нужные папки)

```bash
cd /var/www/bingo

# Обновить только payment_site и telegram_bot
git pull origin main

# Или если нужно обновить только одну папку:
git checkout main -- payment_site
git checkout main -- telegram_bot
```

## Если нужно обновить admin_nextjs вручную (когда будете готовы)

```bash
cd /var/www/bingo

# Добавьте admin_nextjs в sparse-checkout
echo "admin_nextjs/*" >> .git/info/sparse-checkout

# Обновите файлы
git read-tree -mu HEAD
git pull origin main

# Затем обновите зависимости
cd admin_nextjs
npm install
npm run build
```

## Проверка что admin_nextjs не тронут

```bash
cd /var/www/bingo

# Проверьте статус git
git status

# Проверьте что admin_nextjs не в списке изменений
# Если он там - значит git его не трогает (это хорошо)
```

