from aiogram import Router, F, Bot
from aiogram.types import Message, CallbackQuery, FSInputFile, BufferedInputFile
from aiogram.fsm.context import FSMContext
from aiogram.types import ReplyKeyboardMarkup, KeyboardButton, ReplyKeyboardRemove
from aiogram.exceptions import TelegramNetworkError, TelegramRetryAfter
from states import DepositStates
from config import Config
from api_client import APIClient
from translations import get_text
import re
import os
import base64
import asyncio
import time
from pathlib import Path

router = Router()

# Словарь для отслеживания активных таймеров (чтобы можно было их остановить)
active_timers = {}

async def retry_telegram_api_call(call_func, max_retries=3, initial_delay=1.0, max_delay=10.0, backoff_factor=2.0):
    """
    Повторяет вызов Telegram API с экспоненциальной задержкой при ошибках сети.
    
    Args:
        call_func: Асинхронная функция для вызова
        max_retries: Максимальное количество попыток
        initial_delay: Начальная задержка в секундах
        max_delay: Максимальная задержка в секундах
        backoff_factor: Множитель для экспоненциальной задержки
    
    Returns:
        Результат вызова функции
    
    Raises:
        Последнее исключение, если все попытки не удались
    """
    import logging
    logger = logging.getLogger(__name__)
    
    last_exception = None
    delay = initial_delay
    
    for attempt in range(max_retries):
        try:
            return await call_func()
        except TelegramRetryAfter as e:
            # Telegram просит подождать определенное время
            wait_time = e.retry_after
            logger.warning(f"[Retry] Telegram rate limit, waiting {wait_time} seconds...")
            await asyncio.sleep(wait_time)
            # Повторяем попытку после ожидания
            continue
        except TelegramNetworkError as e:
            last_exception = e
            if attempt < max_retries - 1:
                logger.warning(f"[Retry] Telegram network error (attempt {attempt + 1}/{max_retries}): {e}")
                logger.info(f"[Retry] Retrying in {delay:.1f} seconds...")
                await asyncio.sleep(delay)
                delay = min(delay * backoff_factor, max_delay)
            else:
                logger.error(f"[Retry] All {max_retries} attempts failed: {e}")
        except Exception as e:
            # Для других ошибок не повторяем
            logger.error(f"[Retry] Non-retryable error: {e}")
            raise
    
    # Если все попытки не удались, выбрасываем последнее исключение
    if last_exception:
        raise last_exception
    raise Exception("All retry attempts failed")

