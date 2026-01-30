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
    """Проверить подписку пользователя на канал
    
    Поддерживает:
    - ID канала (например, -1002450771165)
    - Username канала (например, @bingokg_news)
    """
    try:
        # Определяем формат канала
        # Если начинается с минуса или это число - это ID канала
        channel_clean = channel.strip().lstrip('@')
        
        # Проверяем, является ли это числовым ID (начинается с минуса или только цифры)
        if channel_clean.startswith('-') or channel_clean.lstrip('-').isdigit():
            # Это ID канала
            channel_id = int(channel_clean)
            chat_identifier = channel_id
        else:
            # Это username канала
            chat_identifier = f'@{channel_clean}'
        
        # Получаем информацию о пользователе в канале с таймаутом
        chat_member = await asyncio.wait_for(
            bot.get_chat_member(chat_identifier, user_id),
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
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        lang = await get_lang_from_state(state)
        logger.info(f"[Start] Command /start from user {message.from_user.id}")
        
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
                try:
                    await message.answer(blocked_message)
                    logger.info(f"[Start] User {message.from_user.id} is blocked")
                except Exception as send_error:
                    logger.error(f"[Start] Failed to send blocked message to user {message.from_user.id}: {send_error}", exc_info=True)
                return
        except asyncio.TimeoutError:
            logger.warning(f"[Start] Timeout checking blocked status for user {message.from_user.id}, continuing...")
            # Продолжаем работу при таймауте
        except Exception as e:
            logger.error(f"[Start] Error checking blocked status for user {message.from_user.id}: {e}")
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
                try:
                    await message.answer(maintenance_message)
                    logger.info(f"[Start] Bot is paused, sent maintenance message to user {message.from_user.id}")
                except Exception as send_error:
                    logger.error(f"[Start] Failed to send maintenance message to user {message.from_user.id}: {send_error}", exc_info=True)
                return
        except asyncio.TimeoutError:
            logger.warning(f"[Start] Timeout getting payment settings for user {message.from_user.id}, continuing with defaults...")
            # Продолжаем работу с дефолтными настройками
        except Exception as e:
            logger.error(f"[Start] Error getting payment settings for user {message.from_user.id}: {e}")
            # Если не удалось получить настройки, продолжаем работу
    
        # Проверяем подписку на канал (только если включена)
        require_subscription = settings.get('require_channel_subscription', True)
        # Используем channel_id если есть, иначе channel
        channel_id = settings.get('channel_id')
        channel = settings.get('channel') or Config.CHANNEL
        # Определяем какой идентификатор использовать для проверки
        channel_to_check = channel_id if channel_id else channel
        
        # Убеждаемся что channel_to_check - строка
        if require_subscription and channel_to_check and isinstance(channel_to_check, str) and channel_to_check.strip():
            try:
                is_subscribed = await asyncio.wait_for(
                    check_channel_subscription(bot, message.from_user.id, channel_to_check),
                    timeout=5.0  # 5 секунд таймаут для проверки подписки
                )
                
                if not is_subscribed:
                    # Показываем сообщение с кнопкой подписки
                    # Для отображения используем channel (username), если есть, иначе channel_id
                    channel_display = channel if channel and not channel.startswith('-') else (channel_id or channel_to_check)
                    subscribe_text = get_text(lang, 'start', 'subscribe_required', channel=channel_display)
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
                    
                    try:
                        await message.answer(subscribe_text, reply_markup=keyboard)
                        logger.info(f"[Start] User {message.from_user.id} not subscribed, sent subscription message")
                    except Exception as send_error:
                        logger.error(f"[Start] Failed to send subscription message to user {message.from_user.id}: {send_error}", exc_info=True)
                    return
            except asyncio.TimeoutError:
                logger.warning(f"[Start] Timeout checking subscription for user {message.from_user.id}, continuing...")
                # Продолжаем работу при таймауте
            except Exception as e:
                logger.error(f"[Start] Error checking subscription for user {message.from_user.id}: {e}")
                # Продолжаем работу, если проверка не удалась
        
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
        
        try:
            await message.answer(text, reply_markup=keyboard)
            logger.info(f"[Start] Sent main menu to user {message.from_user.id}")
            
            # Если пользователь админ - отправляем кнопки управления PM2
            if message.from_user.id in Config.ADMIN_IDS:
                await asyncio.sleep(0.5)  # Небольшая задержка между сообщениями
                
                # Сообщение 1: Отключить ботов
                keyboard_stop = InlineKeyboardMarkup(inline_keyboard=[
                    [InlineKeyboardButton(
                        text='🛑 Отключить ботов',
                        callback_data='pm2_stop'
                    )]
                ])
                await message.answer(
                    '🛑 Управление сервером\n\nНажмите кнопку для отключения всех ботов (pm2 stop all)',
                    reply_markup=keyboard_stop
                )
                
                await asyncio.sleep(0.5)  # Небольшая задержка между сообщениями
                
                # Сообщение 2: Включить ботов
                keyboard_start = InlineKeyboardMarkup(inline_keyboard=[
                    [InlineKeyboardButton(
                        text='▶️ Включить ботов',
                        callback_data='pm2_restart'
                    )]
                ])
                await message.answer(
                    '▶️ Управление сервером\n\nНажмите кнопку для включения/перезапуска всех ботов (pm2 restart all)',
                    reply_markup=keyboard_start
                )
        except Exception as send_error:
            logger.error(f"[Start] Failed to send message to user {message.from_user.id}: {send_error}", exc_info=True)
            # Пытаемся отправить простое сообщение без клавиатуры
            try:
                await message.answer("Привет! Используйте кнопки меню для навигации.")
            except Exception as fallback_error:
                logger.error(f"[Start] Failed to send fallback message: {fallback_error}")
    except Exception as e:
        logger.error(f"[Start] Critical error in cmd_start for user {message.from_user.id}: {e}", exc_info=True)
        # Пытаемся отправить сообщение об ошибке
        try:
            await message.answer("❌ Произошла ошибка. Попробуйте позже или обратитесь в поддержку.")
        except:
            pass

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
    
    # Используем channel_id если есть, иначе channel
    channel_id = settings.get('channel_id')
    channel = settings.get('channel') or Config.CHANNEL
    # Определяем какой идентификатор использовать для проверки
    channel_to_check = channel_id if channel_id else channel
    
    # Убеждаемся что channel_to_check - строка
    if not channel_to_check or not isinstance(channel_to_check, str) or not channel_to_check.strip():
        # ВАЖНО: Отвечаем на callback сразу, чтобы избежать ошибки "query is too old"
        try:
            await callback.answer(get_text(lang, 'start', 'subscription_error', default='Ошибка проверки подписки'), show_alert=True)
        except Exception as e:
            logger.warning(f"[CheckSubscription] Failed to answer callback: {e}")
        return
    
    # Проверяем подписку
    is_subscribed = await check_channel_subscription(bot, callback.from_user.id, channel_to_check)
    
    if is_subscribed:
        # ВАЖНО: Отвечаем на callback сразу, чтобы избежать ошибки "query is too old"
        try:
            await callback.answer()
        except Exception as e:
            logger.warning(f"[CheckSubscription] Failed to answer callback: {e}")
        
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
        
        # Если пользователь админ - отправляем кнопки управления PM2
        if callback.from_user.id in Config.ADMIN_IDS:
            await asyncio.sleep(0.5)
            
            keyboard_stop = InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(
                    text='🛑 Отключить ботов',
                    callback_data='pm2_stop'
                )]
            ])
            await callback.message.answer(
                '🛑 Управление сервером\n\nНажмите кнопку для отключения всех ботов (pm2 stop all)',
                reply_markup=keyboard_stop
            )
            
            await asyncio.sleep(0.5)
            
            keyboard_start = InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(
                    text='▶️ Включить ботов',
                    callback_data='pm2_restart'
                )]
            ])
            await callback.message.answer(
                '▶️ Управление сервером\n\nНажмите кнопку для включения/перезапуска всех ботов (pm2 restart all)',
                reply_markup=keyboard_start
            )
    else:
        # Еще не подписан
        try:
            await callback.answer(
                get_text(lang, 'start', 'not_subscribed', default='Пожалуйста, сначала подпишитесь на канал'),
                show_alert=True
            )
        except Exception as e:
            logger.warning(f"[CheckSubscription] Failed to answer callback: {e}")

