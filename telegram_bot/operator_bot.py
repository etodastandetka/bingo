import asyncio
import logging
import os
from aiogram import Bot, Dispatcher, F
from aiogram.types import Message
from aiogram.fsm.storage.memory import MemoryStorage
from config import Config
import aiohttp
import ssl

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Отключаем проверку SSL для внутренних запросов
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

# Приветственные сообщения
WELCOME_MESSAGES = {
    'ru': '👋 Добро пожаловать в чат поддержки!\n\nНапишите ваш вопрос, и мы обязательно вам поможем.',
    'ky': '👋 Колдоо кызматына кош келиңиз!\n\nСурооңузду жазсаңыз, биз сизге жардам беребиз.',
}

async def save_message_to_db(
    user_id: int,
    message_text: str = None,
    message_type: str = 'text',
    media_url: str = None,
    direction: str = 'in',
    bot_type: str = 'operator',
    telegram_message_id: int = None,
    username: str = None,
    first_name: str = None,
    last_name: str = None
):
    """Сохранить сообщение в БД через API"""
    try:
        connector = aiohttp.TCPConnector(ssl=ssl_context)
        async with aiohttp.ClientSession(connector=connector) as session:
            api_url = Config.API_BASE_URL
            data = {
                'userId': str(user_id),
                'messageText': message_text,
                'messageType': message_type,
                'mediaUrl': media_url,
                'direction': direction,
                'botType': bot_type,
            }
            if telegram_message_id:
                data['telegramMessageId'] = str(telegram_message_id)
            if direction == 'in':
                # Всегда добавляем данные пользователя для создания/обновления записи
                # Передаем даже None, чтобы обновить данные в БД
                data['username'] = username
                data['firstName'] = first_name
                data['lastName'] = last_name
            
            logger.info(f"💾 Saving message to DB: user_id={user_id}, direction={direction}, bot_type={bot_type}, api_url={api_url}")
            logger.info(f"📤 Request data: {data}")
            
            # Сначала пробуем локальный API (если админка запущена локально)
            local_api_urls = ['http://localhost:3001/api', 'http://localhost:3000/api']
            for local_api_url in local_api_urls:
                try:
                    logger.info(f"🔗 Trying local API: {local_api_url}/chat-message")
                    async with session.post(
                        f'{local_api_url}/chat-message',
                        json=data,
                        timeout=aiohttp.ClientTimeout(total=3)
                    ) as response:
                        result = await response.json()
                        logger.info(f"✅ Local API response: status={response.status}, result={result}")
                        if response.status == 200 and result.get('success'):
                            return result
                        else:
                            logger.warning(f"⚠️ Local API returned status {response.status} or not successful, trying next")
                except Exception as e:
                    logger.info(f"ℹ️ Local API {local_api_url} not available: {e}, trying next")
            
            # Если локальный не доступен, используем продакшн
            logger.info(f"🔗 Trying production API: {api_url}/chat-message")
            async with session.post(
                f'{api_url}/chat-message',
                json=data,
                timeout=aiohttp.ClientTimeout(total=10)
            ) as response:
                result = await response.json()
                logger.info(f"✅ Production API response: status={response.status}, result={result}")
                if response.status == 200 and result.get('success'):
                    return result
                else:
                    logger.error(f"❌ API returned status {response.status}: {result}")
                    return None
    except Exception as e:
        logger.error(f"❌ Error saving message to DB: {e}", exc_info=True)
        return None