async def update_qr_timer(bot: Bot, chat_id: int, message_id: int, created_at: int, duration: int, lang: str, amount: float, casino: str, account_id: str, keyboard, state: FSMContext = None, request_id: str = None):
    """Фоновая задача для обновления таймера в сообщении с QR кодом"""
    timer_key = f"{chat_id}_{message_id}"
    active_timers[timer_key] = True
    
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"[Timer] Started for message {message_id}, created_at={created_at}, duration={duration}")
    
    try:
        while active_timers.get(timer_key, False):
            current_time = int(time.time())
            elapsed = current_time - created_at
            remaining = max(0, duration - elapsed)
            
            if remaining <= 0:
                # Таймер истек
                logger.info(f"[Timer] Expired for message {message_id}, deleting message and returning to main menu")
                
                # ВАЖНО: Отклоняем заявку при истечении таймера
                if request_id:
                    try:
                        from api_client import APIClient
                        reject_result = await APIClient.update_request(
                            request_id=request_id,
                            status='rejected',
                            status_detail='Таймер истек'
                        )
                        if reject_result.get('success'):
                            logger.info(f"[Timer] Auto-rejected request {request_id} due to timer expiration")
                        else:
                            logger.warning(f"[Timer] Failed to reject request {request_id}: {reject_result.get('error')}")
                    except Exception as e:
                        logger.error(f"[Timer] Error rejecting request {request_id}: {e}")
                elif state:
                    # Пытаемся получить request_id из state
                    try:
                        data = await state.get_data()
                        pending_request_id = data.get('pending_request_id') or data.get('request_id')
                        if pending_request_id:
                            from api_client import APIClient
                            reject_result = await APIClient.update_request(
                                request_id=str(pending_request_id),
                                status='rejected',
                                status_detail='Таймер истек'
                            )
                            if reject_result.get('success'):
                                logger.info(f"[Timer] Auto-rejected request {pending_request_id} due to timer expiration")
                            else:
                                logger.warning(f"[Timer] Failed to reject request {pending_request_id}: {reject_result.get('error')}")
                    except Exception as e:
                        logger.warning(f"[Timer] Could not reject request from state: {e}")
                
                # Удаляем сообщение с QR-кодом
                try:
                    await bot.delete_message(chat_id=chat_id, message_id=message_id)
                    logger.info(f"[Timer] Deleted QR message {message_id}")
                except Exception as e:
                    logger.warning(f"[Timer] Could not delete message {message_id}: {e}")
                
                # Отправляем главное меню
                try:
                    from handlers.start import cmd_start
                    from aiogram.fsm.context import FSMContext
                    from aiogram.types import Message as TelegramMessage
                    
                    # Создаем объект Message для отправки главного меню
                    # Но для этого нужен реальный объект message, создадим через bot.send_message
                    from config import Config
                    from aiogram.types import ReplyKeyboardMarkup, KeyboardButton
                    
                    first_name = "пользователь" if lang == 'ru' else "колдонуучу"
                    text = f"""{get_text(lang, 'start', 'greeting', name=first_name)}

{get_text(lang, 'start', 'auto_deposit')}
{get_text(lang, 'start', 'auto_withdraw')}
{get_text(lang, 'start', 'working')}

{get_text(lang, 'start', 'support', support=Config.SUPPORT)}"""
                    
                    keyboard_main = ReplyKeyboardMarkup(
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
                    
                    # Отправляем сообщение с главным меню
                    timeout_message = get_text(lang, 'deposit', 'timer_expired', default='⏰ Время на оплату истекло. Вы возвращены в главное меню.')
                    await bot.send_message(
                        chat_id=chat_id,
                        text=f"{timeout_message}\n\n{text}",
                        reply_markup=keyboard_main
                    )
                    logger.info(f"[Timer] Sent main menu to chat {chat_id}")
                    
                    # Очищаем состояние FSM
                    if state:
                        try:
                            await state.clear()
                            logger.info(f"[Timer] Cleared FSM state for chat {chat_id}")
                        except Exception as e:
                            logger.warning(f"[Timer] Could not clear state: {e}")
                except Exception as e:
                    logger.error(f"[Timer] Error sending main menu: {e}")
                
                break
            
            # Форматируем оставшееся время
            minutes = remaining // 60
            seconds = remaining % 60
            timer_text = f"{minutes}:{seconds:02d}"
            
            # Обновляем текст сообщения
            payment_text = get_text(lang, 'deposit', 'qr_payment_info',
                                   amount=amount,
                                   casino=casino,
                                   account_id=account_id,
                                   timer=timer_text)
            
            try:
                # Обновляем текст и сохраняем клавиатуру
                await bot.edit_message_caption(
                    chat_id=chat_id,
                    message_id=message_id,
                    caption=payment_text,
                    reply_markup=keyboard if keyboard else None
                )
                logger.debug(f"[Timer] Updated message {message_id} to {timer_text}")
            except Exception as e:
                error_str = str(e).lower()
                # Если сообщение было удалено или не найдено, останавливаем таймер
                if 'not found' in error_str or 'message to edit not found' in error_str or 'message can\'t be edited' in error_str:
                    logger.info(f"[Timer] Message {message_id} not found or can't be edited, stopping timer: {e}")
                    active_timers[timer_key] = False
                    break
                # Если сообщение не изменено (то же содержимое) - это нормально, просто продолжаем
                elif 'message is not modified' in error_str or 'not modified' in error_str:
                    logger.debug(f"[Timer] Message {message_id} not modified (same content), continuing...")
                    # Продолжаем работу, это нормальная ситуация
                else:
                    # Для других ошибок логируем предупреждение и продолжаем
                    logger.warning(f"[Timer] Could not update message {message_id}: {e}")
                    await asyncio.sleep(1)
                    continue
            
            # Ждем 1 секунду до следующего обновления
            await asyncio.sleep(1)
            
    except asyncio.CancelledError:
        logger.info(f"[Timer] Cancelled for message {message_id}")
        pass
    except Exception as e:
        logger.error(f"[Timer] Error in timer for message {message_id}: {e}")
    finally:
        # Удаляем таймер из активных
        active_timers.pop(timer_key, None)
        logger.info(f"[Timer] Stopped for message {message_id}")

async def get_lang_from_state(state: FSMContext) -> str:
    """Получить язык из состояния"""
    data = await state.get_data()
    return data.get('language', 'ru')

@router.message(F.text.in_(['💰 Пополнить', '💰 Толтуруу']))
async def deposit_start(message: Message, state: FSMContext):
    """Начало процесса пополнения - выбор казино"""
    from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
    import asyncio
    import logging
    logger = logging.getLogger(__name__)
    
    # Сохраняем язык перед очисткой состояния
    lang = await get_lang_from_state(state)
    
    # ВАЖНО: Проверяем блокировку пользователя СРАЗУ, до начала процесса
    try:
        blocked_check = await asyncio.wait_for(
            APIClient.check_blocked(str(message.from_user.id)),
            timeout=2.0  # Максимум 2 секунды на проверку
        )
        if blocked_check.get('success') and blocked_check.get('data', {}).get('blocked'):
            blocked_data = blocked_check.get('data', {})
            blocked_message = blocked_data.get('message', 'Вы заблокированы')
            await message.answer(blocked_message)
            return
    except asyncio.TimeoutError:
        logger.warning(f"[Deposit] Timeout checking blocked status for user {message.from_user.id}, continuing...")
        # Продолжаем работу при таймауте
    except Exception as e:
        logger.error(f"[Deposit] Error checking blocked status: {e}")
        # Продолжаем работу, если проверка не удалась
    
    # Очищаем предыдущее состояние (если была незавершенная операция)
    await state.clear()
    
    # Восстанавливаем язык
    await state.update_data(language=lang)
    
    # Проверяем активные заявки на пополнение СРАЗУ, до начала процесса
    # Используем короткий таймаут, чтобы не блокировать пользователя
    try:
        # Используем asyncio.wait_for для ограничения времени ожидания
        import asyncio
        active_check = await asyncio.wait_for(
            APIClient.check_active_deposit(str(message.from_user.id)),
            timeout=1.0  # Максимум 1 секунда на проверку
        )
        if active_check.get('success') and active_check.get('data', {}).get('hasActive'):
            active_data = active_check.get('data', {})
            request_id = active_data.get('requestId')
            time_ago = active_data.get('timeAgoMinutes', 0)
            
            # Формируем сообщение об ошибке
            if lang == 'ru':
                error_message = f"⚠️ У вас уже есть активная заявка на пополнение (ID: #{request_id}, создана {time_ago} мин. назад).\n\nПожалуйста, дождитесь обработки первой заявки перед созданием новой."
            else:
                error_message = f"⚠️ Сизде буга чейин активдүү толтуруу өтүнүчү бар (ID: #{request_id}, {time_ago} мүн. мурун түзүлгөн).\n\nБиринчи өтүнүчтү иштетүүнү күтүңүз."
            
            await message.answer(error_message)
            return
    except asyncio.TimeoutError:
        # Если проверка заняла слишком много времени, продолжаем процесс
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Active deposit check timeout, continuing with deposit process")
    except Exception as e:
        # Если проверка не удалась, продолжаем процесс (не блокируем пользователя)
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Failed to check active deposit: {e}, continuing with deposit process")
    
    # Получаем настройки из админки
    settings = await APIClient.get_payment_settings()
    
    # Проверяем pause режим
    if settings.get('pause', False):
        maintenance_message = settings.get('maintenance_message', get_text(lang, 'start', 'bot_paused'))
        await message.answer(maintenance_message)
        return
    
    # Проверяем, включены ли депозиты
    deposits = settings.get('deposits', {})
    if isinstance(deposits, dict):
        deposits_enabled = deposits.get('enabled', True)
    else:
        deposits_enabled = deposits if deposits is not False else True
    
    if not deposits_enabled:
        await message.answer(get_text(lang, 'deposit', 'deposits_disabled'))
        return
    
    enabled_casinos = settings.get('casinos', {})
    
    # Фильтруем казино по настройкам (показываем только включенные)
    # 1xbet - одна кнопка в строке, остальные - по 2 в строке
    keyboard = InlineKeyboardMarkup(inline_keyboard=[])
    row = []
    for casino in Config.CASINOS:
        # Проверяем, включено ли казино (по умолчанию true, если не указано)
        casino_id = casino['id']
        if enabled_casinos.get(casino_id, True):
            # 1xbet - отдельная строка (одна кнопка)
            if casino_id == '1xbet':
                keyboard.inline_keyboard.append([InlineKeyboardButton(
                    text=casino['name'],
                    callback_data=f'casino_{casino_id}'
                )])
            else:
                # Остальные казино - по 2 в строке
                row.append(InlineKeyboardButton(
                    text=casino['name'],
                    callback_data=f'casino_{casino_id}'
                ))
                # Когда в ряду 2 кнопки, добавляем ряд в клавиатуру
                if len(row) == 2:
                    keyboard.inline_keyboard.append(row)
                    row = []  # Создаем новый ряд
    # Добавляем оставшиеся кнопки (если их меньше 2)
    if row:
        keyboard.inline_keyboard.append(row)
    
    if not keyboard.inline_keyboard:
        await message.answer(get_text(lang, 'deposit', 'no_casinos_available'))
        return
    
    await message.answer(
        get_text(lang, 'deposit', 'select_casino'),
        reply_markup=keyboard
    )
    await state.set_state(DepositStates.waiting_for_casino)

@router.callback_query(F.data.startswith('casino_'), DepositStates.waiting_for_casino)
async def deposit_casino_selected(callback: CallbackQuery, state: FSMContext, bot: Bot):
    """Казино выбрано, запрашиваем ID счета"""
    lang = await get_lang_from_state(state)
    casino_id = callback.data.replace('casino_', '')
    
    # Проверяем, включено ли казино
    settings = await APIClient.get_payment_settings()
    enabled_casinos = settings.get('casinos', {})
    if enabled_casinos.get(casino_id, True) is False:
        await callback.answer(get_text(lang, 'deposit', 'casino_disabled', default='❌ Это казино временно отключено'), show_alert=True)
        return
    
    casino_name = next((c['name'] for c in Config.CASINOS if c['id'] == casino_id), casino_id)
    
    await state.update_data(casino_id=casino_id, casino_name=casino_name)
    
    # Получаем chat_id ДО удаления сообщения (на случай если сообщение станет недоступным)
    chat_id = callback.message.chat.id if hasattr(callback.message, 'chat') else callback.from_user.id
    
    # Удаляем сообщение с кнопками выбора букмекера
    try:
        await callback.message.delete()
    except Exception:
        pass  # Игнорируем ошибки удаления (если сообщение уже удалено или нет прав)
    
    # Получаем сохраненный ID казино для этого пользователя
    saved_account_id = None
    try:
        saved_id_result = await APIClient.get_saved_casino_account_id(str(callback.from_user.id), casino_id)
        if saved_id_result.get('success') and saved_id_result.get('data', {}).get('accountId'):
            saved_account_id = saved_id_result.get('data', {}).get('accountId')
    except Exception:
        pass  # Игнорируем ошибки получения сохраненного ID
    
    # Формируем клавиатуру: если есть сохраненный ID, добавляем его как кнопку
    keyboard_buttons = []
    if saved_account_id:
        keyboard_buttons.append([KeyboardButton(text=saved_account_id)])
    keyboard_buttons.append([KeyboardButton(text=get_text(lang, 'deposit', 'cancel'))])
    
    keyboard = ReplyKeyboardMarkup(
        keyboard=keyboard_buttons,
        resize_keyboard=True
    )
    
    # Отправляем фото казино с текстом
    # Фото находятся в папке telegram_bot/images
    # ВАЖНО: Используем bot.send_photo() вместо callback.message.answer_photo()
    # чтобы избежать ошибки InaccessibleMessage
    photo_path = Path(__file__).parent.parent / "images" / f"{casino_id}.jpg"
    if photo_path.exists():
        photo = FSInputFile(str(photo_path))
        try:
            await bot.send_photo(
                chat_id=chat_id,
                photo=photo,
                caption=get_text(lang, 'deposit', 'enter_account_id', casino=casino_name),
                reply_markup=keyboard
            )
        except Exception as e:
            # Если не удалось отправить фото, отправляем только текст
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"[Deposit] Failed to send photo for casino {casino_id}: {e}")
            await bot.send_message(
                chat_id=chat_id,
                text=get_text(lang, 'deposit', 'enter_account_id', casino=casino_name),
                reply_markup=keyboard
            )
    else:
        # Если фото нет, отправляем только текст
        await bot.send_message(
            chat_id=chat_id,
            text=get_text(lang, 'deposit', 'enter_account_id', casino=casino_name),
            reply_markup=keyboard
        )
    
    await state.set_state(DepositStates.waiting_for_account_id)
    await callback.answer()

