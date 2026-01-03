#!/bin/bash

# Скрипт для настройки Git с Personal Access Token
# Использование: ./setup-git-token.sh

echo "=========================================="
echo "Настройка Git с Personal Access Token"
echo "=========================================="
echo ""

# Проверка что мы в правильной директории
if [ ! -d ".git" ]; then
    echo "❌ Ошибка: .git директория не найдена"
    echo "Перейдите в корень репозитория и запустите скрипт снова"
    exit 1
fi

echo "Текущий remote URL:"
git remote -v
echo ""

echo "Введите ваш GitHub Personal Access Token:"
echo "(Токен не будет отображаться на экране для безопасности)"
read -s GIT_TOKEN

if [ -z "$GIT_TOKEN" ]; then
    echo "❌ Токен не введен. Отмена."
    exit 1
fi

echo ""
echo "Настраиваю git..."

# Метод 1: Встроить токен в URL (удобно для сервера)
GIT_USERNAME="etodastandetka"
git remote set-url origin "https://${GIT_USERNAME}:${GIT_TOKEN}@github.com/etodastandetka/bingo.git"

echo "✅ Remote URL обновлен"
echo ""

# Метод 2: Настроить credential helper (альтернатива)
# git config --global credential.helper store
# echo "https://${GIT_USERNAME}:${GIT_TOKEN}@github.com" > ~/.git-credentials

echo "Проверяю подключение..."
git fetch --dry-run

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Успешно! Git настроен правильно."
    echo ""
    echo "Теперь вы можете использовать:"
    echo "  git pull"
    echo "  git push"
else
    echo ""
    echo "❌ Ошибка при проверке подключения"
    echo "Проверьте:"
    echo "1. Токен правильный и скопирован полностью"
    echo "2. Токен имеет права 'repo' на GitHub"
    echo "3. Репозиторий существует и доступен"
fi

