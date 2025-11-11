import aiohttp
import ssl
from config import Config
from typing import Optional, Dict, Any

# Отключаем проверку SSL для внутренних запросов
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

class APIClient:
    @staticmethod
    async def create_request(
        telegram_user_id: str,
        request_type: str,
        amount: float,
        bookmaker: Optional[str] = None,
        bank: Optional[str] = None,
        phone: Optional[str] = None,
        account_id: Optional[str] = None,
        telegram_username: Optional[str] = None,
        telegram_first_name: Optional[str] = None,
        telegram_last_name: Optional[str] = None,
        receipt_photo: Optional[str] = None,
        withdrawal_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Создать заявку на пополнение или вывод"""
        connector = aiohttp.TCPConnector(ssl=ssl_context)
        async with aiohttp.ClientSession(connector=connector) as session:
            data = {
                'telegram_user_id': str(telegram_user_id),
                'type': request_type,
                'amount': amount,
            }
            
            if bookmaker:
                data['bookmaker'] = bookmaker
            if bank:
                data['bank'] = bank
            if phone:
                data['phone'] = phone
            if account_id:
                data['account_id'] = account_id
            if telegram_username:
                data['telegram_username'] = telegram_username
            if telegram_first_name:
                data['telegram_first_name'] = telegram_first_name
            if telegram_last_name:
                data['telegram_last_name'] = telegram_last_name
            if receipt_photo:
                data['receipt_photo'] = receipt_photo
            if withdrawal_code:
                data['withdrawal_code'] = withdrawal_code
            
            # Пробуем сначала локальный API, если не доступен - используем продакшн
            api_url = Config.API_BASE_URL
            if api_url.startswith('http://localhost'):
                try:
                    async with session.post(
                        f'{api_url}/payment',
                        json=data,
                        timeout=aiohttp.ClientTimeout(total=2)
                    ) as response:
                        return await response.json()
                except:
                    # Если локальный недоступен, используем продакшн
                    api_url = 'https://fqxgmrzplndwsyvkeu.ru/api'
            
            async with session.post(
                f'{api_url}/payment',
                json=data
            ) as response:
                return await response.json()
    
    @staticmethod
    async def generate_qr(amount: float, bank: str) -> Dict[str, Any]:
        """Генерировать QR код для оплаты"""
        connector = aiohttp.TCPConnector(ssl=ssl_context)
        async with aiohttp.ClientSession(connector=connector) as session:
            async with session.post(
                f'{Config.API_BASE_URL}/public/generate-qr',
                json={'amount': amount, 'bank': bank}
            ) as response:
                return await response.json()
    
    @staticmethod
    async def get_payment_settings() -> Dict[str, Any]:
        """Получить настройки платежей из админки"""
        connector = aiohttp.TCPConnector(ssl=ssl_context)
        async with aiohttp.ClientSession(connector=connector) as session:
            try:
                # Пробуем сначала локальный API, если не доступен - используем продакшн
                api_url = Config.API_BASE_URL
                if api_url.startswith('http://localhost'):
                    try:
                        # Проверяем доступность локального API
                        async with session.get(
                            f'{api_url}/public/payment-settings',
                            timeout=aiohttp.ClientTimeout(total=2)
                        ) as test_response:
                            if test_response.status == 200:
                                async with session.get(
                                    f'{api_url}/public/payment-settings'
                                ) as response:
                                    return await response.json()
                    except:
                        # Если локальный недоступен, используем продакшн
                        api_url = 'https://fqxgmrzplndwsyvkeu.ru/api'
                
                async with session.get(
                    f'{api_url}/public/payment-settings'
                ) as response:
                    data = await response.json()
                    return data if data.get('success') else {}
            except Exception as e:
                print(f"Error fetching payment settings: {e}")
                return {}