@router.message(DepositStates.waiting_for_account_id)
async def deposit_account_id_received(message: Message, state: FSMContext, bot: Bot):
    """ID счета получен, запрашиваем сумму"""
    import logging
    logger = logging.getLogger(__name__)
    
    lang = await get_lang_from_state(state)
    
    if message.text == get_text(lang, 'deposit', 'cancel'):
        await state.clear()
        # Показываем главное меню
        from handlers.start import cmd_start
        await cmd_start(message, state, bot)
        return
    
    # Проверяем, что сообщение содержит текст
    if not message.text:
        await message.answer(get_text(lang, 'deposit', 'invalid_account_id') or 'Пожалуйста, отправьте ID счета текстом')
        return
    
    account_id = message.text.strip()
    
    if not account_id or not account_id.isdigit():
        await message.answer(get_text(lang, 'deposit', 'invalid_account_id'))
        return

    # ВАЖНО: Проверяем блокировку accountId ПЕРЕД сохранением
    try:
        blocked_check = await asyncio.wait_for(
            APIClient.check_blocked(str(message.from_user.id), account_id),
            timeout=2.0  # Максимум 2 секунды на проверку
        )
        if blocked_check.get('success') and blocked_check.get('data', {}).get('blocked'):
            blocked_data = blocked_check.get('data', {})
            blocked_message = blocked_data.get('message', 'Аккаунт заблокирован')
            await message.answer(blocked_message)
            return
    except asyncio.TimeoutError:
        logger.warning(f"[Deposit] Timeout checking blocked accountId for user {message.from_user.id}")
        # Продолжаем работу при таймауте
    except Exception as e:
        logger.error(f"[Deposit] Error checking blocked accountId: {e}")
        # Продолжаем работу, если проверка не удалась

    # Получаем casino_id из state для сохранения
    data = await state.get_data()
    casino_id = data.get('casino_id')
    
    # Сохраняем ID казино для этого пользователя
    if casino_id:
        try:
            await APIClient.save_casino_account_id(str(message.from_user.id), casino_id, account_id)
        except Exception:
            pass  # Игнорируем ошибки сохранения

    # Проверяем игрока через API (кроме 1win/mostbet)
    player_info = None

    if casino_id and casino_id not in ['1win', 'mostbet']:
        checking_msg = await message.answer("🔍 Проверяю ID игрока...")
        try:
            check_result = await APIClient.check_player(casino_id, account_id)
            
            check_success = check_result.get('success')
            check_data = check_result.get('data') or {}
            player_exists = check_data.get('exists')
            player_info = check_data.get('player') or {}
            
            # Если проверка явно показала что игрок не существует - отклоняем
            if check_success and player_exists is False:
                try:
                    await checking_msg.delete()
                except:
                    pass
                await message.answer(get_text(lang, 'deposit', 'player_not_found'))
                return
                
            # Если проверка успешна и игрок существует - используем данные
            if check_success and (player_exists is True or player_info):
                player_info = check_data.get('player') or {}
            # Если проверка не удалась (ошибка API, таймаут и т.д.) - пропускаем проверку
            # и продолжаем процесс пополнения
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Error checking player: {e}, continuing with deposit")
            # Продолжаем процесс пополнения даже если проверка не удалась
        finally:
            try:
                await checking_msg.delete()
            except:
                pass

    await state.update_data(account_id=account_id, player_info=player_info)
    
    # Клавиатура с быстрыми кнопками сумм
    keyboard = ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(text='100'),
                KeyboardButton(text='500'),
                KeyboardButton(text='1000')
            ],
            [
                KeyboardButton(text='5000'),
                KeyboardButton(text='10000')
            ],
            [
                KeyboardButton(text=get_text(lang, 'deposit', 'cancel'))
            ]
        ],
        resize_keyboard=True
    )
    
    # Форматируем числа с пробелами для тысяч
    min_formatted = f"{Config.DEPOSIT_MIN:,}".replace(',', ' ')
    max_formatted = f"{Config.DEPOSIT_MAX:,}".replace(',', ' ')
    amount_prompt = get_text(lang, 'deposit', 'enter_amount', min=min_formatted, max=max_formatted)

    await message.answer(
        amount_prompt,
        reply_markup=keyboard
    )
    await state.set_state(DepositStates.waiting_for_amount)

