from aiogram import Router, F, Bot
from aiogram.types import Message
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from translations import get_text
from api_client import APIClient
import aiohttp
import ssl

router = Router()

# Отключаем проверку SSL для внутренних запросов
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

async def get_lang_from_state(state: FSMContext) -> str:
    """Получить язык из состояния"""
    data = await state.get_data()
    return data.get('language', 'ru')

async def save_message_to_db(
    user_id: int,
    message_text: str = None,
    message_type: str = 'text',
    media_url: str = None,
    direction: str = 'in',
    bot_type: str = 'main',
    telegram_message_id: int = None,
    username: str = None,
    first_name: str = None,
    last_name: str = None
):
    """Сохранить сообщение в БД через API"""
    try:
        connector = aiohttp.TCPConnector(ssl=ssl_context)
        async with aiohttp.ClientSession(connector=connector) as session:
            from config import Config
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
                # Добавляем данные пользователя для создания/обновления записи
                if username:
                    data['username'] = username
                if first_name:
                    data['firstName'] = first_name
                if last_name:
                    data['lastName'] = last_name
            
            # Пробуем сначала локальный API, если не доступен - используем продакшн
            if api_url.startswith('http://localhost'):
                try:
                    async with session.post(
                        f'{api_url}/chat-message',
                        json=data,
                        timeout=aiohttp.ClientTimeout(total=2)
                    ) as response:
                        return await response.json()
                except:
                    from config import Config
                    api_url = Config.API_FALLBACK_URL
            
            async with session.post(
                f'{api_url}/chat-message',
                json=data
            ) as response:
                return await response.json()
    except Exception as e:
        logger.error(f"Error saving message to DB: {e}", exc_info=True)
        return None

@router.message(F.text & ~Command())  # Обрабатываем только текстовые сообщения, НЕ команды
async def chat_message_text(message: Message, state: FSMContext, bot: Bot):
    """Обработка текстовых сообщений в чате (автоматически для всех сообщений)"""
    # Команды уже отфильтрованы через ~Command(), но на всякий случай проверяем
    if message.text and message.text.startswith('/'):
        return  # Игнорируем команды - они обрабатываются другими роутерами
    
    # Проверяем, что пользователь не находится в процессе депозита или вывода
    current_state = await state.get_state()
    if current_state:
        # Если есть активное состояние (депозит/вывод), не обрабатываем как сообщение чата
        return
    
    # Проверяем, что это не кнопка меню
    text = message.text
    menu_buttons = [
        '💰 Пополнить', '💰 Толтуруу',
        '💸 Вывести', '💸 Чыгаруу',
        '📖 Инструкция', '📖 Көрсөтмө',
        '🌐 Язык', '🌐 Тил',
        '❌ Операция отменена', '❌ Аракет жокко чыгарылды'
    ]
    
    if text in menu_buttons:
        return  # Игнорируем кнопки меню
    
    # Проверяем, есть ли уже сообщения от этого пользователя (для отправки приветствия при первом сообщении)
    user_id = message.from_user.id
    lang = await get_lang_from_state(state)
    
    try:
        connector = aiohttp.TCPConnector(ssl=ssl_context)
        async with aiohttp.ClientSession(connector=connector) as session:
            from config import Config
            api_url = Config.API_BASE_URL
            if api_url.startswith('http://localhost'):
                try:
                    async with session.get(
                        f'{api_url}/users/{user_id}/chat?limit=1&botType=main',
                        timeout=aiohttp.ClientTimeout(total=2)
                    ) as response:
                        if response.status == 200:
                            data = await response.json()
                            if not data.get('success') or not data.get('data', {}).get('messages'):
                                # Первое сообщение - отправляем приветствие
                                welcome_text = get_text(lang, 'chat', 'welcome')
                                sent_message = await message.answer(welcome_text)
                                await save_message_to_db(
                                    user_id=user_id,
                                    message_text=welcome_text,
                                    message_type='text',
                                    direction='out',
                                    bot_type='main',
                                    telegram_message_id=sent_message.message_id
                                )
                except:
                    from config import Config
                    api_url = Config.API_FALLBACK_URL
            
            async with session.get(
                f'{api_url}/users/{user_id}/chat?limit=1&botType=main'
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    if not data.get('success') or not data.get('data', {}).get('messages'):
                        # Первое сообщение - отправляем приветствие
                        welcome_text = get_text(lang, 'chat', 'welcome')
                        sent_message = await message.answer(welcome_text)
                        await save_message_to_db(
                            user_id=user_id,
                            message_text=welcome_text,
                            message_type='text',
                            direction='out',
                            bot_type='main',
                            telegram_message_id=sent_message.message_id
                        )
    except Exception:
        pass  # Если не удалось проверить, продолжаем обработку сообщения
    
    user_id = message.from_user.id
    
    # Проверяем блокировку пользователя
    try:
        blocked_check = await APIClient.check_blocked(str(user_id))
        if blocked_check.get('success') and blocked_check.get('data', {}).get('blocked'):
            blocked_data = blocked_check.get('data', {})
            blocked_message = blocked_data.get('message', 'Вы заблокированы')
            await message.answer(blocked_message)
            return
    except Exception as e:
        logger.error(f"Error checking blocked status: {e}", exc_info=True)
        # Продолжаем работу, если проверка не удалась
    
    # Сохраняем сообщение пользователя в БД
    await save_message_to_db(
        user_id=user_id,
        message_text=text,
        message_type='text',
        direction='in',
        bot_type='main',
        telegram_message_id=message.message_id,
        username=message.from_user.username,
        first_name=message.from_user.first_name,
        last_name=message.from_user.last_name
    )

@router.message(F.photo)
async def chat_message_photo(message: Message, state: FSMContext, bot: Bot):
    """Обработка фото в чате"""
    # Проверяем, что пользователь не находится в процессе вывода (где требуется фото QR)
    current_state = await state.get_state()
    if current_state and 'withdraw' in str(current_state).lower():
        # Если пользователь в процессе вывода, не обрабатываем как сообщение чата
        return
    
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
        bot_type='main',
        telegram_message_id=message.message_id,
        username=message.from_user.username,
        first_name=message.from_user.first_name,
        last_name=message.from_user.last_name
    )

@router.message(F.video)
async def chat_message_video(message: Message, state: FSMContext, bot: Bot):
    """Обработка видео в чате"""
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
        bot_type='main',
        telegram_message_id=message.message_id,
        username=message.from_user.username,
        first_name=message.from_user.first_name,
        last_name=message.from_user.last_name
    )

