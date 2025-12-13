from aiogram import Router, F, Bot
from aiogram.types import Message, ReplyKeyboardMarkup, KeyboardButton, InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
import logging
from config import Config
from translations import get_text
from api_client import APIClient

router = Router()
logger = logging.getLogger(__name__)

def get_user_lang(state: FSMContext) -> str:
    """Получить язык пользователя (по умолчанию русский)"""
    # В реальном проекте можно сохранять в БД
    # Здесь используем состояние
    return 'ru'  # По умолчанию русский

async def get_lang_from_state(state: FSMContext) -> str:
    """Получить язык из состояния"""
    data = await state.get_data()
    return data.get('language', 'ru')

async def check_channel_subscription(bot: Bot, user_id: int, channel: str) -> bool:
    """Проверить подписку пользователя на канал"""
    try:
        # Убираем @ если есть
        channel_username = channel.lstrip('@')
        
        # Получаем информацию о пользователе в канале
        chat_member = await bot.get_chat_member(f'@{channel_username}', user_id)
        
        # Проверяем статус подписки
        # member, administrator, creator - подписан
        # left, kicked - не подписан
        return chat_member.status in ['member', 'administrator', 'creator']
    except Exception as e:
        # Если канал не найден или ошибка, считаем что подписан (чтобы не блокировать бота)
        logger.warning(f"Error checking channel subscription: {e}")
        return True

@router.message(Command("start"))
async def cmd_start(message: Message, state: FSMContext, bot: Bot):
    logger.info(f"Received /start from user {message.from_user.id}")
    lang = await get_lang_from_state(state)
    
    # Проверяем блокировку пользователя (с таймаутом)
    try:
        import asyncio
        blocked_check = await asyncio.wait_for(
            APIClient.check_blocked(str(message.from_user.id)),
            timeout=3.0
        )
        if blocked_check.get('success') and blocked_check.get('data', {}).get('blocked'):
            blocked_data = blocked_check.get('data', {})
            blocked_message = blocked_data.get('message', 'Вы заблокированы')
            await message.answer(blocked_message)
            return
    except asyncio.TimeoutError:
        logger.warning(f"Timeout checking blocked status for user {message.from_user.id}")
        # Продолжаем работу, если проверка не удалась
    except Exception as e:
        logger.error(f"Error checking blocked status for user {message.from_user.id}: {e}", exc_info=True)
        # Продолжаем работу, если проверка не удалась
    
    # Проверяем pause режим (с таймаутом)
    settings = {}
    try:
        import asyncio
        settings = await asyncio.wait_for(
            APIClient.get_payment_settings(),
            timeout=3.0
        )
        if settings.get('pause', False):
            maintenance_message = settings.get('maintenance_message', get_text(lang, 'start', 'bot_paused'))
            await message.answer(maintenance_message)
            return
    except asyncio.TimeoutError:
        logger.warning(f"Timeout fetching payment settings")
        # Если не удалось получить настройки, продолжаем работу
    except Exception as e:
        logger.warning(f"Error fetching payment settings: {e}")
        # Если не удалось получить настройки, продолжаем работу
    
    # Проверяем подписку на канал (только если включена)
    require_subscription = settings.get('require_channel_subscription', True)
    channel = settings.get('channel') or Config.CHANNEL
    # Убеждаемся что channel - строка
    if require_subscription and channel and isinstance(channel, str) and channel.strip():
        try:
            import asyncio
            is_subscribed = await asyncio.wait_for(
                check_channel_subscription(bot, message.from_user.id, channel),
                timeout=5.0
            )
            
            if not is_subscribed:
                # Показываем сообщение с кнопкой подписки
                subscribe_text = get_text(lang, 'start', 'subscribe_required', channel=channel)
                if not subscribe_text or subscribe_text.startswith('['):
                    subscribe_text = f"📢 Пожалуйста, подпишитесь на наш канал: {channel}" if lang == 'ru' else f"📢 Биздин каналга жазылыңыз: {channel}"
                
                keyboard = InlineKeyboardMarkup(inline_keyboard=[
                    [InlineKeyboardButton(
                        text=get_text(lang, 'start', 'subscribe_button', default='📢 Подписаться на канал'),
                        url=f"https://t.me/{channel.lstrip('@')}"
                    )],
                    [InlineKeyboardButton(
                        text=get_text(lang, 'start', 'check_subscription', default='✅ Я подписался'),
                        callback_data='check_subscription'
                    )]
                ])
                
                await message.answer(subscribe_text, reply_markup=keyboard)
                return
        except asyncio.TimeoutError:
            logger.warning(f"Timeout checking channel subscription for user {message.from_user.id}")
            # Продолжаем работу, если проверка не удалась
        except Exception as e:
            logger.warning(f"Error checking channel subscription: {e}")
            # Продолжаем работу, если проверка не удалась
    
    # Если подписан или канал не настроен, показываем главное меню
    try:
        first_name = message.from_user.first_name or ('kotik' if lang == 'ru' else 'баатыр')
        
        text = f"""{get_text(lang, 'start', 'greeting', name=first_name)}

{get_text(lang, 'start', 'auto_deposit')}
{get_text(lang, 'start', 'auto_withdraw')}
{get_text(lang, 'start', 'working')}

{get_text(lang, 'start', 'support', support=Config.SUPPORT)}"""
        
        keyboard = ReplyKeyboardMarkup(
            keyboard=[
                [
                    KeyboardButton(text=get_text(lang, 'menu', 'deposit')),
                    KeyboardButton(text=get_text(lang, 'menu', 'withdraw'))
                ],
                [
                    KeyboardButton(text=get_text(lang, 'menu', 'instruction')),
                    KeyboardButton(text=get_text(lang, 'menu', 'language'))
                ]
            ],
            resize_keyboard=True
        )
        
        await message.answer(text, reply_markup=keyboard)
        logger.info(f"Successfully sent /start response to user {message.from_user.id}")
    except Exception as e:
        logger.error(f"Error sending /start response to user {message.from_user.id}: {e}", exc_info=True)
        # Пытаемся отправить хотя бы простое сообщение
        try:
            await message.answer("Привет! Используйте кнопки меню для работы с ботом.")
        except:
            pass

