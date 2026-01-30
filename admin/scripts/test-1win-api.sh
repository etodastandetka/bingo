#!/bin/bash

# Тестовый скрипт для проверки API 1win
# Использование: ./test-1win-api.sh <userId> <amount> [apiKey]

API_KEY="${3:-0ad11eda9f40c2e05c34dc81c24ebe7f53eabe606c6cc5e553cfe66cd7fa9c8e}"
USER_ID="${1:-344004879}"
AMOUNT="${2:-5000.31}"

echo "🔍 Тестирую API 1win..."
echo "   User ID: $USER_ID"
echo "   Amount: $AMOUNT"
echo "   API Key: ${API_KEY:0:20}..."
echo ""

curl -X POST https://api.1win.win/v1/client/deposit \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: $API_KEY" \
  -d "{
    \"userId\": $USER_ID,
    \"amount\": $AMOUNT
  }" \
  -w "\n\nHTTP Status: %{http_code}\n"



























