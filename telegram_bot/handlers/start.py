import asyncio
from aiogram import Router, F, Bot
from aiogram.types import Message, ReplyKeyboardMarkup, KeyboardButton, InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from config import Config
from translations import get_text
from api_client import APIClient

router = Router()

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
        
        # Получаем информацию о пользователе в канале с таймаутом
        chat_member = await asyncio.wait_for(
            bot.get_chat_member(f'@{channel_username}', user_id),
            timeout=5.0  # 5 секунд таймаут
        )
        
        # Проверяем статус подписки
        # member, administrator, creator - подписан
        # left, kicked - не подписан
        return chat_member.status in ['member', 'administrator', 'creator']
    except asyncio.TimeoutError:
        # Таймаут - считаем что подписан, чтобы не блокировать бота
        print(f"Error checking channel subscription: Request timeout")
        return True
    except Exception as e:
        # Если канал не найден или ошибка, считаем что подписан (чтобы не блокировать бота)
        print(f"Error checking channel subscription: {e}")
        return True

@router.message(Command("start"))
async def cmd_start(message: Message, state: FSMContext, bot: Bot):
    lang = await get_lang_from_state(state)
    
    # Останавливаем таймер и удаляем сообщение с QR-кодом если есть (при перезапуске процесса пополнения)
    data = await state.get_data()
    qr_message_id = data.get('qr_message_id')
    if qr_message_id:
        # Останавливаем таймер
        from handlers.deposit import active_timers
        timer_key = f"{message.chat.id}_{qr_message_id}"
        active_timers.pop(timer_key, None)
        
        try:
            await bot.delete_message(chat_id=message.chat.id, message_id=qr_message_id)
        except Exception:
            pass
    
    # Проверяем блокировку пользователя (с таймаутом)
    try:
        blocked_check = await asyncio.wait_for(
            APIClient.check_blocked(str(message.from_user.id)),
            timeout=3.0  # 3 секунды таймаут
        )
        if blocked_check.get('success') and blocked_check.get('data', {}).get('blocked'):
            blocked_data = blocked_check.get('data', {})
            blocked_message = blocked_data.get('message', 'Вы заблокированы')
            await message.answer(blocked_message)
            return
    except asyncio.TimeoutError:
        print(f"Timeout checking blocked status, continuing...")
        # Продолжаем работу при таймауте
    except Exception as e:
        print(f"Error checking blocked status: {e}")
        # Продолжаем работу, если проверка не удалась
    
    # Проверяем pause режим (с таймаутом)
    settings = {}
    try:
        settings = await asyncio.wait_for(
            APIClient.get_payment_settings(),
            timeout=3.0  # 3 секунды таймаут
        )
        if settings.get('pause', False):
            maintenance_message = settings.get('maintenance_message', get_text(lang, 'start', 'bot_paused'))
            await message.answer(maintenance_message)
            return
    except asyncio.TimeoutError:
        print(f"Timeout getting payment settings, continuing with defaults...")
        # Продолжаем работу с дефолтными настройками
    except Exception:
        pass  # Если не удалось получить настройки, продолжаем работу
    
    # Проверяем подписку на канал (только если включена)
    require_subscription = settings.get('require_channel_subscription', True)
    channel = settings.get('channel') or Config.CHANNEL
    # Убеждаемся что channel - строка
    if require_subscription and channel and isinstance(channel, str) and channel.strip():
        is_subscribed = await check_channel_subscription(bot, message.from_user.id, channel)
        
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
    
    # Если подписан или канал не настроен, показываем главное меню
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

@router.callback_query(F.data == 'check_subscription')
async def check_subscription_callback(callback: CallbackQuery, state: FSMContext, bot: Bot):
    """Проверка подписки после нажатия кнопки"""
    lang = await get_lang_from_state(state)
    
    # Получаем настройки для канала (с таймаутом)
    settings = {}
    try:
        settings = await asyncio.wait_for(
            APIClient.get_payment_settings(),
            timeout=3.0  # 3 секунды таймаут
        )
    except asyncio.TimeoutError:
        print(f"Timeout getting payment settings in subscription check, using defaults...")
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

