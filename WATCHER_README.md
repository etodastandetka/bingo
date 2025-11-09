# Email Watcher для автопополнения

## Описание

Email Watcher автоматически читает письма от банков (Demirbank, Optima, MBank, MegaPay, Bakai) через IMAP, извлекает информацию о входящих платежах и автоматически пополняет баланс игроков в казино при совпадении суммы с pending заявками.

## Настройка

### 1. Настройки в базе данных (`BotSetting`)

Создайте записи в таблице `bot_settings` с следующими ключами:

```sql
-- Включить автопополнение
INSERT INTO bot_settings (key, value) VALUES ('autodeposit_enabled', '1');

-- IMAP сервер (по умолчанию для Timeweb: imap.timeweb.ru)
INSERT INTO bot_settings (key, value) VALUES ('autodeposit_imap', 'imap.timeweb.ru');

-- Папка для проверки (обычно INBOX)
INSERT INTO bot_settings (key, value) VALUES ('autodeposit_folder', 'INBOX');

-- Банк (DEMIRBANK, OPTIMA, MBANK, MEGAPAY, BAKAI)
INSERT INTO bot_settings (key, value) VALUES ('autodeposit_bank', 'DEMIRBANK');

-- Интервал проверки в секундах (по умолчанию 60)
INSERT INTO bot_settings (key, value) VALUES ('autodeposit_interval_sec', '60');
```

### 2. Email и пароль

Email и пароль берутся из **активного реквизита** (`BotRequisite` с `isActive = true`).

Если в реквизите нет email/password, они берутся из настроек:
```sql
INSERT INTO bot_settings (key, value) VALUES ('autodeposit_email', 'your-email@domain.com');
INSERT INTO bot_settings (key, value) VALUES ('autodeposit_password', 'your-password');
```

### 3. IMAP настройки для Timeweb

Для почтовых ящиков Timeweb используйте следующие настройки:

- **IMAP сервер**: `imap.timeweb.ru`
- **Порт SSL**: `993`
- **Шифрование**: TLS/SSL

Эти настройки уже установлены по умолчанию в watcher.

## Запуск

### Постоянный запуск (рекомендуется)

```bash
npm run watcher
```

Watcher будет работать непрерывно, проверяя новые письма каждые N секунд (задается в `autodeposit_interval_sec`).

### Одноразовая проверка

```bash
npm run watcher:check
```

Проверит письма один раз и завершится.

## Как это работает

1. **Watcher подключается к IMAP** и ищет непрочитанные письма
2. **Парсит каждое письмо** и извлекает:
   - Сумму платежа
   - Дату и время платежа
   - Банк (определяется автоматически или по настройке)
3. **Сохраняет платеж** в таблицу `IncomingPayment`
4. **Ищет совпадение** с pending заявками:
   - Ищет заявки со статусом `pending`
   - С точно такой же суммой (точность до копейки)
   - Созданные за последние 5 минут
5. **При совпадении**:
   - Автоматически пополняет баланс игрока в казино через API
   - Обновляет статус заявки на `autodeposit_success`
   - Связывает платеж с заявкой
6. **Помечает письмо как прочитанное**

## Пример письма от Demirbank

```
Уважаемый(ая) ИЛЬЯЗ БАТЫРКУЛОВ,

Вам поступил перевод с помощью QR-платежа на сумму 10.00 KGS от 03.11.2025 19:11:07.

С уважением,
ЗАО "Демир Кыргыз Интернэшнл Банк"
```

Парсер извлечет:
- **Amount**: 10.00
- **DateTime**: 2025-11-03T19:11:07
- **Bank**: demirbank

## Логи

Watcher выводит подробные логи в консоль:

- `📧 Parsed email: demirbank, amount: 10, date: 2025-11-03T19:11:07`
- `✅ IncomingPayment saved: ID 123`
- `🔍 Found matching request: ID 456, Account: 1219358907, Bookmaker: 1xbet`
- `✅ Auto-deposit successful: Request 456, Account 1219358907`
- `⚠️ No matching request found for payment 123 (amount: 10)`

## Устранение неполадок

### Watcher не запускается

- Проверьте наличие всех настроек в `BotSetting`
- Убедитесь, что `autodeposit_enabled = '1'`
- Проверьте, что email и password настроены (в реквизите или в настройках)

### Не читает письма

- Проверьте правильность IMAP хоста и порта
- Убедитесь, что email и пароль верны
- Проверьте, что в почтовом ящике есть непрочитанные письма
- Для Gmail может потребоваться включить "Less secure app access" или использовать App Password

### Письма парсятся, но не находится совпадение

- Убедитесь, что сумма в письме **точно** совпадает с суммой в заявке (до копейки)
- Проверьте, что заявка создана не более 5 минут назад
- Проверьте, что заявка имеет статус `pending`

### Автопополнение не работает

- Проверьте логи - должна быть ошибка от API казино
- Убедитесь, что настройки API казино (hash, login, cashierpass и т.д.) правильно настроены в `BotConfiguration`
- В случае ошибки API казино, статус заявки будет обновлен на `profile-5`

## Запуск как сервис (PM2)

Для production можно запустить watcher через PM2:

```bash
pm2 start npm --name "email-watcher" -- run watcher
pm2 save
pm2 startup
```

Или создать `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'email-watcher',
      script: 'npm',
      args: 'run watcher',
      cwd: '/path/to/admin_nextjs',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
    }
  ]
}
```

Запуск:
```bash
pm2 start ecosystem.config.js
```