@router.callback_query(F.data == 'check_subscription')
async def check_subscription_callback(callback: CallbackQuery, state: FSMContext, bot: Bot):
    """Проверка подписки после нажатия кнопки"""
    lang = await get_lang_from_state(state)
    
    # Получаем настройки для канала
    settings = {}
    try:
        settings = await APIClient.get_payment_settings()
    except Exception:
        pass
    
    channel = settings.get('channel') or Config.CHANNEL
    # Убеждаемся что channel - строка
    if not channel or not isinstance(channel, str) or not channel.strip():
        await callback.answer(get_text(lang, 'start', 'subscription_error', default='Ошибка проверки подписки'), show_alert=True)
        return
    
    # Проверяем подписку
    is_subscribed = await check_channel_subscription(bot, callback.from_user.id, channel)
    
    if is_subscribed:
        # Удаляем сообщение с кнопкой подписки
        try:
            await callback.message.delete()
        except Exception:
            pass
        
        # Показываем главное меню
        first_name = callback.from_user.first_name or ('kotik' if lang == 'ru' else 'баатыр')
        
        text = f"""{get_text(lang, 'start', 'greeting', name=first_name)}

{get_text(lang, 'start', 'auto_deposit')}
{get_text(lang, 'start', 'auto_withdraw')}
{get_text(lang, 'start', 'working')}

{get_text(lang, 'start', 'support', support=Config.SUPPORT)}"""
        
        keyboard = ReplyKeyboardMarkup(
            keyboard=[
                [
                    KeyboardButton(text=get_text(lang, 'menu', 'deposit')),
                    KeyboardButton(text=get_text(lang, 'menu', 'withdraw'))
                ],
                [
                    KeyboardButton(text=get_text(lang, 'menu', 'instruction')),
                    KeyboardButton(text=get_text(lang, 'menu', 'language'))
                ]
            ],
            resize_keyboard=True
        )
        
        await callback.message.answer(text, reply_markup=keyboard)
        await callback.answer()
    else:
        # Еще не подписан
        await callback.answer(
            get_text(lang, 'start', 'not_subscribed', default='Пожалуйста, сначала подпишитесь на канал'),
            show_alert=True
        )

