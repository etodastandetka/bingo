import os
from dotenv import load_dotenv
from pathlib import Path

# Загружаем .env из текущей директории
env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

class Config:
    BOT_TOKEN = os.getenv('BOT_TOKEN', '')
    API_BASE_URL = os.getenv('API_BASE_URL', 'http://localhost:3001/api')
    PAYMENT_SITE_URL = os.getenv('PAYMENT_SITE_URL', 'http://gldwueprxkmbtqsnva.ru')
    
    # Казино (полный список, фильтрация по настройкам из админки)
    CASINOS = [
        {'id': '1win', 'name': '1win'},
        {'id': '1xbet', 'name': '1xBet'},
        {'id': 'melbet', 'name': 'Melbet'},
        {'id': 'winwin', 'name': 'Winwin'},
        {'id': '1xcasino', 'name': '1xCasino'},
        {'id': '888starz', 'name': '888starz'},
        {'id': 'betwinner', 'name': 'BetWinner'},
        {'id': 'mostbet', 'name': 'mostbet'},
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