@router.message(DepositStates.waiting_for_amount)
async def deposit_amount_received(message: Message, state: FSMContext, bot: Bot):
    """Сумма получена, генерируем QR код и показываем кнопки банков"""
    import logging
    logger = logging.getLogger(__name__)
    
    lang = await get_lang_from_state(state)
    
    # Игнорируем невидимые символы (например, неразрывный пробел)
    # Проверяем наличие текста перед использованием методов
    if not message.text:
        return
    if not message.text.strip() or message.text.strip() == '\u200B':
        return
    
    # Проверяем отмену (только если текст сообщения точно совпадает с текстом кнопки отмены)
    cancel_text = get_text(lang, 'deposit', 'cancel')
    if message.text and message.text.strip() == cancel_text.strip():
        # Останавливаем таймер и удаляем сообщение с QR-кодом если есть
        data = await state.get_data()
        qr_message_id = data.get('qr_message_id')
        
        if qr_message_id:
            # Останавливаем таймер
            timer_key = f"{message.chat.id}_{qr_message_id}"
            active_timers.pop(timer_key, None)
            
            try:
                await bot.delete_message(chat_id=message.chat.id, message_id=qr_message_id)
            except Exception:
                pass
                
        await state.clear()
        # Показываем главное меню
        from handlers.start import cmd_start
        await cmd_start(message, state, bot)
        return
    
    try:
        amount_text = message.text.strip().replace(' ', '').replace(',', '.')
        amount = float(amount_text)
        
        if amount < Config.DEPOSIT_MIN or amount > Config.DEPOSIT_MAX:
            # Форматируем числа с пробелами для тысяч
            min_formatted = f"{Config.DEPOSIT_MIN:,}".replace(',', ' ')
            max_formatted = f"{Config.DEPOSIT_MAX:,}".replace(',', ' ')
            await message.answer(
                get_text(lang, 'deposit', 'invalid_amount', min=min_formatted, max=max_formatted)
            )
            return
        
        data = await state.get_data()
        casino_id = data.get('casino_id')
        account_id = data.get('account_id')
        
        # Проверяем наличие необходимых данных
        if not casino_id or not account_id:
            await message.answer(get_text(lang, 'deposit', 'error'))
            await state.clear()
            from handlers.start import cmd_start
            await cmd_start(message, state, bot)
            return
        
        # Получаем уникальную сумму с копейками (резервация на 10 минут)
        amount_with_cents = None
        try:
            unique_result = await APIClient.get_unique_amount(
                user_id=str(message.from_user.id),
                account_id=account_id,
                amount=amount,
                bookmaker=casino_id,
                bank='omoney',
                bot_type=Config.BOT_TYPE
            )
            # КРИТИЧНО: Проверяем, что админка вернула валидные данные
            if unique_result.get('success') and unique_result.get('data', {}).get('amount'):
                amount_str = str(unique_result.get('data', {}).get('amount'))
                amount_with_cents = float(amount_str)
                
                # Проверяем, что копейки не равны 00 (проверяем и числовое, и строковое представление)
                cents_value = amount_with_cents - int(amount_with_cents)
                # Проверяем строковое представление для точности (например, "1000.00" -> копейки = 00)
                amount_parts = amount_str.split('.')
                has_zero_cents = False
                if len(amount_parts) == 2:
                    cents_part = amount_parts[1].strip()
                    # Если копейки = "00" или "0" или пустая строка
                    if cents_part == '00' or cents_part == '0' or cents_part == '':
                        has_zero_cents = True
                
                # Если копейки равны 0 или 00 - считаем это ошибкой и используем fallback
                if abs(cents_value) < 0.001 or has_zero_cents:
                    logger.error(f"[Deposit] ❌ КРИТИЧНО: Unique amount returned with zero cents ({amount_str}), fallback to random. This should NEVER happen!")
                    amount_with_cents = None
                else:
                    reservation_id = unique_result.get('data', {}).get('reservationId')
                    if reservation_id:
                        await state.update_data(uncreated_request_id=str(reservation_id))
            else:
                # Если админка вернула успешный ответ, но без данных - это ошибка
                logger.warning(f"[Deposit] Admin returned success but no amount data: {unique_result}")
                amount_with_cents = None
        except Exception as e:
            logger.error(f"[Deposit] ❌ Failed to get unique amount from admin, fallback to random: {e}")
        
        # Fallback: случайные копейки (ОБЯЗАТЕЛЬНО от 1 до 99, НИКОГДА не 00)
        if amount_with_cents is None:
            import random
            # Генерируем копейки от 1 до 99 (НИКОГДА не 00)
            random_cents = random.randint(1, 99)
            amount_with_cents = amount + (random_cents / 100)
            logger.warning(f"[Deposit] ⚠️ Using fallback random cents: {random_cents} (amount: {amount_with_cents})")
        
        # ФИНАЛЬНАЯ ПРОВЕРКА: Если копейки все равно 00 (не должно быть, но на всякий случай)
        final_cents = amount_with_cents - int(amount_with_cents)
        if abs(final_cents) < 0.001:
            import random
            logger.error(f"[Deposit] ❌ КРИТИЧНО: Final amount still has zero cents ({amount_with_cents}), regenerating!")
            random_cents = random.randint(1, 99)
            amount_with_cents = amount + (random_cents / 100)
            logger.warning(f"[Deposit] Regenerated with cents: {random_cents} (amount: {amount_with_cents})")
        
        # Сохраняем сумму в состояние
        await state.update_data(amount=amount_with_cents)
        
        # Показываем сообщение о генерации QR и очищаем клавиатуру
        generating_msg = await message.answer(
            get_text(lang, 'deposit', 'generating_qr'),
            reply_markup=ReplyKeyboardRemove()
        )
        
        try:
            # Генерируем QR hash и получаем ссылки банков
            logger.info(f"[Deposit] Generating QR hash for amount: {amount_with_cents}, casino: {casino_id}")
            qr_result = await APIClient.generate_qr(amount_with_cents, 'omoney')
            
            logger.info(f"[Deposit] QR hash result: success={qr_result.get('success')}, error={qr_result.get('error')}")
            
            if not qr_result.get('success'):
                error_msg = qr_result.get('error', 'Unknown error')
                logger.error(f"[Deposit] QR hash generation failed: {error_msg}")
                await generating_msg.delete()
                # Более детальное сообщение об ошибке
                if 'No active wallet' in error_msg or 'requisite' in error_msg.lower():
                    await message.answer("❌ Ошибка: не настроен активный кошелек для приема платежей. Обратитесь к администратору.")
                else:
                    await message.answer(get_text(lang, 'deposit', 'qr_error'))
                return
            
            qr_hash = qr_result.get('qr_hash')
            all_bank_urls = qr_result.get('all_bank_urls', {})
            
            if not qr_hash:
                logger.error(f"[Deposit] QR hash is empty in response: {qr_result}")
                await generating_msg.delete()
                await message.answer(get_text(lang, 'deposit', 'qr_error'))
                return
            
            logger.info(f"[Deposit] QR hash generated successfully: {qr_hash[:20]}...")
            
            # Генерируем QR изображение через payment_site API
            logger.info(f"[Deposit] Generating QR image for amount: {amount_with_cents}")
            qr_image_result = await APIClient.generate_qr_image(amount_with_cents, 'omoney')
            qr_image_base64 = qr_image_result.get('qr_image', '')
            
            logger.info(f"[Deposit] QR image result: has_image={bool(qr_image_base64)}, error={qr_image_result.get('error')}")
            
            if not qr_image_base64:
                error_msg = qr_image_result.get('error', 'Unknown error')
                logger.error(f"[Deposit] QR image generation failed: {error_msg}")
                await generating_msg.delete()
                # Более детальное сообщение об ошибке
                if 'timeout' in error_msg.lower() or 'connection' in error_msg.lower():
                    await message.answer("❌ Ошибка: не удалось подключиться к серверу генерации QR кода. Попробуйте позже.")
                else:
                    await message.answer(get_text(lang, 'deposit', 'qr_error'))
                return
            
            # Удаляем сообщение о генерации
            try:
                await generating_msg.delete()
            except:
                pass
            
            # Конвертируем base64 в bytes для отправки фото
            # Убираем префикс data:image если есть
            if qr_image_base64.startswith('data:image'):
                qr_image_base64 = qr_image_base64.split(',', 1)[1]
            
            qr_image_bytes = base64.b64decode(qr_image_base64)
            
            # Создаем inline кнопки банков со ссылками (URL кнопки)
            from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
            
            # Получаем список банков из настроек или используем дефолтный
            settings = await APIClient.get_payment_settings()
            deposit_settings = settings.get('deposits', {})
            enabled_banks = deposit_settings.get('banks', ['mbank', 'omoney', 'bakai', 'megapay', 'demir', 'balance']) if isinstance(deposit_settings, dict) else ['mbank', 'omoney', 'bakai', 'megapay', 'demir', 'balance']
            
            # Маппинг ID банков на названия в all_bank_urls
            bank_name_map = {
                'mbank': 'MBank',
                'omoney': 'О банк',
                'bakai': 'Bakai',
                'megapay': 'MegaPay',
                'demir': 'DemirBank',
                'balance': 'Balance.kg'
            }
            
            # Фильтруем банки по включенным и создаем URL кнопки
            bank_buttons = []
            for bank in Config.DEPOSIT_BANKS:
                if bank['id'] in enabled_banks:
                    bank_name_key = bank_name_map.get(bank['id'], bank['name'])
                    bank_url = all_bank_urls.get(bank_name_key) or all_bank_urls.get(bank['id'])
                    if bank_url:
                        bank_buttons.append(InlineKeyboardButton(
                            text=bank['name'],
                            url=bank_url
                        ))
            
            # Проверяем, есть ли доступные банки
            if not bank_buttons:
                # Все банки отключены - показываем сообщение
                await message.answer(get_text(lang, 'deposit', 'banks_disabled'))
                return
            
            # Разбиваем кнопки по 2 в ряд
            keyboard_rows = []
            for i in range(0, len(bank_buttons), 2):
                row = bank_buttons[i:i+2]
                keyboard_rows.append(row)
            
            # Добавляем кнопку "Отмена" в последний ряд
            if keyboard_rows:
                # Если последний ряд неполный, добавляем отмену туда, иначе создаем новый ряд
                if len(keyboard_rows[-1]) == 1:
                    keyboard_rows[-1].append(InlineKeyboardButton(
                        text=get_text(lang, 'deposit', 'cancel'),
                        callback_data='deposit_cancel'
                    ))
                else:
                    keyboard_rows.append([InlineKeyboardButton(
                        text=get_text(lang, 'deposit', 'cancel'),
                        callback_data='deposit_cancel'
                    )])
            
            keyboard = InlineKeyboardMarkup(inline_keyboard=keyboard_rows) if keyboard_rows else None
            
            # Сохраняем время создания QR кода для таймера (5 минут = 300 секунд)
            qr_created_at = int(time.time())
            timer_duration = 300  # 5 минут в секундах
            await state.update_data(qr_created_at=qr_created_at, timer_duration=timer_duration)
            
            # Форматируем начальный таймер
            def format_timer(remaining_seconds):
                """Форматирует секунды в MM:SS"""
                minutes = remaining_seconds // 60
                seconds = remaining_seconds % 60
                return f"{minutes}:{seconds:02d}"
            
            remaining_seconds = timer_duration
            payment_text = get_text(lang, 'deposit', 'qr_payment_info',
                                   amount=amount_with_cents,
                                   casino=data.get("casino_name"),
                                   account_id=account_id,
                                   timer=format_timer(remaining_seconds))
            
            # Отправляем фото QR кода с inline кнопками банков и кнопкой "Отмена"
            # Используем BufferedInputFile для работы с bytes напрямую
            photo = BufferedInputFile(qr_image_bytes, filename='qr_code.png')
            
            # Используем retry логику для надежной отправки фото
            async def send_qr_photo():
                return await message.answer_photo(
                    photo=photo,
                    caption=payment_text,
                    reply_markup=keyboard if keyboard else None  # Inline клавиатура с банками и отменой
                )
            
            try:
                qr_message = await retry_telegram_api_call(
                    send_qr_photo,
                    max_retries=3,
                    initial_delay=2.0,
                    max_delay=15.0,
                    backoff_factor=2.0
                )
            except TelegramNetworkError as e:
                logger.error(f"[Deposit] Failed to send QR photo after retries: {e}")
                # Fallback: пытаемся отправить как документ
                try:
                    logger.info("[Deposit] Trying to send QR code as document as fallback...")
                    async def send_qr_document():
                        return await message.answer_document(
                            document=photo,
                            caption=payment_text,
                            reply_markup=keyboard if keyboard else None
                        )
                    qr_message = await retry_telegram_api_call(
                        send_qr_document,
                        max_retries=2,
                        initial_delay=2.0,
                        max_delay=10.0
                    )
                    logger.info("[Deposit] Successfully sent QR code as document")
                except Exception as fallback_error:
                    logger.error(f"[Deposit] Failed to send QR code as document: {fallback_error}")
                    # Последний fallback: отправляем только текст с информацией
                    await generating_msg.delete()
                    await message.answer(
                        f"{payment_text}\n\n⚠️ Не удалось отправить QR код. Пожалуйста, используйте кнопки банков выше для оплаты.",
                        reply_markup=keyboard if keyboard else None
                    )
                    # Не можем продолжить без QR сообщения, возвращаемся в главное меню
                    await state.clear()
                    from handlers.start import cmd_start
                    await cmd_start(message, state, bot)
                    return
            
            # Сохраняем ID сообщения с QR-кодом для возможности удаления и обновления
            await state.update_data(qr_message_id=qr_message.message_id)
            
            # ВАЖНО: НЕ создаем заявку при показе QR кода
            # Заявка будет создана только когда пользователь отправит фото чека
            # Это предотвращает блокировку новых заявок
            pending_request_id = None
            
            # Запускаем фоновую задачу для обновления таймера
            import logging
            logger = logging.getLogger(__name__)
            # Таймер обновляет только текст, без клавиатуры
            # request_id не передаем, так как заявка еще не создана
            timer_task = asyncio.create_task(update_qr_timer(bot, message.chat.id, qr_message.message_id, qr_created_at, timer_duration, lang, amount_with_cents, data.get("casino_name"), account_id, keyboard, state, None))
            logger.info(f"[Timer] Created timer task for message {qr_message.message_id}, chat {message.chat.id}")
            
            # Добавляем обработку ошибок для задачи
            def timer_task_done(task):
                try:
                    task.result()
                except Exception as e:
                    logger.error(f"[Timer] Timer task failed for message {qr_message.message_id}: {e}")
            
            timer_task.add_done_callback(timer_task_done)
            
            # Сразу переходим в состояние ожидания чека (без выбора банка)
            # Текст про отправку чека уже есть в caption сообщения с QR
            await state.set_state(DepositStates.waiting_for_receipt)
            
        except TelegramNetworkError as network_error:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Telegram network error generating QR code: {network_error}", exc_info=True)
            try:
                await generating_msg.delete()
            except:
                pass
            # Более детальное сообщение для сетевых ошибок
            if 'timeout' in str(network_error).lower():
                await message.answer("❌ Ошибка: превышено время ожидания ответа от Telegram. Пожалуйста, попробуйте позже.")
            else:
                await message.answer(get_text(lang, 'deposit', 'qr_error'))
            await state.clear()
            from handlers.start import cmd_start
            await cmd_start(message, state, bot)
            return
        except Exception as qr_error:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error generating QR code: {qr_error}", exc_info=True)
            try:
                await generating_msg.delete()
            except:
                pass
            await message.answer(get_text(lang, 'deposit', 'qr_error'))
            await state.clear()
            from handlers.start import cmd_start
            await cmd_start(message, state, bot)
            return
        
    except ValueError:
        lang = await get_lang_from_state(state)
        # Форматируем числа с пробелами для тысяч
        min_formatted = f"{Config.DEPOSIT_MIN:,}".replace(',', ' ')
        max_formatted = f"{Config.DEPOSIT_MAX:,}".replace(',', ' ')
        await message.answer(get_text(lang, 'deposit', 'invalid_amount', min=min_formatted, max=max_formatted))
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error in deposit_amount_received: {e}", exc_info=True)
        lang = await get_lang_from_state(state)
        
        # Проверяем, что данные есть в состоянии
        data = await state.get_data()
        if not data.get('casino_id') or not data.get('account_id'):
            await message.answer("❌ Ошибка: данные не найдены. Начните заново.")
        else:
            await message.answer(get_text(lang, 'deposit', 'error'))
        
        await state.clear()
        # Показываем главное меню после ошибки
        from handlers.start import cmd_start
        await cmd_start(message, state, bot)
        return


