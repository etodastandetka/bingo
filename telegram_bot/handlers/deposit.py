from aiogram import Router, F, Bot
from aiogram.types import Message, CallbackQuery, FSInputFile, BufferedInputFile
from aiogram.fsm.context import FSMContext
from aiogram.types import ReplyKeyboardMarkup, KeyboardButton
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

async def update_qr_timer(bot: Bot, chat_id: int, message_id: int, created_at: int, duration: int, lang: str, amount: float, casino: str, account_id: str, keyboard):
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
                logger.info(f"[Timer] Expired for message {message_id}")
                # Обновляем последний раз с 00:00
                payment_text = get_text(lang, 'deposit', 'qr_payment_info',
                                       amount=amount,
                                       casino=casino,
                                       account_id=account_id,
                                       timer="0:00")
                try:
                    await bot.edit_message_caption(
                        chat_id=chat_id,
                        message_id=message_id,
                        caption=payment_text,
                        reply_markup=keyboard
                    )
                except:
                    pass
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
                await bot.edit_message_caption(
                    chat_id=chat_id,
                    message_id=message_id,
                    caption=payment_text,
                    reply_markup=keyboard
                )
                logger.debug(f"[Timer] Updated message {message_id} to {timer_text}")
            except Exception as e:
                # Если сообщение было удалено или не может быть отредактировано, останавливаем таймер
                logger.warning(f"[Timer] Could not update message {message_id}: {e}")
                # Не останавливаем таймер сразу, продолжаем попытки
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
    lang = await get_lang_from_state(state)
    
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
async def deposit_casino_selected(callback: CallbackQuery, state: FSMContext):
    """Казино выбрано, запрашиваем ID счета"""
    lang = await get_lang_from_state(state)
    casino_id = callback.data.replace('casino_', '')
    casino_name = next((c['name'] for c in Config.CASINOS if c['id'] == casino_id), casino_id)
    
    await state.update_data(casino_id=casino_id, casino_name=casino_name)
    
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
    photo_path = Path(__file__).parent.parent / "images" / f"{casino_id}.jpg"
    if photo_path.exists():
        photo = FSInputFile(str(photo_path))
        await callback.message.answer_photo(
            photo=photo,
            caption=get_text(lang, 'deposit', 'enter_account_id', casino=casino_name),
            reply_markup=keyboard
        )
    else:
        # Если фото нет, отправляем только текст
        await callback.message.answer(
            get_text(lang, 'deposit', 'enter_account_id', casino=casino_name),
            reply_markup=keyboard
        )
    
    await state.set_state(DepositStates.waiting_for_account_id)
    await callback.answer()

@router.message(DepositStates.waiting_for_account_id)
async def deposit_account_id_received(message: Message, state: FSMContext, bot: Bot):
    """ID счета получен, запрашиваем сумму"""
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
    
    amount_prompt = get_text(lang, 'deposit', 'enter_amount', min=str(Config.DEPOSIT_MIN), max=str(Config.DEPOSIT_MAX))

    await message.answer(
        amount_prompt,
        reply_markup=keyboard
    )
    await state.set_state(DepositStates.waiting_for_amount)

