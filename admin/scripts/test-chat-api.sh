#!/bin/bash

# Простой тест API для операторского чата
# Использование: ./test-chat-api.sh [USER_ID]

USER_ID=${1:-"123456789"}
API_URL="http://localhost:3000/api"

echo "🧪 Тестирование API операторского чата"
echo "========================================"
echo "User ID: $USER_ID"
echo "API URL: $API_URL"
echo ""

# Тест 1: Сохранение сообщения от пользователя
echo "📨 Тест 1: Сохранение сообщения от пользователя"
echo "----------------------------------------"
curl -X POST "$API_URL/chat-message" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$USER_ID\",
    \"messageText\": \"Тестовое сообщение от пользователя $(date +%H:%M:%S)\",
    \"messageType\": \"text\",
    \"direction\": \"in\",
    \"botType\": \"operator\",
    \"telegramMessageId\": \"$(date +%s)\",
    \"username\": \"test_user\",
    \"firstName\": \"Test\",
    \"lastName\": \"User\"
  }" | jq '.'

echo ""
echo ""

# Тест 2: Проверка CORS
echo "🌐 Тест 2: Проверка CORS (OPTIONS запрос)"
echo "----------------------------------------"
curl -X OPTIONS "$API_URL/chat-message" \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -v 2>&1 | grep -i "access-control"

echo ""
echo ""

echo "✅ Тесты завершены!"










