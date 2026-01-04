import aiohttp
import asyncio
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
        uncreated_request_id: Optional[str] = None,
        bot_type: Optional[str] = None,
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
            if uncreated_request_id:
                data['uncreated_request_id'] = uncreated_request_id
            if bot_type:
                data['bot_type'] = bot_type
            
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
                    api_url = Config.API_FALLBACK_URL
            
            async with session.post(
                f'{api_url}/payment',
                json=data
            ) as response:
                return await response.json()
    
    @staticmethod
    async def generate_qr(amount: float, bank: str = 'omoney') -> Dict[str, Any]:
        """Генерировать QR hash и ссылки на банки"""
        connector = aiohttp.TCPConnector(ssl=ssl_context)
        async with aiohttp.ClientSession(connector=connector) as session:
            # Пробуем сначала локальный API, если не доступен - используем продакшн
            api_url = Config.API_BASE_URL
            if api_url.startswith('http://localhost'):
                try:
                    async with session.post(
                        f'{api_url}/public/generate-qr',
                        json={'amount': amount, 'bank': bank},
                        timeout=aiohttp.ClientTimeout(total=5)
                    ) as response:
                        return await response.json()
                except:
                    # Если локальный недоступен, используем продакшн
                    api_url = Config.API_FALLBACK_URL
            
            async with session.post(
                f'{api_url}/public/generate-qr',
                json={'amount': amount, 'bank': bank}
            ) as response:
                return await response.json()
    
    @staticmethod
    async def create_uncreated_request(
        telegram_user_id: str,
        bookmaker: str,
        account_id: str,
        amount: float,
        telegram_username: Optional[str] = None,
        telegram_first_name: Optional[str] = None,
        telegram_last_name: Optional[str] = None,
        bank: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Создать несозданную заявку (при показе QR кода)"""
        connector = aiohttp.TCPConnector(ssl=ssl_context)
        async with aiohttp.ClientSession(connector=connector) as session:
            data = {
                'userId': str(telegram_user_id),
                'bookmaker': bookmaker,
                'accountId': account_id,
                'amount': amount,
                'requestType': 'deposit',
            }
            
            if bank:
                data['bank'] = bank
            if telegram_username:
                data['username'] = telegram_username
            if telegram_first_name:
                data['firstName'] = telegram_first_name
            if telegram_last_name:
                data['lastName'] = telegram_last_name
            
            # Пробуем сначала локальный API, если не доступен - используем продакшн
            api_url = Config.API_BASE_URL
            if api_url.startswith('http://localhost'):
                try:
                    async with session.post(
                        f'{api_url}/public/uncreated-requests',
                        json=data,
                        timeout=aiohttp.ClientTimeout(total=5)
                    ) as response:
                        return await response.json()
                except:
                    # Если локальный недоступен, используем продакшн
                    api_url = Config.API_FALLBACK_URL
            
            async with session.post(
                f'{api_url}/public/uncreated-requests',
                json=data
            ) as response:
                return await response.json()
    
    @staticmethod
    async def generate_qr_image(amount: float, bank: str = 'omoney') -> Dict[str, Any]:
        """Генерировать QR код и получить изображение (base64)"""
        import logging
        logger = logging.getLogger(__name__)
        
        connector = aiohttp.TCPConnector(ssl=ssl_context)
        async with aiohttp.ClientSession(connector=connector) as session:
            # Используем payment_site API который возвращает готовое изображение
            payment_site_url = Config.PAYMENT_SITE_URL
            logger.info(f"[QR Image] Using payment site URL: {payment_site_url}")
            
            if 'localhost' in payment_site_url.lower():
                # Для localhost пробуем сначала локальный, потом fallback
                try:
                    async with session.post(
                        f'{payment_site_url}/api/generate-qr',
                        json={'amount': amount, 'bank': bank},
                        timeout=aiohttp.ClientTimeout(total=10)
                    ) as response:
                        if response.status == 200:
                            result = await response.json()
                            logger.info(f"[QR Image] Success from localhost: {payment_site_url}")
                            return result
                        else:
                            error_text = await response.text()
                            logger.error(f"[QR Image] Error from localhost ({response.status}): {error_text}")
                            return {'success': False, 'error': f'Server error: {response.status}'}
                except asyncio.TimeoutError:
                    logger.error(f"[QR Image] Timeout connecting to localhost: {payment_site_url}")
                    payment_site_url = Config.PAYMENT_FALLBACK_URL
                except Exception as e:
                    logger.error(f"[QR Image] Error connecting to localhost: {e}")
                    payment_site_url = Config.PAYMENT_FALLBACK_URL
            
            try:
                async with session.post(
                    f'{payment_site_url}/api/generate-qr',
                    json={'amount': amount, 'bank': bank},
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    if response.status == 200:
                        result = await response.json()
                        logger.info(f"[QR Image] Success from payment site: {payment_site_url}")
                        return result
                    else:
                        error_text = await response.text()
                        logger.error(f"[QR Image] Error from payment site ({response.status}): {error_text}")
                        return {'success': False, 'error': f'Server error: {response.status} - {error_text[:100]}'}
            except asyncio.TimeoutError:
                logger.error(f"[QR Image] Timeout connecting to payment site: {payment_site_url}")
                return {'success': False, 'error': 'Connection timeout'}
            except Exception as e:
                logger.error(f"[QR Image] Error connecting to payment site: {e}")
                return {'success': False, 'error': str(e)}
    
    @staticmethod
    async def update_request_message_id(request_id: int, message_id: int) -> Dict[str, Any]:
        """Обновить ID сообщения о создании заявки"""
        connector = aiohttp.TCPConnector(ssl=ssl_context)
        async with aiohttp.ClientSession(connector=connector) as session:
            # Пробуем сначала локальный API, если не доступен - используем продакшн
            api_url = Config.API_BASE_URL
            # Убираем /api из конца URL если есть, так как добавляем его в путь
            if api_url.endswith('/api'):
                api_url = api_url[:-4]
            elif api_url.endswith('/api/'):
                api_url = api_url[:-5]
            
            if api_url.startswith('http://localhost'):
                try:
                    async with session.patch(
                        f'{api_url}/api/requests/{request_id}/message-id',
                        json={'message_id': message_id},
                        timeout=aiohttp.ClientTimeout(total=3)
                    ) as response:
                        return await response.json()
                except:
                    # Если локальный недоступен, используем продакшн
                    api_url = Config.API_FALLBACK_URL
                    if api_url.endswith('/api'):
                        api_url = api_url[:-4]
                    elif api_url.endswith('/api/'):
                        api_url = api_url[:-5]
            
            async with session.patch(
                f'{api_url}/api/requests/{request_id}/message-id',
                json={'message_id': message_id},
                timeout=aiohttp.ClientTimeout(total=3)
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
                        # Прямой запрос с коротким таймаутом
                        async with session.get(
                            f'{api_url}/public/payment-settings',
                            timeout=aiohttp.ClientTimeout(total=5)
                        ) as response:
                            if response.status == 200:
                                data = await response.json()
                                return data if data.get('success') else {}
                    except:
                        # Если локальный недоступен, используем fallback из конфига
                        api_url = Config.API_FALLBACK_URL
                
                async with session.get(
                    f'{api_url}/public/payment-settings',
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    data = await response.json()
                    return data if data.get('success') else {}
            except Exception as e:
                print(f"Error fetching payment settings: {e}")
                return {}
    
    @staticmethod
    def get_api_base_url() -> str:
        """Получить базовый URL API"""
        return Config.API_BASE_URL
    
    @staticmethod
    async def check_blocked(telegram_user_id: str, account_id: Optional[str] = None) -> Dict[str, Any]:
        """Проверить, заблокирован ли пользователь или accountId"""
        connector = aiohttp.TCPConnector(ssl=ssl_context)
        async with aiohttp.ClientSession(connector=connector) as session:
            data = {
                'userId': str(telegram_user_id),
            }
            
            if account_id:
                data['accountId'] = account_id
            
            # Пробуем сначала локальный API, если не доступен - используем продакшн
            api_url = Config.API_BASE_URL
            if api_url.startswith('http://localhost'):
                try:
                    async with session.post(
                        f'{api_url}/public/check-blocked',
                        json=data,
                        timeout=aiohttp.ClientTimeout(total=2)
                    ) as response:
                        return await response.json()
                except:
                    # Если локальный недоступен, используем продакшн
                    api_url = Config.API_FALLBACK_URL
            
            async with session.post(
                f'{api_url}/public/check-blocked',
                json=data
            ) as response:
                return await response.json()
    
    @staticmethod
    async def check_player(bookmaker: str, account_id: str) -> Dict[str, Any]:
        """Проверить существование игрока в казино"""
        connector = aiohttp.TCPConnector(ssl=ssl_context)
        async with aiohttp.ClientSession(connector=connector) as session:
            data = {
                'bookmaker': bookmaker,
                'accountId': account_id,
            }
            
            # Пробуем сначала локальный API, если не доступен - используем продакшн
            api_url = Config.API_BASE_URL
            if api_url.startswith('http://localhost'):
                try:
                    async with session.post(
                        f'{api_url}/public/check-player',
                        json=data,
                        timeout=aiohttp.ClientTimeout(total=5)
                    ) as response:
                        return await response.json()
                except:
                    # Если локальный недоступен, используем продакшн
                    api_url = Config.API_FALLBACK_URL
            
            async with session.post(
                f'{api_url}/public/check-player',
                json=data,
                timeout=aiohttp.ClientTimeout(total=10)
            ) as response:
                return await response.json()
    
    @staticmethod
    async def check_withdraw_amount(bookmaker: str, user_id: str, code: str) -> Dict[str, Any]:
        """Проверить сумму вывода по коду"""
        connector = aiohttp.TCPConnector(ssl=ssl_context)
        async with aiohttp.ClientSession(connector=connector) as session:
            data = {
                'bookmaker': bookmaker,
                'userId': user_id,
                'code': code,
            }
            
            # Пробуем сначала локальный API, если не доступен - используем продакшн
            api_url = Config.API_BASE_URL
            if api_url.startswith('http://localhost'):
                try:
                    async with session.post(
                        f'{api_url}/check-withdraw-amount',
                        json=data,
                        timeout=aiohttp.ClientTimeout(total=5)
                    ) as response:
                        return await response.json()
                except:
                    # Если локальный недоступен, используем продакшн
                    api_url = Config.API_FALLBACK_URL
            
            async with session.post(
                f'{api_url}/check-withdraw-amount',
                json=data,
                timeout=aiohttp.ClientTimeout(total=10)
            ) as response:
                return await response.json()
    
    @staticmethod
    async def get_saved_casino_account_id(telegram_user_id: str, casino_id: str) -> Dict[str, Any]:
        """Получить сохраненный ID казино для пользователя"""
        connector = aiohttp.TCPConnector(ssl=ssl_context)
        async with aiohttp.ClientSession(connector=connector) as session:
            # Пробуем сначала локальный API, если не доступен - используем продакшн
            api_url = Config.API_BASE_URL
            if api_url.startswith('http://localhost'):
                try:
                    async with session.get(
                        f'{api_url}/public/user-casino-ids?userId={telegram_user_id}&casinoId={casino_id}',
                        timeout=aiohttp.ClientTimeout(total=2)
                    ) as response:
                        return await response.json()
                except:
                    api_url = Config.API_FALLBACK_URL
            
            async with session.get(
                f'{api_url}/public/user-casino-ids?userId={telegram_user_id}&casinoId={casino_id}'
            ) as response:
                return await response.json()
    
    @staticmethod
    async def get_all_saved_casino_account_ids(telegram_user_id: str) -> Dict[str, Any]:
        """Получить все сохраненные ID казино для пользователя"""
        connector = aiohttp.TCPConnector(ssl=ssl_context)
        async with aiohttp.ClientSession(connector=connector) as session:
            # Пробуем сначала локальный API, если не доступен - используем продакшн
            api_url = Config.API_BASE_URL
            if api_url.startswith('http://localhost'):
                try:
                    async with session.get(
                        f'{api_url}/public/user-casino-ids?userId={telegram_user_id}',
                        timeout=aiohttp.ClientTimeout(total=2)
                    ) as response:
                        return await response.json()
                except:
                    api_url = Config.API_FALLBACK_URL
            
            async with session.get(
                f'{api_url}/public/user-casino-ids?userId={telegram_user_id}'
            ) as response:
                return await response.json()
    
    @staticmethod
    async def get_last_withdraw_phone(telegram_user_id: str) -> Optional[str]:
        """Получить последний номер телефона из последней заявки на вывод"""
        connector = aiohttp.TCPConnector(ssl=ssl_context)
        async with aiohttp.ClientSession(connector=connector) as session:
            try:
                # Пробуем сначала локальный API, если не доступен - используем продакшн
                api_url = Config.API_BASE_URL
                if api_url.startswith('http://localhost'):
                    try:
                        async with session.get(
                            f'{api_url}/api/users/{telegram_user_id}/requests?type=withdraw&limit=1',
                            timeout=aiohttp.ClientTimeout(total=2)
                        ) as response:
                            if response.status == 200:
                                data = await response.json()
                                if data.get('success') and data.get('data'):
                                    requests = data.get('data', [])
                                    if requests and len(requests) > 0:
                                        last_request = requests[0]
                                        return last_request.get('phone')
                        return None
                    except:
                        api_url = Config.API_FALLBACK_URL
                
                async with session.get(
                    f'{api_url}/api/users/{telegram_user_id}/requests?type=withdraw&limit=1',
                    timeout=aiohttp.ClientTimeout(total=5)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        if data.get('success') and data.get('data'):
                            requests = data.get('data', [])
                            if requests and len(requests) > 0:
                                last_request = requests[0]
                                return last_request.get('phone')
                return None
            except Exception:
                return None
    
    @staticmethod
    async def save_casino_account_id(telegram_user_id: str, casino_id: str, account_id: str) -> Dict[str, Any]:
        """Сохранить ID казино для пользователя"""
        connector = aiohttp.TCPConnector(ssl=ssl_context)
        async with aiohttp.ClientSession(connector=connector) as session:
            data = {
                'userId': str(telegram_user_id),
                'casinoId': casino_id,
                'accountId': account_id,
            }
            
            # Пробуем сначала локальный API, если не доступен - используем продакшн
            api_url = Config.API_BASE_URL
            if api_url.startswith('http://localhost'):
                try:
                    async with session.post(
                        f'{api_url}/public/user-casino-ids',
                        json=data,
                        timeout=aiohttp.ClientTimeout(total=2)
                    ) as response:
                        return await response.json()
                except:
                    api_url = Config.API_FALLBACK_URL
            
            async with session.post(
                f'{api_url}/public/user-casino-ids',
                json=data
            ) as response:
                return await response.json()
    
    @staticmethod
    async def check_active_deposit(telegram_user_id: str) -> Dict[str, Any]:
        """Проверить, есть ли у пользователя активная заявка на пополнение"""
        connector = aiohttp.TCPConnector(ssl=ssl_context)
        async with aiohttp.ClientSession(connector=connector) as session:
            data = {
                'userId': str(telegram_user_id),
            }
            
            # Пробуем сначала локальный API, если не доступен - используем продакшн
            # Уменьшаем таймаут для быстрого ответа
            api_url = Config.API_BASE_URL
            if api_url.startswith('http://localhost'):
                try:
                    async with session.post(
                        f'{api_url}/public/check-active-deposit',
                        json=data,
                        timeout=aiohttp.ClientTimeout(total=1)  # Уменьшен таймаут до 1 секунды
                    ) as response:
                        return await response.json()
                except:
                    # Если локальный недоступен, используем продакшн
                    api_url = Config.API_FALLBACK_URL
            
            async with session.post(
                f'{api_url}/public/check-active-deposit',
                json=data,
                timeout=aiohttp.ClientTimeout(total=1)  # Уменьшен таймаут до 1 секунды
            ) as response:
                return await response.json()