@router.message(DepositStates.waiting_for_amount)
async def deposit_amount_received(message: Message, state: FSMContext, bot: Bot):
    """Сумма получена, генерируем QR код и показываем кнопки банков"""
    lang = await get_lang_from_state(state)
    
    # Проверяем отмену
    if message.text == get_text(lang, 'deposit', 'cancel'):
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
            await message.answer(
                get_text(lang, 'deposit', 'invalid_amount', min=Config.DEPOSIT_MIN, max=Config.DEPOSIT_MAX)
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
        
        # Добавляем копейки к сумме (случайное число от 1 до 99)
        import random
        amount_with_cents = amount + (random.randint(1, 99) / 100)
        
        # Сохраняем сумму в состояние
        await state.update_data(amount=amount_with_cents)
        
        # Показываем сообщение о генерации QR
        generating_msg = await message.answer(get_text(lang, 'deposit', 'generating_qr'))
        
        try:
            # Генерируем QR hash и получаем ссылки банков
            qr_result = await APIClient.generate_qr(amount_with_cents, 'omoney')
            
            if not qr_result.get('success'):
                await generating_msg.delete()
                await message.answer(get_text(lang, 'deposit', 'qr_error'))
                return
            
            qr_hash = qr_result.get('qr_hash')
            all_bank_urls = qr_result.get('all_bank_urls', {})
            
            if not qr_hash:
                await generating_msg.delete()
                await message.answer(get_text(lang, 'deposit', 'qr_error'))
                return
            
            # Генерируем QR изображение через payment_site API
            qr_image_result = await APIClient.generate_qr_image(amount_with_cents, 'omoney')
            qr_image_base64 = qr_image_result.get('qr_image', '')
            
            if not qr_image_base64:
                await generating_msg.delete()
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
            
            # Создаем кнопки банков со ссылками (URL кнопки)
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
            
            # Разбиваем кнопки по 2 в ряд
            keyboard_rows = []
            for i in range(0, len(bank_buttons), 2):
                row = bank_buttons[i:i+2]
                keyboard_rows.append(row)
            
            keyboard = InlineKeyboardMarkup(inline_keyboard=keyboard_rows)
            
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
            
            # Отправляем фото QR кода с кнопками банков
            # Используем BufferedInputFile для работы с bytes напрямую
            photo = BufferedInputFile(qr_image_bytes, filename='qr_code.png')
            qr_message = await message.answer_photo(
                photo=photo,
                caption=payment_text,
                reply_markup=keyboard
            )
            
            # Сохраняем ID сообщения с QR-кодом для возможности удаления и обновления
            await state.update_data(qr_message_id=qr_message.message_id)
            
            # Запускаем фоновую задачу для обновления таймера
            import logging
            logger = logging.getLogger(__name__)
            timer_task = asyncio.create_task(update_qr_timer(bot, message.chat.id, qr_message.message_id, qr_created_at, timer_duration, lang, amount_with_cents, data.get("casino_name"), account_id, keyboard))
            logger.info(f"[Timer] Created timer task for message {qr_message.message_id}, chat {message.chat.id}")
            
            # Добавляем обработку ошибок для задачи
            def timer_task_done(task):
                try:
                    task.result()
                except Exception as e:
                    logger.error(f"[Timer] Timer task failed for message {qr_message.message_id}: {e}")
            
            timer_task.add_done_callback(timer_task_done)
            
            # Создаем несозданную заявку при показе QR-кода
            try:
                uncreated_result = await APIClient.create_uncreated_request(
                    telegram_user_id=str(message.from_user.id),
                    bookmaker=casino_id,
                    account_id=account_id,
                    amount=amount_with_cents,
                    telegram_username=message.from_user.username,
                    telegram_first_name=message.from_user.first_name,
                    telegram_last_name=message.from_user.last_name,
                )
                if uncreated_result.get('success') and uncreated_result.get('data', {}).get('id'):
                    uncreated_id = uncreated_result.get('data', {}).get('id')
                    await state.update_data(uncreated_request_id=str(uncreated_id))
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Failed to create uncreated request: {e}")
                # Продолжаем работу даже если не удалось создать несозданную заявку
            
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
        await message.answer(get_text(lang, 'deposit', 'invalid_amount', min=Config.DEPOSIT_MIN, max=Config.DEPOSIT_MAX))
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


@router.message(DepositStates.waiting_for_receipt, F.photo)
async def deposit_receipt_received(message: Message, state: FSMContext, bot: Bot):
    """Фото чека получено, создаем заявку"""
    lang = await get_lang_from_state(state)
    
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
        
        # Получаем данные из состояния
        data = await state.get_data()
        casino_id = data.get('casino_id')
        account_id = data.get('account_id')
        amount = data.get('amount')
        bank_id = data.get('bank_id', 'omoney')  # По умолчанию omoney
        uncreated_request_id = data.get('uncreated_request_id')
        
        if not all([casino_id, account_id, amount]):
            await message.answer(get_text(lang, 'deposit', 'error'))
            await state.clear()
            from handlers.start import cmd_start
            await cmd_start(message, state, bot)
            return
        
        # Создаем заявку через API (конвертирует несозданную заявку если есть uncreated_request_id)
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
            uncreated_request_id=uncreated_request_id
        )
        
        if result.get('success') and result.get('data'):
            # Заявка создана успешно
            request_id = result.get('data', {}).get('id')
            # Сохраняем request_id в state для возможных уведомлений
            await state.update_data(request_id=request_id)
            
            await message.answer(
                get_text(lang, 'deposit', 'request_created',
                        amount=amount,
                        account_id=account_id)
            )
            # НЕ возвращаем главное меню и НЕ очищаем state
            # Главное меню вернется только когда деньги зачислятся или заявка отменится
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
    
    # Проверяем отмену
    if message.text == get_text(lang, 'deposit', 'cancel'):
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

@router.message(F.text.in_(['❌ Операция отменена', '❌ Аракет жокко чыгарылды']))
async def cancel_deposit(message: Message, state: FSMContext, bot: Bot):
    """Отмена операции пополнения"""
    await state.clear()
    # Показываем главное меню
    from handlers.start import cmd_start
    await cmd_start(message, state, bot)

