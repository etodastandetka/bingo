import aiohttp
from config import Config
from typing import Optional, Dict, Any

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
        async with aiohttp.ClientSession() as session:
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
            
            async with session.post(
                f'{Config.API_BASE_URL}/payment',
                json=data
            ) as response:
                return await response.json()
    
    @staticmethod
    async def generate_qr(amount: float, bank: str) -> Dict[str, Any]:
        """Генерировать QR код для оплаты"""
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f'{Config.API_BASE_URL}/public/generate-qr',
                json={'amount': amount, 'bank': bank}
            ) as response:
                return await response.json()
    
    @staticmethod
    async def get_payment_settings() -> Dict[str, Any]:
        """Получить настройки платежей из админки"""
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(
                    f'{Config.API_BASE_URL}/public/payment-settings'
                ) as response:
                    data = await response.json()
                    return data if data.get('success') else {}
            except Exception as e:
                print(f"Error fetching payment settings: {e}")
                return {}




