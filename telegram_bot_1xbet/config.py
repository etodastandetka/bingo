import os
import json
from dotenv import load_dotenv
from pathlib import Path

# Загружаем .env из admin/.env (основной файл с токенами)
# Сначала пробуем admin/.env, потом текущую директорию
admin_env_path = Path(__file__).parent.parent / 'admin' / '.env'
local_env_path = Path(__file__).parent / '.env'

# Загружаем admin/.env если существует, иначе локальный
if admin_env_path.exists():
    load_dotenv(dotenv_path=admin_env_path, override=True)
elif local_env_path.exists():
    load_dotenv(dotenv_path=local_env_path, override=True)
else:
    # Если ни один .env не найден, просто загружаем из окружения
    load_dotenv()

# Загружаем конфигурацию доменов из корня проекта
def load_domains_config():
    """Загружает конфигурацию доменов из domains.json"""
    try:
        # Путь к domains.json в корне проекта (на уровень выше telegram_bot_1xbet)
        domains_path = Path(__file__).parent.parent / 'domains.json'
        if domains_path.exists():
            with open(domains_path, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        print(f"Warning: Could not load domains.json: {e}")
    return None

# Загружаем конфигурацию доменов
domains_config = load_domains_config()

class Config:
    # Токены читаются ТОЛЬКО из .env файла (admin/.env)
    # Если токен не найден - будет ошибка при запуске
    # Для 1xbet используется BOT_TOKEN_1XBET или BOT_TOKEN
    BOT_TOKEN = os.getenv('BOT_TOKEN_1XBET') or os.getenv('BOT_TOKEN') or None
    OPERATOR_BOT_TOKEN = os.getenv('OPERATOR_BOT_TOKEN') or None
    BOT_TYPE = '1xbet'  # Тип бота для определения правильного токена при отправке уведомлений
    
    # Для API: используем конфиг из domains.json или .env, иначе localhost
    if domains_config and 'domains' in domains_config:
        API_BASE_URL = os.getenv('API_BASE_URL', domains_config['domains'].get('admin_api', 'http://localhost:3001/api'))
        _payment_site_url = os.getenv('PAYMENT_SITE_URL', domains_config['domains'].get('payment', 'http://localhost:3002'))
    else:
        API_BASE_URL = os.getenv('API_BASE_URL', 'http://localhost:3001/api')
        _payment_site_url = os.getenv('PAYMENT_SITE_URL', 'http://localhost:3002')
    
    # Fallback URL для API (если localhost недоступен)
    if domains_config and 'fallback' in domains_config:
        API_FALLBACK_URL = domains_config['fallback'].get('admin_api', 'https://gdsfafdsdf.me/api')
        PAYMENT_FALLBACK_URL = domains_config['fallback'].get('payment', 'https://erwerewrew.me')
    else:
        API_FALLBACK_URL = 'https://gdsfafdsdf.me/api'
        PAYMENT_FALLBACK_URL = 'https://erwerewrew.me'
    
    # Для WebApp: Telegram требует HTTPS, поэтому используем продакшн домен
    # Для локальной разработки можно использовать ngrok или оставить продакшн URL
    # Для localhost принудительно используем http (не https)
    if 'localhost' in _payment_site_url.lower():
        # Убираем https если есть и заменяем на http
        _payment_site_url = _payment_site_url.replace('https://', 'http://')
        if not _payment_site_url.startswith('http://'):
            _payment_site_url = 'http://' + _payment_site_url.replace('http://', '')
        PAYMENT_SITE_URL = _payment_site_url
    elif _payment_site_url.startswith('http://'):
        PAYMENT_SITE_URL = _payment_site_url.replace('http://', 'https://')
    else:
        PAYMENT_SITE_URL = _payment_site_url
    
    # Казино (только 1xbet для этого бота)
    CASINOS = [
        {'id': '1xbet', 'name': '1xBet'},
    ]
    
    # Банки для пополнения
    DEPOSIT_BANKS = [
        {'id': 'mbank', 'name': 'Mbank'},
        {'id': 'demir', 'name': 'DemirBank'},
        {'id': 'balance', 'name': 'Balance.kg'},
        {'id': 'omoney', 'name': 'О банк'},
        {'id': 'megapay', 'name': 'MEGApay'},
        {'id': 'bakai', 'name': 'BAKAI'},
    ]
    
    # Банки для вывода (ID должны совпадать с настройками в админке)
    WITHDRAW_BANKS = [
        {'id': 'kompanion', 'name': 'Компаньон'},
        {'id': 'odengi', 'name': 'О банк'},
        {'id': 'bakai', 'name': 'Bakai'},
        {'id': 'balance', 'name': 'Balance.kg'},
        {'id': 'megapay', 'name': 'MegaPay'},
        {'id': 'mbank', 'name': 'MBank'},
    ]
    
    # Лимиты
    DEPOSIT_MIN = 100
    DEPOSIT_MAX = 100000
    
    # Канал и поддержка
    CHANNEL = '@bingokg_news'
    SUPPORT = '@helperbingo_bot'
    
    # Языки
    LANGUAGES = [
        {'code': 'ru', 'name': '🇷🇺 Русский'},
        {'code': 'ky', 'name': '🇰🇬 Кыргызча'},
        {'code': 'uz', 'name': '🇺🇿 O\'zbekcha'},
    ]