async def set_operator_chat_status(user_id: int, is_closed: bool):
    """Открыть/закрыть операторский чат для пользователя (нужно, чтобы /start выводил чат в открытые)."""
    try:
        service_token = os.getenv('OPERATOR_SERVICE_TOKEN', 'dev-operator-token')

        connector = aiohttp.TCPConnector(ssl=ssl_context)
        async with aiohttp.ClientSession(connector=connector) as session:
            api_url = Config.API_BASE_URL

            async def do_patch(url: str):
                try:
                    async with session.patch(
                        f'{url}/public/open-operator-chat',
                        json={'userId': str(user_id), 'isClosed': is_closed},
                        headers={'x-operator-token': service_token},
                        timeout=aiohttp.ClientTimeout(total=5)
                    ) as response:
                        if response.status == 200:
                            return True
                        logger.warning(f"⚠️ set_operator_chat_status: status {response.status}")
                except Exception as e:
                    logger.info(f"ℹ️ set_operator_chat_status failed for {url}: {e}")
                return False

            # Сначала локальный
            if api_url.startswith('http://localhost'):
                if await do_patch(api_url):
                    return True
                # fallback на прод
                api_url = 'https://fqxgmrzplndwsyvkeu.ru/api'

            return await do_patch(api_url)
    except Exception as e:
        logger.error(f"❌ Error setting operator chat status: {e}", exc_info=True)
        return False

