# Инструкция по клонированию репозитория

## Проблема: Permission denied (publickey)

Если вы получили ошибку `Permission denied (publickey)` при попытке клонировать через SSH, используйте HTTPS вместо SSH.

## Решение: Использовать HTTPS

```bash
cd /var/www/bingo

# Клонируем через HTTPS (не требует SSH ключей)
git clone https://github.com/etodastandetka/bingo.git admin_nextjs

cd admin_nextjs
```

## Альтернатива: Настроить SSH ключ (если нужно)

Если вы хотите использовать SSH в будущем:

### 1. Генерируем SSH ключ:

```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
# Нажмите Enter для всех вопросов (или укажите путь и пароль)
```

### 2. Показываем публичный ключ:

```bash
cat ~/.ssh/id_ed25519.pub
```

### 3. Добавляем ключ в GitHub:

1. Скопируйте вывод команды выше
2. Перейдите на GitHub: https://github.com/settings/keys
3. Нажмите "New SSH key"
4. Вставьте ключ и сохраните

### 4. Тестируем подключение:

```bash
ssh -T git@github.com
```

### 5. Клонируем репозиторий:

```bash
cd /var/www/bingo
git clone git@github.com:etodastandetka/bingo.git admin_nextjs
```

## Рекомендация

Для быстрого старта используйте **HTTPS** - это проще и не требует настройки ключей.