@router.callback_query(F.data == 'deposit_cancel')
async def deposit_cancel_callback(callback: CallbackQuery, state: FSMContext, bot: Bot):
    """Обработка нажатия на кнопку "Отмена" в процессе депозита"""
    # ВАЖНО: Отвечаем на callback query СРАЗУ, до выполнения долгих операций
    # Иначе callback query может истечь (Telegram требует ответ в течение нескольких секунд)
    try:
        await callback.answer()
    except Exception as e:
        # Если callback уже истек, просто игнорируем ошибку
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"[Deposit Cancel] Callback query expired: {e}")
    
    lang = await get_lang_from_state(state)
    
    # Останавливаем таймер и удаляем сообщение с QR-кодом если есть
    data = await state.get_data()
    qr_message_id = data.get('qr_message_id')
    
    if qr_message_id:
        # Останавливаем таймер
        timer_key = f"{callback.message.chat.id}_{qr_message_id}"
        active_timers.pop(timer_key, None)
        
        try:
            await bot.delete_message(chat_id=callback.message.chat.id, message_id=qr_message_id)
        except Exception:
            pass
    
    await state.clear()
    
    # Показываем главное меню
    from handlers.start import cmd_start
    await cmd_start(callback.message, state, bot)

@router.message(DepositStates.waiting_for_receipt, F.photo)
async def deposit_receipt_received(message: Message, state: FSMContext, bot: Bot):
    """Фото чека получено, создаем заявку"""
    lang = await get_lang_from_state(state)
    
    # КРИТИЧЕСКАЯ ПРОВЕРКА: Получаем данные из состояния ПЕРЕД обработкой фото
    # Если данных нет - это не процесс депозита, просто игнорируем фото
    data = await state.get_data()
    casino_id = data.get('casino_id')
    account_id = data.get('account_id')
    amount = data.get('amount')
    
    # Если нет обязательных данных - это НЕ процесс депозита, очищаем состояние и выходим
    if not casino_id or not account_id or not amount:
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"[Deposit] Photo received but no deposit data in state for user {message.from_user.id}, clearing state")
        await state.clear()
        # Не отправляем сообщение, просто игнорируем фото
        return
    
    # КРИТИЧЕСКАЯ ПРОВЕРКА: Проверяем, не истек ли таймер
    import time
    qr_created_at = data.get('qr_created_at')
    timer_duration = data.get('timer_duration')
    if qr_created_at and timer_duration:
        current_time = int(time.time())
        elapsed = current_time - qr_created_at
        if elapsed >= timer_duration:
            # Таймер истек, очищаем состояние и отклоняем фото
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"[Deposit] Photo received after timer expiration for user {message.from_user.id}, clearing state")
            await state.clear()
            await message.answer(get_text(lang, 'deposit', 'timer_expired', default='⏰ Время на оплату истекло. Пожалуйста, начните заново.'))
            return
    
    # Останавливаем таймер и удаляем сообщение с QR-кодом если есть
    qr_message_id = data.get('qr_message_id')
    if qr_message_id:
        # Останавливаем таймер
        timer_key = f"{message.chat.id}_{qr_message_id}"
        active_timers.pop(timer_key, None)
        
        try:
            await bot.delete_message(chat_id=message.chat.id, message_id=qr_message_id)
        except Exception:
            pass
    
    try:
        # Получаем самое большое фото
        photo = message.photo[-1]
        
        # Скачиваем фото
        file = await bot.get_file(photo.file_id)
        file_bytes = await bot.download_file(file.file_path)
        
        # Конвертируем в base64
        photo_bytes = file_bytes.read()
        photo_base64 = base64.b64encode(photo_bytes).decode('utf-8')
        # Добавляем префикс для base64 изображения
        photo_base64_with_prefix = f'data:image/jpeg;base64,{photo_base64}'
        
        # Получаем данные из состояния (уже проверили выше, но получаем еще раз для использования)
        data = await state.get_data()
        casino_id = data.get('casino_id')
        account_id = data.get('account_id')
        amount = data.get('amount')
        bank_id = data.get('bank_id', 'omoney')  # По умолчанию omoney
        
        # Дополнительная проверка (на случай если данные изменились)
        if not all([casino_id, account_id, amount]):
            await message.answer(get_text(lang, 'deposit', 'error'))
            await state.clear()
            from handlers.start import cmd_start
            await cmd_start(message, state, bot)
            return
        
        # КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Проверяем, есть ли уже pending заявка для этого пользователя
        # Если есть - ОБНОВЛЯЕМ её, а не создаем новую (защита от двойного зачисления)
        import logging
        logger = logging.getLogger(__name__)
        
        pending_request = None
        request_id = None
        
        try:
            pending_result = await APIClient.get_pending_request(
                telegram_user_id=str(message.from_user.id),
                request_type='deposit'
            )
            if pending_result.get('success') and pending_result.get('data'):
                pending_request = pending_result.get('data')
                logger.info(f"[Deposit] Found pending request {pending_request.get('id')} for user {message.from_user.id}")
        except Exception as e:
            logger.warning(f"[Deposit] Error checking pending request: {e}, will create new request")
        
        # Если есть pending заявка - ОБНОВЛЯЕМ её, иначе создаем новую
        if pending_request and pending_request.get('id'):
            pending_request_id = pending_request.get('id')
            logger.info(f"[Deposit] Updating existing request {pending_request_id} with receipt photo")
            
            result = await APIClient.update_request(
                request_id=str(pending_request_id),
                receipt_photo=photo_base64_with_prefix
            )
            request_id = pending_request_id
        else:
            # Создаем новую заявку только если нет pending заявки
            logger.info(f"[Deposit] Creating new request for user {message.from_user.id}")
            result = await APIClient.create_request(
                telegram_user_id=str(message.from_user.id),
                request_type='deposit',
                amount=amount,
                bookmaker=casino_id,
                bank=bank_id,
                account_id=account_id,
                telegram_username=message.from_user.username,
                telegram_first_name=message.from_user.first_name,
                telegram_last_name=message.from_user.last_name,
                receipt_photo=photo_base64_with_prefix,
                uncreated_request_id=data.get('uncreated_request_id'),
                bot_type=Config.BOT_TYPE
            )
            if result.get('success') and result.get('data'):
                request_id = result.get('data', {}).get('id')
        
        if result.get('success'):
            # Заявка создана или обновлена успешно
            # Сохраняем request_id в state для возможных уведомлений
            if request_id:
                await state.update_data(request_id=request_id, pending_request_id=request_id)
            
            # Отправляем сообщение о создании заявки и сохраняем его ID
            casino_name = data.get('casino_name', casino_id)  # Получаем название букмекера
            request_created_msg = await message.answer(
                get_text(lang, 'deposit', 'request_created',
                        amount=amount,
                        account_id=account_id,
                        casino=casino_name)
            )
            
            # Сохраняем ID сообщения в заявке через API (в фоне, не блокируя ответ пользователю)
            if request_id and request_created_msg.message_id:
                async def save_message_id_background():
                    try:
                        await APIClient.update_request_message_id(request_id, request_created_msg.message_id)
                    except Exception as e:
                        import logging
                        logger = logging.getLogger(__name__)
                        logger.warning(f"Failed to save request message ID: {e}")
                
                # Запускаем в фоне, не ждем завершения
                asyncio.create_task(save_message_id_background())
            # ВАЖНО: Очищаем state после успешной обработки фото чека
            # Это закрывает стейт и предотвращает прием новых сообщений
            await state.clear()
        else:
            error_msg = result.get('message', get_text(lang, 'deposit', 'error'))
            await message.answer(error_msg)
            
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error in deposit_receipt_received: {e}", exc_info=True)
        await message.answer(get_text(lang, 'deposit', 'error'))
        await state.clear()
        from handlers.start import cmd_start
        await cmd_start(message, state, bot)

