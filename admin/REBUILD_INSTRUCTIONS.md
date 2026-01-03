# Инструкция по исправлению ошибки "Failed to find Server Action"

Если вы видите ошибку `Failed to find Server Action "x"`, выполните следующие шаги:

## На сервере (Linux):

```bash
cd /var/www/bingo_bot/admin

# 1. Остановите приложение
pm2 stop bingo-admin

# 2. Очистите кэш Next.js
rm -rf .next

# 3. Пересоберите приложение
npm run build

# 4. Перезапустите приложение
pm2 restart bingo-admin

# 5. Проверьте логи
pm2 logs bingo-admin --lines 50
```

## Альтернативный способ (одной командой):

```bash
cd /var/www/bingo_bot/admin && pm2 stop bingo-admin && rm -rf .next && npm run build && pm2 restart bingo-admin
```

## Если проблема сохраняется:

1. **Очистите кэш браузера** - нажмите Ctrl+Shift+Delete и очистите кэш
2. **Используйте жесткую перезагрузку** - Ctrl+F5 или Cmd+Shift+R
3. **Проверьте версию Next.js** - должна быть 14.2.4
4. **Переустановите зависимости** (если нужно):
   ```bash
   cd /var/www/bingo_bot/admin
   rm -rf node_modules package-lock.json
   npm install
   npm run build
   pm2 restart bingo-admin
   ```

## Причина ошибки:

Эта ошибка возникает когда:
- Кэш Next.js устарел после пересборки
- Старая версия клиента пытается использовать новый сервер
- Произошла рассинхронизация между клиентом и сервером

Решение - полная очистка кэша и пересборка.

