import os
from dotenv import load_dotenv
from pathlib import Path

# Загружаем .env из текущей директории
env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

class Config:
    # Токен для бота Mostbet (используйте BOT_TOKEN_MOSTBET или общий BOT_TOKEN)
    BOT_TOKEN = os.getenv('BOT_TOKEN_MOSTBET', os.getenv('BOT_TOKEN', '8429532056:AAHtQb0cuwwYhYLJI9bIi--_EYdFNeJXGNo'))
    OPERATOR_BOT_TOKEN = os.getenv('OPERATOR_BOT_TOKEN', '8279477654:AAHZHyx5Ez_qeOYx610ayISgHhtz9Uy7F_0')
    # Для API: используем localhost для разработки
    API_BASE_URL = os.getenv('API_BASE_URL', 'http://localhost:3001/api')
    # Для WebApp: Telegram требует HTTPS, поэтому используем продакшн домен
    # Для локальной разработки можно использовать ngrok или оставить продакшн URL
    _payment_site_url = os.getenv('PAYMENT_SITE_URL', 'http://localhost:3003')
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
    
    # Казино (только Mostbet для этого бота)
    CASINOS = [
        {'id': 'mostbet', 'name': 'Mostbet'},
    ]
    
    # Банки для пополнения
    DEPOSIT_BANKS = [
        {'id': 'mbank', 'name': 'Mbank'},
        {'id': 'omoney', 'name': 'О деньги'},
        {'id': 'bakai', 'name': 'BAKAI'},
        {'id': 'megapay', 'name': 'MEGApay'},
    ]
    
    # Банки для вывода
    WITHDRAW_BANKS = [
        {'id': 'mbank', 'name': 'Mbank'},
        {'id': 'omoney', 'name': 'О деньги'},
        {'id': 'kompanion', 'name': 'Компаньон'},
        {'id': 'balance', 'name': 'Balance.Kg'},
        {'id': 'bakai', 'name': 'Bakai'},
        {'id': 'optima', 'name': 'Оптима'},
    ]
    
    # Лимиты
    DEPOSIT_MIN = 100
    DEPOSIT_MAX = 100000
    
    # Канал и поддержка
    CHANNEL = '@bingokg_news'
    SUPPORT = '@bingokg_boss'
    
    # Языки
    LANGUAGES = [
        {'code': 'ru', 'name': '🇷🇺 Русский'},
        {'code': 'ky', 'name': '🇰🇬 Кыргызча'},
    ]

