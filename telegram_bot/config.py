import os
from dotenv import load_dotenv
from pathlib import Path

# Загружаем .env из текущей директории
env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

class Config:
    BOT_TOKEN = os.getenv('BOT_TOKEN', '')
    # Для API: используем локальный для разработки, продакшн для деплоя
    API_BASE_URL = os.getenv('API_BASE_URL', 'http://localhost:3001/api')
    # Для WebApp: всегда используем HTTPS домен (Telegram требует HTTPS)
    # Для локальной разработки используем продакшн домен
    _payment_site_url = os.getenv('PAYMENT_SITE_URL', 'https://gldwueprxkmbtqsnva.ru')
    # Принудительно используем HTTPS для WebApp (Telegram требует HTTPS)
    if _payment_site_url.startswith('http://'):
        # Если указан HTTP, заменяем на HTTPS или используем продакшн домен
        if 'localhost' in _payment_site_url:
            PAYMENT_SITE_URL = 'https://gldwueprxkmbtqsnva.ru'
        else:
            PAYMENT_SITE_URL = _payment_site_url.replace('http://', 'https://')
    else:
        PAYMENT_SITE_URL = _payment_site_url
    
    # Казино (полный список, фильтрация по настройкам из админки)
    CASINOS = [
        {'id': '1xbet', 'name': '1xBet'},
        {'id': 'melbet', 'name': 'Melbet'},
        {'id': '1win', 'name': '1win'},
        {'id': 'mostbet', 'name': 'mostbet'},
        {'id': 'winwin', 'name': 'Winwin'},
        {'id': '888starz', 'name': '888starz'},
        {'id': '1xcasino', 'name': '1xCasino'},
        {'id': 'betwinner', 'name': 'BetWinner'},
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