@router.message(DepositStates.waiting_for_receipt)
async def deposit_invalid_receipt(message: Message, state: FSMContext, bot: Bot):
    """Некорректное сообщение вместо фото чека"""
    lang = await get_lang_from_state(state)
    
    # Игнорируем невидимые символы (например, неразрывный пробел)
    # Проверяем наличие текста перед использованием методов
    if not message.text:
        return
    if not message.text.strip() or message.text.strip() == '\u200B':
        return
    
    # Игнорируем кнопки меню - они обрабатываются другими обработчиками
    menu_buttons = [
        '💰 Пополнить', '💰 Толтуруу',
        '💸 Вывести', '💸 Чыгаруу', '💸 Chiqarish',
        '📖 Инструкция', '📖 Көрсөтмө', '📖 Ko\'rsatma',
        '🌐 Язык', '🌐 Тил', '🌐 Til',
        '❌ Операция отменена', '❌ Аракет жокко чыгарылды', '❌ Amal bekor qilindi'
    ]
    if message.text in menu_buttons:
        # Если это кнопка меню, очищаем состояние и позволяем другому обработчику обработать
        await state.clear()
        return
    
    # Проверяем отмену (только если текст сообщения точно совпадает с текстом кнопки отмены)
    cancel_text = get_text(lang, 'deposit', 'cancel')
    if message.text and message.text.strip() == cancel_text.strip():
        # Останавливаем таймер и удаляем сообщение с QR-кодом если есть
        data = await state.get_data()
        qr_message_id = data.get('qr_message_id')
        if qr_message_id:
            # Останавливаем таймер
            timer_key = f"{message.chat.id}_{qr_message_id}"
            active_timers.pop(timer_key, None)
            
            try:
                await bot.delete_message(chat_id=message.chat.id, message_id=qr_message_id)
            except Exception:
                pass
        await state.clear()
        from handlers.start import cmd_start
        await cmd_start(message, state, bot)
        return
    
    await message.answer(get_text(lang, 'deposit', 'invalid_receipt'))

@router.callback_query(F.data == 'deposit_cancel')
async def deposit_cancel_callback(callback: CallbackQuery, state: FSMContext, bot: Bot):
    """Обработка нажатия на кнопку "Отмена" в процессе депозита"""
    # ВАЖНО: Отвечаем на callback query СРАЗУ, до выполнения долгих операций
    # Иначе callback query может истечь (Telegram требует ответ в течение нескольких секунд)
    try:
        await callback.answer()
    except Exception as e:
        # Если callback уже истек, просто игнорируем ошибку
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"[Deposit Cancel] Callback query expired: {e}")
    
    lang = await get_lang_from_state(state)
    
    # Останавливаем таймер и удаляем сообщение с QR-кодом если есть
    data = await state.get_data()
    qr_message_id = data.get('qr_message_id')
    
    if qr_message_id:
        # Останавливаем таймер
        timer_key = f"{callback.message.chat.id}_{qr_message_id}"
        active_timers.pop(timer_key, None)
        
        try:
            await bot.delete_message(chat_id=callback.message.chat.id, message_id=qr_message_id)
        except Exception:
            pass
    
    await state.clear()
    
    # Показываем главное меню
    from handlers.start import cmd_start
    await cmd_start(callback.message, state, bot)

