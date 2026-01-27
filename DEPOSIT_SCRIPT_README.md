# Скрипт пополнения баланса 1xBet

Скрипт `deposit_1xbet.py` позволяет пополнять баланс игроков 1xBet напрямую через Cashdesk API.

## Установка зависимостей

```bash
pip install requests
```

## Использование

### Способ 1: С аргументами командной строки

```bash
python deposit_1xbet.py <account_id> <amount>
```

Пример:
```bash
python deposit_1xbet.py 1510414355 500
```

### Способ 2: Интерактивный режим

```bash
python deposit_1xbet.py
```

Скрипт запросит:
- ID счета 1xBet
- Сумму пополнения (в KGS)

## Настройка API

По умолчанию скрипт использует предустановленные значения API. Для использования других учетных данных можно задать переменные окружения:

```bash
export XBET_HASH="ваш_hash"
export XBET_CASHIERPASS="ваш_пароль"
export XBET_LOGIN="ваш_логин"
export XBET_CASHDESKID="ваш_cashdesk_id"
```

Или изменить значения по умолчанию в файле `deposit_1xbet.py`:

```python
DEFAULT_HASH = 'ваш_hash'
DEFAULT_CASHIERPASS = 'ваш_пароль'
DEFAULT_LOGIN = 'ваш_логин'
DEFAULT_CASHDESKID = 'ваш_cashdesk_id'
```

## Примеры использования

### Пример 1: Пополнение на 1000 KGS
```bash
python deposit_1xbet.py 1510414355 1000
```

### Пример 2: Интерактивный режим
```bash
python deposit_1xbet.py
# Введите ID счета 1xBet: 1510414355
# Введите сумму пополнения (KGS): 500
```

## Формат ответа

При успешном пополнении:
```
✅ Баланс успешно пополнен!
```

При ошибке:
```
❌ [Описание ошибки]
```

## Примечания

- ID счета - это ID игрока в 1xBet (account_id), а не Telegram ID
- Сумма указывается в сомах (KGS)
- Минимальная сумма зависит от настроек 1xBet API
- Скрипт использует те же алгоритмы генерации подписи, что и основная система