@router.callback_query(F.data == 'main_menu')
async def main_menu_callback(callback: CallbackQuery, state: FSMContext, bot: Bot):
    """Обработка кнопки 'Главное меню'"""
    # ВАЖНО: Отвечаем на callback как можно раньше, чтобы избежать ошибки "query is too old"
    try:
        await callback.answer()
    except Exception as e:
        # Игнорируем ошибки устаревших callback queries
        logger.warning(f"[MainMenu] Failed to answer callback: {e}")
    
    lang = await get_lang_from_state(state)
    
    # Очищаем состояние
    await state.clear()
    
    # Восстанавливаем язык
    await state.update_data(language=lang)
    
    # Останавливаем таймер и удаляем сообщение с QR-кодом если есть
    data = await state.get_data()
    qr_message_id = data.get('qr_message_id')
    if qr_message_id:
        from handlers.deposit import active_timers
        timer_key = f"{callback.message.chat.id}_{qr_message_id}"
        active_timers.pop(timer_key, None)
        
        try:
            await bot.delete_message(chat_id=callback.message.chat.id, message_id=qr_message_id)
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

@router.callback_query(F.data == 'pm2_stop')
async def pm2_stop_callback(callback: CallbackQuery, bot: Bot):
    """Обработка кнопки 'Отключить ботов'"""
    import logging
    logger = logging.getLogger(__name__)
    
    # Проверяем, является ли пользователь админом
    if callback.from_user.id not in Config.ADMIN_IDS:
        try:
            await callback.answer('❌ У вас нет прав для выполнения этого действия', show_alert=True)
        except:
            pass
        return
    
    try:
        await callback.answer('⏳ Выполняется команда pm2 stop all...')
    except:
        pass
    
    try:
        result = await APIClient.manage_pm2('stop')
        
        if result.get('success'):
            await callback.message.answer(
                '✅ Боты успешно отключены!\n\nКоманда: `pm2 stop all`\n\n' + 
                (f'Вывод:\n```\n{result.get("stdout", "")}\n```' if result.get("stdout") else ''),
                parse_mode='Markdown'
            )
            logger.info(f"[PM2] User {callback.from_user.id} stopped all PM2 processes")
        else:
            error_msg = result.get('message', 'Неизвестная ошибка')
            await callback.message.answer(f'❌ Ошибка при отключении ботов:\n\n{error_msg}')
            logger.error(f"[PM2] Failed to stop PM2: {error_msg}")
    except Exception as e:
        logger.error(f"[PM2] Error stopping PM2: {e}", exc_info=True)
        try:
            await callback.message.answer(f'❌ Ошибка при выполнении команды: {str(e)}')
        except:
            pass

