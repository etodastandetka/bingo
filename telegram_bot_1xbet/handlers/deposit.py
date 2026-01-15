from aiogram import Router, F, Bot
from aiogram.types import Message, CallbackQuery, FSInputFile, BufferedInputFile
from aiogram.fsm.context import FSMContext
from aiogram.types import ReplyKeyboardMarkup, KeyboardButton, ReplyKeyboardRemove
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

async def update_qr_timer(bot: Bot, chat_id: int, message_id: int, created_at: int, duration: int, lang: str, amount: float, casino: str, account_id: str, keyboard, state: FSMContext = None):
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
                if state:
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
    """Начало процесса пополнения - автоматически выбираем 1xbet"""
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
    
    # Автоматически устанавливаем 1xbet
    casino_id = '1xbet'
    casino_name = '1xBet'
    
    # Проверяем, включено ли казино
    enabled_casinos = settings.get('casinos', {})
    if enabled_casinos.get(casino_id, True) is False:
        await message.answer(get_text(lang, 'deposit', 'casino_disabled'))
        return
    
    await state.update_data(casino_id=casino_id, casino_name=casino_name)
    
    # Получаем сохраненный ID казино для этого пользователя
    saved_account_id = None
    try:
        saved_id_result = await APIClient.get_saved_casino_account_id(str(message.from_user.id), casino_id)
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
    photo_path = Path(__file__).parent.parent.parent / "telegram_bot" / "images" / f"{casino_id}.jpg"
    if photo_path.exists():
        photo = FSInputFile(str(photo_path))
        await message.answer_photo(
            photo=photo,
            caption=get_text(lang, 'deposit', 'enter_account_id', casino=casino_name),
            reply_markup=keyboard
        )
    else:
        # Если фото нет, отправляем только текст
        await message.answer(
            get_text(lang, 'deposit', 'enter_account_id', casino=casino_name),
            reply_markup=keyboard
        )
    
    await state.set_state(DepositStates.waiting_for_account_id)

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
    
    account_id = message.text.strip()
    
    if not account_id or not account_id.isdigit():
        await message.answer(get_text(lang, 'deposit', 'invalid_account_id'))
        return

    # ВАЖНО: Проверяем блокировку accountId ПЕРЕД сохранением
    import logging
    logger = logging.getLogger(__name__)
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

    # Проверяем игрока через API (1xbet проверяется)
    player_info = None

    if casino_id:
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
    if not message.text or not message.text.strip() or message.text.strip() == '\u200B':
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
            if unique_result.get('success') and unique_result.get('data', {}).get('amount'):
                amount_with_cents = float(unique_result.get('data', {}).get('amount'))
                reservation_id = unique_result.get('data', {}).get('reservationId')
                if reservation_id:
                    await state.update_data(uncreated_request_id=str(reservation_id))
        except Exception as e:
            logger.warning(f"[Deposit] Failed to get unique amount, fallback to random: {e}")
        
        # Fallback: случайные копейки
        if amount_with_cents is None:
            import random
            amount_with_cents = amount + (random.randint(1, 99) / 100)
        
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
                'omoney': 'O!Money',
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
                await generating_msg.delete()
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
            qr_message = await message.answer_photo(
                photo=photo,
                caption=payment_text,
                reply_markup=keyboard if keyboard else None  # Inline клавиатура с банками и отменой
            )
            
            # Сохраняем ID сообщения с QR-кодом для возможности удаления и обновления
            await state.update_data(qr_message_id=qr_message.message_id)
            
            # Запускаем фоновую задачу для обновления таймера
            import logging
            logger = logging.getLogger(__name__)
            # Таймер обновляет только текст, без клавиатуры
            timer_task = asyncio.create_task(update_qr_timer(bot, message.chat.id, qr_message.message_id, qr_created_at, timer_duration, lang, amount_with_cents, data.get("casino_name"), account_id, keyboard, state))
            logger.info(f"[Timer] Created timer task for message {qr_message.message_id}, chat {message.chat.id}")
            
            # Добавляем обработку ошибок для задачи
            def timer_task_done(task):
                try:
                    task.result()
                except Exception as e:
                    logger.error(f"[Timer] Timer task failed for message {qr_message.message_id}: {e}")
            
            timer_task.add_done_callback(timer_task_done)
            
            # НЕ создаем заявку без фото - заявка будет создана только при получении фото чека
            # Это соответствует логике основного бота
                # Продолжаем работу даже если не удалось создать заявку
            
            # Сразу переходим в состояние ожидания чека (без выбора банка)
            # Текст про отправку чека уже есть в caption сообщения с QR
            await state.set_state(DepositStates.waiting_for_receipt)
            
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
    await callback.answer()

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
        pending_request_id = data.get('pending_request_id')
        
        # Дополнительная проверка (на случай если данные изменились)
        if not all([casino_id, account_id, amount]):
            await message.answer(get_text(lang, 'deposit', 'error'))
            await state.clear()
            from handlers.start import cmd_start
            await cmd_start(message, state, bot)
            return
        
        # КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Проверяем через API, есть ли уже pending заявка
        # Это защищает от потери pending_request_id из state (перезапуск бота, очистка state)
        import logging
        logger = logging.getLogger(__name__)
        
        if not pending_request_id:
            # Если нет pending_request_id в state, проверяем через API
            try:
                import aiohttp
                import ssl
                ssl_context = ssl.create_default_context()
                ssl_context.check_hostname = False
                
                connector = aiohttp.TCPConnector(ssl=ssl_context)
                async with aiohttp.ClientSession(connector=connector) as session:
                    api_url = Config.API_BASE_URL
                    if api_url.startswith('http://localhost'):
                        try:
                            async with session.get(
                                f'{api_url}/public/pending-request',
                                params={'telegram_user_id': str(message.from_user.id), 'type': 'deposit'},
                                timeout=aiohttp.ClientTimeout(total=3)
                            ) as response:
                                pending_result = await response.json()
                                if pending_result.get('success') and pending_result.get('data'):
                                    pending_request_id = pending_result.get('data', {}).get('id')
                                    logger.info(f"[Deposit] Found pending request {pending_request_id} via API for user {message.from_user.id}")
                        except:
                            api_url = Config.API_FALLBACK_URL
                            async with session.get(
                                f'{api_url}/public/pending-request',
                                params={'telegram_user_id': str(message.from_user.id), 'type': 'deposit'},
                                timeout=aiohttp.ClientTimeout(total=3)
                            ) as response:
                                pending_result = await response.json()
                                if pending_result.get('success') and pending_result.get('data'):
                                    pending_request_id = pending_result.get('data', {}).get('id')
                                    logger.info(f"[Deposit] Found pending request {pending_request_id} via API for user {message.from_user.id}")
                    else:
                        async with session.get(
                            f'{api_url}/public/pending-request',
                            params={'telegram_user_id': str(message.from_user.id), 'type': 'deposit'},
                            timeout=aiohttp.ClientTimeout(total=3)
                        ) as response:
                            pending_result = await response.json()
                            if pending_result.get('success') and pending_result.get('data'):
                                pending_request_id = pending_result.get('data', {}).get('id')
                                logger.info(f"[Deposit] Found pending request {pending_request_id} via API for user {message.from_user.id}")
            except Exception as e:
                logger.warning(f"[Deposit] Error checking pending request via API: {e}, will use state value or create new")
        
        # Если есть pending заявка - обновляем её, добавляя фото чека
        # Если нет - создаем новую заявку с фото чека
        if pending_request_id:
            # Обновляем существующую pending заявку, добавляя фото чека
            import aiohttp
            import ssl
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            
            connector = aiohttp.TCPConnector(ssl=ssl_context)
            async with aiohttp.ClientSession(connector=connector) as session:
                api_url = Config.API_BASE_URL
                if api_url.startswith('http://localhost'):
                    try:
                        async with session.put(
                            f'{api_url}/payment',
                            json={
                                'id': pending_request_id,
                                'receipt_photo': photo_base64_with_prefix,
                            },
                            timeout=aiohttp.ClientTimeout(total=5)
                        ) as response:
                            result = await response.json()
                    except:
                        api_url = Config.API_FALLBACK_URL
                        async with session.put(
                            f'{api_url}/payment',
                            json={
                                'id': pending_request_id,
                                'receipt_photo': photo_base64_with_prefix,
                            },
                            timeout=aiohttp.ClientTimeout(total=5)
                        ) as response:
                            result = await response.json()
                else:
                    async with session.put(
                        f'{api_url}/payment',
                        json={
                            'id': pending_request_id,
                            'receipt_photo': photo_base64_with_prefix,
                        },
                        timeout=aiohttp.ClientTimeout(total=5)
                    ) as response:
                        result = await response.json()
        else:
            # Создаем новую заявку с фото чека
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
            # Заявка создана успешно
            request_id = result.get('data', {}).get('id')
            # Сохраняем request_id в state для возможных уведомлений
            await state.update_data(request_id=request_id)
            
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
    if not message.text or not message.text.strip() or message.text.strip() == '\u200B':
        return
    
    # Игнорируем кнопки меню - они обрабатываются другими обработчиками
    menu_buttons = [
        '💰 Пополнить', '💰 Толтуруу',
        '💸 Вывести', '💸 Чыгаруу',
        '📖 Инструкция', '📖 Көрсөтмө',
        '🌐 Язык', '🌐 Тил',
        '❌ Операция отменена', '❌ Аракет жокко чыгарылды'
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