async def check_existing_messages(user_id: int) -> bool:
    """Проверить, есть ли уже сообщения от пользователя"""
    try:
        connector = aiohttp.TCPConnector(ssl=ssl_context)
        async with aiohttp.ClientSession(connector=connector) as session:
            api_url = Config.API_BASE_URL
            if api_url.startswith('http://localhost'):
                try:
                    async with session.get(
                        f'{api_url}/users/{user_id}/chat?limit=1&botType=operator',
                        timeout=aiohttp.ClientTimeout(total=2)
                    ) as response:
                        if response.status == 200:
                            data = await response.json()
                            return bool(data.get('success') and data.get('data', {}).get('messages'))
                except:
                    api_url = 'https://fqxgmrzplndwsyvkeu.ru/api'
            
            async with session.get(
                f'{api_url}/users/{user_id}/chat?limit=1&botType=operator'
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return bool(data.get('success') and data.get('data', {}).get('messages'))
    except Exception:
        pass
    return False

async def handle_start(message: Message, bot: Bot):
    """Обработка команды /start"""
    user_id = message.from_user.id
    
    logger.info(f"🚀 /start command from user {user_id} (@{message.from_user.username})")
    logger.info(f"📩 Message details: id={message.message_id}, text={message.text}")
    
    # Создаем/обновляем пользователя в БД при первом обращении
    result = await save_message_to_db(
        user_id=user_id,
        message_text='/start',
        message_type='text',
        direction='in',
        bot_type='operator',
        telegram_message_id=message.message_id,
        username=message.from_user.username,
        first_name=message.from_user.first_name,
        last_name=message.from_user.last_name
    )
    
    if result and result.get('success'):
        logger.info(f"✅ /start message saved for user {user_id}: {result}")
    else:
        logger.error(f"❌ Failed to save /start message for user {user_id}: {result}")

    # Открываем чат, если он был закрыт, чтобы вернуть его в список открытых в админке
    opened = await set_operator_chat_status(user_id, is_closed=False)
    if opened:
        logger.info(f"🔓 Operator chat opened for user {user_id}")
    else:
        logger.warning(f"⚠️ Failed to open operator chat for user {user_id}")
    
    # Проверяем, есть ли уже сообщения (кроме /start)
    has_messages = await check_existing_messages(user_id)
    logger.info(f"📋 User {user_id} has existing messages: {has_messages}")
    
    if not has_messages:
        # Отправляем приветственное сообщение
        welcome_text = WELCOME_MESSAGES.get('ru', WELCOME_MESSAGES['ru'])
        logger.info(f"👋 Sending welcome message to user {user_id}")
        sent_message = await bot.send_message(
            chat_id=user_id,
            text=welcome_text,
        )
        
        # Сохраняем приветственное сообщение в БД
        welcome_result = await save_message_to_db(
            user_id=user_id,
            message_text=welcome_text,
            message_type='text',
            direction='out',
            bot_type='operator',
            telegram_message_id=sent_message.message_id
        )
        
        if welcome_result and welcome_result.get('success'):
            logger.info(f"✅ Welcome message saved for user {user_id}: {welcome_result}")
        else:
            logger.error(f"❌ Failed to save welcome message for user {user_id}: {welcome_result}")

async def handle_text(message: Message, bot: Bot):
    """Обработка текстовых сообщений"""
    user_id = message.from_user.id
    text = message.text
    
    logger.info(f"📨 handle_text called for user {user_id}, text: {text[:50] if text else 'None'}")
    
    # Игнорируем команды
    if text and text.startswith('/'):
        logger.info(f"⏭️ Ignoring command from user {user_id}: {text}")
        return
    
    logger.info(f"💬 Processing text message from user {user_id}: {text[:50] if text else 'None'}")
    
    # Сохраняем сообщение пользователя в БД
    result = await save_message_to_db(
        user_id=user_id,
        message_text=text,
        message_type='text',
        direction='in',
        bot_type='operator',
        telegram_message_id=message.message_id,
        username=message.from_user.username,
        first_name=message.from_user.first_name,
        last_name=message.from_user.last_name
    )
    
    if result and result.get('success'):
        logger.info(f"✅ Message saved for user {user_id}: {result}")
    else:
        logger.error(f"❌ Failed to save message for user {user_id}: {result}")

async def handle_photo(message: Message, bot: Bot):
    """Обработка фото"""
    user_id = message.from_user.id
    
    # Получаем URL фото
    photo = message.photo[-1]  # Берем фото наибольшего размера
    file = await bot.get_file(photo.file_id)
    media_url = f"https://api.telegram.org/file/bot{bot.token}/{file.file_path}"
    
    # Сохраняем сообщение пользователя в БД
    await save_message_to_db(
        user_id=user_id,
        message_text=message.caption,
        message_type='photo',
        media_url=media_url,
        direction='in',
        bot_type='operator',
        telegram_message_id=message.message_id,
        username=message.from_user.username,
        first_name=message.from_user.first_name,
        last_name=message.from_user.last_name
    )

async def handle_video(message: Message, bot: Bot):
    """Обработка видео"""
    user_id = message.from_user.id
    
    # Получаем URL видео
    video = message.video
    file = await bot.get_file(video.file_id)
    media_url = f"https://api.telegram.org/file/bot{bot.token}/{file.file_path}"
    
    # Сохраняем сообщение пользователя в БД
    await save_message_to_db(
        user_id=user_id,
        message_text=message.caption,
        message_type='video',
        media_url=media_url,
        direction='in',
        bot_type='operator',
        telegram_message_id=message.message_id,
        username=message.from_user.username,
        first_name=message.from_user.first_name,
        last_name=message.from_user.last_name
    )

async def main():
    """Главная функция запуска бота оператора"""
    if not Config.OPERATOR_BOT_TOKEN:
        logger.error("OPERATOR_BOT_TOKEN не установлен! Проверьте файл .env")
        return
    
    logger.info(f"🔑 OPERATOR_BOT_TOKEN: {Config.OPERATOR_BOT_TOKEN[:10]}...")
    logger.info(f"🌐 API_BASE_URL: {Config.API_BASE_URL}")
    
    # Инициализация бота и диспетчера
    bot = Bot(token=Config.OPERATOR_BOT_TOKEN)
    dp = Dispatcher(storage=MemoryStorage())
    
    # Регистрация обработчиков (более специфичные должны быть зарегистрированы первыми)
    dp.message.register(handle_start, F.text == '/start')
    dp.message.register(handle_photo, F.photo)
    dp.message.register(handle_video, F.video)
    dp.message.register(handle_text, F.text)  # Текстовые сообщения в конце, чтобы не перехватывать команды
    
    logger.info("✅ Handlers registered: /start, text, photo, video")
    logger.info("Бот оператор запущен!")
    
    # Запуск polling
    await dp.start_polling(bot)

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Бот оператор остановлен")