@router.callback_query(F.data == 'pm2_restart')
async def pm2_restart_callback(callback: CallbackQuery, bot: Bot):
    """Обработка кнопки 'Включить ботов'"""
    import logging
    logger = logging.getLogger(__name__)
    
    # Проверяем, является ли пользователь админом
    if callback.from_user.id not in Config.ADMIN_IDS:
        try:
            await callback.answer('❌ У вас нет прав для выполнения этого действия', show_alert=True)
        except:
            pass
        return
    
    try:
        await callback.answer('⏳ Выполняется команда pm2 restart all...')
    except:
        pass
    
    try:
        result = await APIClient.manage_pm2('restart')
        
        if result.get('success'):
            await callback.message.answer(
                '✅ Боты успешно перезапущены!\n\nКоманда: `pm2 restart all`\n\n' + 
                (f'Вывод:\n```\n{result.get("stdout", "")}\n```' if result.get("stdout") else ''),
                parse_mode='Markdown'
            )
            logger.info(f"[PM2] User {callback.from_user.id} restarted all PM2 processes")
        else:
            error_msg = result.get('message', 'Неизвестная ошибка')
            await callback.message.answer(f'❌ Ошибка при перезапуске ботов:\n\n{error_msg}')
            logger.error(f"[PM2] Failed to restart PM2: {error_msg}")
    except Exception as e:
        logger.error(f"[PM2] Error restarting PM2: {e}", exc_info=True)
        try:
            await callback.message.answer(f'❌ Ошибка при выполнении команды: {str(e)}')
        except:
            pass

