# Финальные инструкции по исправлению проблем

## Проблемы которые были исправлены:

1. ✅ Редирект на `/dashboard` вместо `/`
2. ✅ Ошибки 404 для CSS/JS файлов
3. ✅ Ошибки 404 для RSC запросов
4. ✅ Добавлены credentials во все fetch запросы
5. ✅ Улучшена обработка ошибок

## Что нужно сделать на сервере:

```bash
cd /var/www/bingo/admin_nextjs

# 1. Обновить код
git pull origin chore-update-admin-15325

# 2. Пересобрать проект (ВАЖНО!)
npm run build

# 3. КРИТИЧНО: Скопировать статические файлы (иначе 404 на CSS/JS)
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
cp -r .next/BUILD_ID .next/standalone/.next/BUILD_ID 2>/dev/null || true

# Копируем все необходимые файлы для standalone режима
if [ -d "public" ]; then
  cp -r public .next/standalone/public
fi

# Копируем server.js и другие необходимые файлы если их нет
if [ ! -f ".next/standalone/server.js" ]; then
  echo "ERROR: server.js not found in standalone directory!"
  echo "Make sure 'output: standalone' is set in next.config.js"
  exit 1
fi

# Проверяем что все файлы на месте
echo "Checking standalone build..."
ls -la .next/standalone/.next/static 2>/dev/null || echo "WARNING: Static files not found!"
ls -la .next/standalone/server.js 2>/dev/null || echo "ERROR: server.js not found!"

# 4. Остановить и удалить старые процессы
pm2 stop bingo-admin
pm2 delete bingo-admin 2>/dev/null || true

# 5. Запустить заново
pm2 start "NODE_ENV=production PORT=3002 node .next/standalone/server.js" --name bingo-admin

# 6. Сохранить и проверить
pm2 save
pm2 logs bingo-admin --lines 50
```

## Что было исправлено в коде:

1. **middleware.ts:**
   - Добавлена проверка RSC запросов (`?rsc=...`) - они теперь пропускаются без авторизации
   - Улучшен matcher для исключения статических файлов

2. **app/page.tsx:**
   - Изменен `router.push()` на `router.replace()` для более надежного редиректа

3. **Все fetch запросы:**
   - Добавлен `credentials: 'include'` для отправки cookies
   - Добавлена проверка статуса ответа
   - Добавлен редирект на `/login` при 401 ошибке

4. **next.config.js:**
   - Добавлен `output: 'standalone'` для работы с PM2

## После выполнения команд:

- ✅ Редирект на `/dashboard` должен работать
- ✅ CSS и JS должны загружаться (без 404)
- ✅ RSC запросы должны проходить (без 404)
- ✅ Данные должны загружаться с API
- ✅ Стили должны применяться

## Если проблемы остаются:

1. Откройте консоль браузера (F12) и проверьте ошибки
2. Проверьте логи PM2: `pm2 logs bingo-admin --lines 100`
3. Убедитесь, что статические файлы скопированы: `ls -la .next/standalone/.next/static`
4. Проверьте, что процесс запущен: `pm2 status`

