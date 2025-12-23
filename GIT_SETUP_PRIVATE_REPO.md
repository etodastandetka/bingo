# Настройка Git для приватного репозитория

## Проблема
GitHub больше не поддерживает аутентификацию по паролю. Нужно использовать Personal Access Token (PAT) или SSH.

## Решение 1: Personal Access Token (PAT) - РЕКОМЕНДУЕТСЯ

### Шаг 1: Создайте токен на GitHub

1. Перейдите: https://github.com/settings/tokens
2. Нажмите "Generate new token" → "Generate new token (classic)"
3. Заполните:
   - **Note**: `Bingo Bot Server`
   - **Expiration**: Выберите срок (например, 90 дней или No expiration)
   - **Select scopes**: Отметьте `repo` (полный доступ к приватным репозиториям)
4. Нажмите "Generate token"
5. **ВАЖНО**: Скопируйте токен сразу! Он больше не будет показан!

### Шаг 2: Используйте токен на сервере

**Вариант А: Вводить каждый раз**
- При `git pull` или `git push`:
  - Username: `etodastandetka`
  - Password: вставьте ваш токен (не пароль от GitHub!)

**Вариант Б: Сохранить токен (удобнее)**

На сервере выполните:
```bash
# Настройте credential helper для сохранения
git config --global credential.helper store

# Сделайте git pull и введите логин и токен один раз
git pull
# Username: etodastandetka
# Password: [ваш_токен]

# Теперь токен сохранён, больше вводить не нужно
```

**Вариант В: Встроить токен в URL (не рекомендуется, но работает)**

```bash
git remote set-url origin https://etodastandetka:ВАШ_ТОКЕН@github.com/etodastandetka/bingo.git
```

⚠️ **ВНИМАНИЕ**: Токен будет виден в git config! Лучше использовать credential helper.

## Решение 2: SSH ключи

### Шаг 1: Добавьте SSH ключ на GitHub

1. На сервере проверьте наличие SSH ключа:
```bash
cat ~/.ssh/id_rsa.pub
# или
cat ~/.ssh/id_ed25519.pub
```

2. Если ключа нет, создайте:
```bash
ssh-keygen -t ed25519 -C "bingo_bot_server"
# Нажмите Enter для всех вопросов (или укажите путь)
```

3. Скопируйте публичный ключ:
```bash
cat ~/.ssh/id_ed25519.pub
```

4. Добавьте на GitHub:
   - https://github.com/settings/keys
   - New SSH key
   - Title: `Bingo Bot Server`
   - Key: вставьте публичный ключ
   - Add SSH key

### Шаг 2: Переключите репозиторий на SSH

На сервере в папке проекта:
```bash
cd /var/www/bingo_bot
git remote set-url origin git@github.com:etodastandetka/bingo.git
git remote -v  # проверьте что изменилось
```

Теперь `git pull` и `git push` будут работать без ввода пароля/токена!

## Проверка

```bash
git pull
# Должно работать без ошибок аутентификации
```

