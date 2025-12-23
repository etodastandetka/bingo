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
from pathlib import Path

router = Router()

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
    
    keyboard = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=get_text(lang, 'deposit', 'cancel'))]],
        resize_keyboard=True
    )
    
    # Отправляем фото казино с текстом
    # Фото находятся в корневой папке проекта
    photo_path = Path(__file__).parent.parent.parent / f"{casino_id}.jpg"
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

    # Проверяем игрока через API (кроме 1win/mostbet)
    data = await state.get_data()
    casino_id = data.get('casino_id')
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
    
    keyboard = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=get_text(lang, 'deposit', 'cancel'))]],
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
        # Удаляем сообщение с QR-кодом если есть
        data = await state.get_data()
        qr_message_id = data.get('qr_message_id')
        if qr_message_id:
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
            # Генерируем QR код и получаем изображение
            qr_result = await APIClient.generate_qr_image(amount_with_cents, 'omoney')
            
            if not qr_result.get('success'):
                await generating_msg.delete()
                await message.answer(get_text(lang, 'deposit', 'qr_error'))
                return
            
            qr_image_base64 = qr_result.get('qr_image', '')
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
            
            # Создаем кнопки банков
            from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
            
            # Получаем список банков из настроек или используем дефолтный
            settings = await APIClient.get_payment_settings()
            deposit_settings = settings.get('deposits', {})
            enabled_banks = deposit_settings.get('banks', ['mbank', 'omoney', 'bakai', 'megapay']) if isinstance(deposit_settings, dict) else ['mbank', 'omoney', 'bakai', 'megapay']
            
            # Фильтруем банки по включенным и создаем кнопки
            bank_buttons = []
            for bank in Config.DEPOSIT_BANKS:
                if bank['id'] in enabled_banks:
                    bank_buttons.append(InlineKeyboardButton(
                        text=bank['name'],
                        callback_data=f'deposit_bank_{bank["id"]}'
                    ))
            
            # Разбиваем кнопки по 2 в ряд
            keyboard_rows = []
            for i in range(0, len(bank_buttons), 2):
                row = bank_buttons[i:i+2]
                keyboard_rows.append(row)
            
            keyboard = InlineKeyboardMarkup(inline_keyboard=keyboard_rows)
            
            # Формируем текст с информацией
            payment_text = get_text(lang, 'deposit', 'qr_payment_info',
                                   amount=amount_with_cents,
                                   casino=data.get("casino_name"),
                                   account_id=account_id)
            
            # Отправляем фото QR кода с кнопками банков
            # Используем BufferedInputFile для работы с bytes напрямую
            photo = BufferedInputFile(qr_image_bytes, filename='qr_code.png')
            qr_message = await message.answer_photo(
                photo=photo,
                caption=payment_text,
                reply_markup=keyboard
            )
            
            # Сохраняем ID сообщения с QR-кодом для возможности удаления
            await state.update_data(qr_message_id=qr_message.message_id)
            
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
            
            # Переходим в состояние ожидания выбора банка
            await state.set_state(DepositStates.waiting_for_bank_selection)
            
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

@router.callback_query(F.data.startswith('deposit_bank_'), DepositStates.waiting_for_bank_selection)
async def deposit_bank_selected(callback: CallbackQuery, state: FSMContext):
    """Банк выбран, ожидаем фото чека"""
    lang = await get_lang_from_state(state)
    bank_id = callback.data.replace('deposit_bank_', '')
    
    # Находим название банка
    bank_name = next((b['name'] for b in Config.DEPOSIT_BANKS if b['id'] == bank_id), bank_id)
    
    # Сохраняем банк в состояние
    await state.update_data(bank_id=bank_id, bank_name=bank_name)
    
    # Удаляем сообщение с кнопками
    try:
        await callback.message.delete()
    except Exception:
        pass
    
    # Показываем сообщение о необходимости отправить чек
    keyboard = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=get_text(lang, 'deposit', 'cancel'))]],
        resize_keyboard=True
    )
    
    await callback.message.answer(
        get_text(lang, 'deposit', 'send_receipt', bank=bank_name),
        reply_markup=keyboard
    )
    
    # Переходим в состояние ожидания чека
    await state.set_state(DepositStates.waiting_for_receipt)
    await callback.answer()

@router.message(DepositStates.waiting_for_receipt, F.photo)
async def deposit_receipt_received(message: Message, state: FSMContext, bot: Bot):
    """Фото чека получено, создаем заявку"""
    lang = await get_lang_from_state(state)
    
    # Удаляем сообщение с QR-кодом если есть
    data = await state.get_data()
    qr_message_id = data.get('qr_message_id')
    if qr_message_id:
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
        bank_id = data.get('bank_id')
        
        if not all([casino_id, account_id, amount, bank_id]):
            await message.answer(get_text(lang, 'deposit', 'error'))
            await state.clear()
            from handlers.start import cmd_start
            await cmd_start(message, state, bot)
            return
        
        # Создаем заявку через API
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
            receipt_photo=photo_base64_with_prefix
        )
        
        if result.get('success') and result.get('data'):
            # Заявка создана успешно
            await message.answer(
                get_text(lang, 'deposit', 'request_created',
                        amount=amount,
                        casino=data.get('casino_name'),
                        account_id=account_id)
            )
            await state.clear()
            # Показываем главное меню
            from handlers.start import cmd_start
            await cmd_start(message, state, bot)
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
        # Удаляем сообщение с QR-кодом если есть
        data = await state.get_data()
        qr_message_id = data.get('qr_message_id')
        if qr_message_id:
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

