# Конфигурация доменов

Все домены и настройки централизованы в файле `domains.json` в корне проекта.

## Структура domains.json

```json
{
  "domains": {
    "admin": "https://gdsfafdsdf.me",           // Домен админ-панели
    "admin_api": "https://gdsfafdsdf.me/api",   // API админ-панели
    "payment": "https://erwerewrew.me"          // Домен формы оплаты
  },
  "ports": {
    "admin": 3001,      // Порт админ-панели
    "payment": 3002     // Порт формы оплаты
  },
  "local": {
    "admin": "http://localhost:3001",
    "admin_api": "http://localhost:3001/api",
    "payment": "http://localhost:3002"
  },
  "fallback": {
    "admin_api": "https://gdsfafdsdf.me/api",   // Fallback для API
    "payment": "https://erwerewrew.me"          // Fallback для оплаты
  }
}
```

## Как изменить домены

1. Откройте файл `domains.json` в корне проекта
2. Измените нужные домены в секции `domains` и `fallback`
3. Перезапустите все сервисы через PM2:
   ```bash
   pm2 restart all
   ```

## Где используются домены

- **telegram_bot/** - основной бот
- **telegram_bot_1xbet/** - бот для 1xbet
- **telegram_bot_mostbet/** - бот для mostbet
- **payment_site/** - форма оплаты
- **admin/** - админ-панель (использует переменные окружения из .env)

## Приоритет настроек

1. Переменные окружения (.env файлы) - имеют наивысший приоритет
2. domains.json - используется если переменные окружения не заданы
3. Значения по умолчанию (localhost) - если ничего не задано

## Пример изменения доменов

Если нужно изменить домен админки на `example.com`:

```json
{
  "domains": {
    "admin": "https://example.com",
    "admin_api": "https://example.com/api",
    ...
  },
  "fallback": {
    "admin_api": "https://example.com/api",
    ...
  }
}
```

После изменения перезапустите все сервисы.

