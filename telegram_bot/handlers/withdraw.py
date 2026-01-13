from aiogram import Router, F, Bot
from aiogram.types import CallbackQuery, Message, FSInputFile
from aiogram.fsm.context import FSMContext
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, ReplyKeyboardMarkup, KeyboardButton
from states import WithdrawStates
from config import Config
from api_client import APIClient
from translations import get_text
import base64
import io
from pathlib import Path

router = Router()

async def get_lang_from_state(state: FSMContext) -> str:
    """Получить язык из состояния"""
    data = await state.get_data()
    return data.get('language', 'ru')

def get_withdrawal_instructions(casino_id: str, lang: str = 'ru') -> str:
    """Получить инструкции по выводу средств с учетом казино"""
    # Для 888starz используем другой адрес
    if casino_id and casino_id.lower() in ['888starz', '888', 'starz']:
        address = '📍(Город Бишкек, улица Киевская)'
    else:
        address = '📍(Город Бишкек, улица Bingo kg)'
    
    if lang == 'ky':
        return f'''📍 Кайрылыңыз👇🏻
📍1. Жөндөөлөр!
📍2. Эсептен чыгаруу!
📍3. Касса
📍4. Чыгаруу суммасы!
{address}
📍5. Тастыктоо
📍6. Кодду алуу!
📍7. Бизге жөнөтүңүз'''
    else:
        return f'''📍 Заходим👇🏻
📍1. Настройки!
📍2. Вывести со счета!
📍3. Касса
📍4. Сумму для Вывода!
{address}
📍5. Подтвердить
📍6. Получить Код!
📍7. Отправить его нам'''

@router.message(F.text.in_(['💸 Вывести', '💸 Чыгаруу']))
async def withdraw_start(message: Message, state: FSMContext):
    """Начало процесса вывода - выбор казино"""
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
        logger.warning(f"[Withdraw] Timeout checking blocked status for user {message.from_user.id}, continuing...")
        # Продолжаем работу при таймауте
    except Exception as e:
        logger.error(f"[Withdraw] Error checking blocked status: {e}")
        # Продолжаем работу, если проверка не удалась
    
    # Очищаем предыдущее состояние (если была незавершенная операция)
    await state.clear()
    
    # Восстанавливаем язык
    await state.update_data(language=lang)
    
    # Получаем настройки из админки
    settings = await APIClient.get_payment_settings()
    
    # Проверяем pause режим
    if settings.get('pause', False):
        maintenance_message = settings.get('maintenance_message', get_text(lang, 'start', 'bot_paused'))
        await message.answer(maintenance_message)
        return
    
    # Проверяем, включены ли выводы
    withdrawals = settings.get('withdrawals', {})
    if isinstance(withdrawals, dict):
        withdrawals_enabled = withdrawals.get('enabled', True)
    else:
        withdrawals_enabled = withdrawals if withdrawals is not False else True
    
    if not withdrawals_enabled:
        await message.answer(get_text(lang, 'withdraw', 'withdrawals_disabled'))
        return
    
    # Показываем все казино (не фильтруем)
    # 1xbet - одна кнопка в строке, остальные - по 2 в строке
    keyboard = InlineKeyboardMarkup(inline_keyboard=[])
    row = []
    for casino in Config.CASINOS:
        casino_id = casino['id']
        # 1xbet - отдельная строка (одна кнопка)
        if casino_id == '1xbet':
            keyboard.inline_keyboard.append([InlineKeyboardButton(
                text=casino['name'],
                callback_data=f'withdraw_casino_{casino_id}'
            )])
        else:
            # Остальные казино - по 2 в строке
            row.append(InlineKeyboardButton(
                text=casino['name'],
                callback_data=f'withdraw_casino_{casino_id}'
            ))
            # Когда в ряду 2 кнопки, добавляем ряд в клавиатуру
            if len(row) == 2:
                keyboard.inline_keyboard.append(row)
                row = []  # Создаем новый ряд
    # Добавляем оставшиеся кнопки (если их меньше 2)
    if row:
        keyboard.inline_keyboard.append(row)
    
    await message.answer(
        get_text(lang, 'withdraw', 'select_casino'),
        reply_markup=keyboard,
    )
    await state.set_state(WithdrawStates.waiting_for_casino)

@router.callback_query(F.data.startswith('withdraw_casino_'), WithdrawStates.waiting_for_casino)
async def withdraw_casino_selected(callback: CallbackQuery, state: FSMContext):
    """Казино выбрано, запрашиваем выбор банка"""
    lang = await get_lang_from_state(state)
    casino_id = callback.data.replace('withdraw_casino_', '')
    
    # Проверяем, включено ли казино
    settings = await APIClient.get_payment_settings()
    enabled_casinos = settings.get('casinos', {})
    if enabled_casinos.get(casino_id, True) is False:
        await callback.answer(get_text(lang, 'withdraw', 'casino_disabled', default='❌ Это казино временно отключено'), show_alert=True)
        return
    
    casino_name = next((c['name'] for c in Config.CASINOS if c['id'] == casino_id), casino_id)
    
    await state.update_data(casino_id=casino_id, casino_name=casino_name)
    
    # Удаляем сообщение с кнопками выбора букмекера
    try:
        await callback.message.delete()
    except Exception:
        pass  # Игнорируем ошибки удаления (если сообщение уже удалено или нет прав)
    
    # Получаем настройки из админки для фильтрации банков
    settings = await APIClient.get_payment_settings()
    withdrawals_settings = settings.get('withdrawals', {})
    # Используем дефолтный список всех банков из конфига, если настройки не получены
    default_banks = [bank['id'] for bank in Config.WITHDRAW_BANKS]
    enabled_banks = withdrawals_settings.get('banks', default_banks) if isinstance(withdrawals_settings, dict) else default_banks
    
    # Создаем инлайн клавиатуру для банков
    keyboard = InlineKeyboardMarkup(inline_keyboard=[])
    
    # Создаем инлайн кнопки банков по 2 в ряд (только включенные)
    row = []
    for bank in Config.WITHDRAW_BANKS:
        if bank['id'] in enabled_banks:
            row.append(InlineKeyboardButton(
                text=bank['name'],
                callback_data=f'withdraw_bank_{bank["id"]}'
            ))
            if len(row) == 2:
                keyboard.inline_keyboard.append(row)
                row = []
    if row:
        keyboard.inline_keyboard.append(row)
    
    # Проверяем, что есть хотя бы одна кнопка
    if not keyboard.inline_keyboard:
        # Все банки отключены - показываем сообщение
        await callback.message.answer(get_text(lang, 'withdraw', 'banks_disabled'))
        return
    
    await callback.message.answer(
        get_text(lang, 'withdraw', 'select_bank', casino=casino_name),
        reply_markup=keyboard,
    )
    await state.set_state(WithdrawStates.waiting_for_bank)
    await callback.answer()

@router.callback_query(F.data.startswith('withdraw_bank_'), WithdrawStates.waiting_for_bank)
async def withdraw_bank_selected(callback: CallbackQuery, state: FSMContext, bot: Bot):
    """Банк выбран, запрашиваем номер телефона"""
    lang = await get_lang_from_state(state)
    bank_id = callback.data.replace('withdraw_bank_', '')
    
    # Ищем банк по ID
    bank = next((b for b in Config.WITHDRAW_BANKS if b['id'] == bank_id), None)
    if not bank:
        await callback.answer('❌ Банк не найден', show_alert=True)
        return
    
    bank_name = bank['name']
    
    await state.update_data(bank_id=bank_id, bank_name=bank_name)
    
    data = await state.get_data()
    casino_name = data.get('casino_name', '')
    
    # Удаляем сообщение с кнопками выбора банка
    try:
        await callback.message.delete()
    except Exception:
        pass  # Игнорируем ошибки удаления
    
    # Получаем последний номер телефона из последней заявки на вывод
    saved_phone = None
    try:
        saved_phone = await APIClient.get_last_withdraw_phone(str(callback.from_user.id))
    except Exception:
        pass  # Игнорируем ошибки получения номера
    
    # Формируем клавиатуру: если есть сохраненный номер, добавляем его как кнопку
    keyboard_buttons = []
    if saved_phone:
        keyboard_buttons.append([KeyboardButton(text=saved_phone)])
    keyboard_buttons.append([KeyboardButton(text=get_text(lang, 'withdraw', 'cancel'))])
    
    keyboard = ReplyKeyboardMarkup(
        keyboard=keyboard_buttons,
        resize_keyboard=True
    )
    
    await callback.message.answer(
        get_text(lang, 'withdraw', 'enter_phone', casino=casino_name, bank=bank_name),
        reply_markup=keyboard,
    )
    await state.set_state(WithdrawStates.waiting_for_phone)
    await callback.answer()

@router.message(WithdrawStates.waiting_for_phone)
async def withdraw_phone_received(message: Message, state: FSMContext, bot: Bot):
    """Номер телефона получен, запрашиваем фото QR кода"""
    lang = await get_lang_from_state(state)
    
    if message.text == get_text(lang, 'withdraw', 'cancel'):
        await state.clear()
        # Показываем главное меню
        from handlers.start import cmd_start
        await cmd_start(message, state, bot)
        return
    
    phone = message.text.strip()
    
    # Проверка формата телефона
    if not phone.startswith('+996'):
        await message.answer(get_text(lang, 'withdraw', 'invalid_phone'))
        return
    
    if len(phone) < 13 or len(phone) > 16:
        await message.answer(get_text(lang, 'withdraw', 'invalid_phone_format'))
        return
    
    await state.update_data(phone=phone)
    
    keyboard = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=get_text(lang, 'withdraw', 'cancel'))]],
        resize_keyboard=True
    )
    
    await message.answer(
        get_text(lang, 'withdraw', 'send_qr_photo'),
        reply_markup=keyboard,
    )
    await state.set_state(WithdrawStates.waiting_for_qr_photo)

@router.message(WithdrawStates.waiting_for_qr_photo, F.photo)
async def withdraw_qr_photo_received(message: Message, state: FSMContext):
    """Фото QR кода получено, запрашиваем ID казино"""
    # Получаем фото
    photo = message.photo[-1]  # Берем фото наибольшего размера
    
    # Скачиваем фото и конвертируем в base64
    file = await message.bot.get_file(photo.file_id)
    
    # Получаем байты фото
    photo_bytes = await message.bot.download_file(file.file_path)
    # В aiogram 3 download_file возвращает BytesIO
    if hasattr(photo_bytes, 'getvalue'):
        photo_data = photo_bytes.getvalue()
    elif hasattr(photo_bytes, 'read'):
        photo_data = photo_bytes.read()
    else:
        photo_data = bytes(photo_bytes)
    
    photo_base64 = base64.b64encode(photo_data).decode('utf-8')
    
    await state.update_data(qr_photo=photo_base64)
    
    lang = await get_lang_from_state(state)
    
    # Получаем сохраненный ID казино для этого пользователя
    data = await state.get_data()
    casino_id = data.get('casino_id', '')
    casino_name = data.get('casino_name', '')
    
    saved_account_id = None
    if casino_id:
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
    keyboard_buttons.append([KeyboardButton(text=get_text(lang, 'withdraw', 'cancel'))])
    
    keyboard = ReplyKeyboardMarkup(
        keyboard=keyboard_buttons,
        resize_keyboard=True
    )
    
    # Отправляем фото казино с текстом
    # Фото находятся в папке telegram_bot/images
    photo_path = Path(__file__).parent.parent / "images" / f"{casino_id}.jpg"
    if photo_path.exists():
        photo = FSInputFile(str(photo_path))
        await message.answer_photo(
            photo=photo,
            caption=get_text(lang, 'withdraw', 'enter_account_id', casino=casino_name),
            reply_markup=keyboard,
        )
    else:
        # Если фото нет, отправляем только текст
        await message.answer(
            get_text(lang, 'withdraw', 'enter_account_id', casino=casino_name),
            reply_markup=keyboard,
        )
    
    await state.set_state(WithdrawStates.waiting_for_account_id)

@router.message(WithdrawStates.waiting_for_qr_photo)
async def withdraw_qr_photo_invalid(message: Message, state: FSMContext):
    """Если отправлено не фото"""
    lang = await get_lang_from_state(state)
    await message.answer(get_text(lang, 'withdraw', 'invalid_photo'))

@router.message(WithdrawStates.waiting_for_account_id)
async def withdraw_account_id_received(message: Message, state: FSMContext, bot: Bot):
    """ID казино получен, запрашиваем код с сайта казино"""
    lang = await get_lang_from_state(state)
    
    if message.text == get_text(lang, 'withdraw', 'cancel'):
        await state.clear()
        # Показываем главное меню
        from handlers.start import cmd_start
        await cmd_start(message, state, bot)
        return
    
    account_id = message.text.strip()
    
    if not account_id or not account_id.isdigit():
        await message.answer('❌ Пожалуйста, отправьте корректный ID счета (только цифры)')
        return
    
    # Сохраняем ID казино для этого пользователя
    data = await state.get_data()
    casino_id = data.get('casino_id')
    if casino_id:
        try:
            await APIClient.save_casino_account_id(str(message.from_user.id), casino_id, account_id)
        except Exception:
            pass  # Игнорируем ошибки сохранения
    
    # ВАЖНО: Проверяем блокировку accountId с таймаутом для быстрой проверки
    try:
        import asyncio
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
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"[Withdraw] Timeout checking blocked accountId for user {message.from_user.id}")
        # Продолжаем работу при таймауте
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"[Withdraw] Error checking blocked accountId: {e}")
        # Продолжаем работу, если проверка не удалась
    
    await state.update_data(account_id=account_id)
    
    # Получаем casino_id для определения адреса
    casino_id = data.get('casino_id', '')
    
    keyboard = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=get_text(lang, 'withdraw', 'cancel'))]],
        resize_keyboard=True
    )
    
    # Используем новую функцию для формирования инструкций
    instructions = get_withdrawal_instructions(casino_id, lang)
    
    await message.answer(
        instructions,
        reply_markup=keyboard,
    )
    await state.set_state(WithdrawStates.waiting_for_withdrawal_code)

@router.message(WithdrawStates.waiting_for_withdrawal_code)
async def withdraw_code_received(message: Message, state: FSMContext, bot: Bot):
    """Код получен, проверяем сумму и создаем заявку"""
    lang = await get_lang_from_state(state)
    
    if message.text == get_text(lang, 'withdraw', 'cancel'):
        await state.clear()
        # Показываем главное меню
        from handlers.start import cmd_start
        await cmd_start(message, state, bot)
        return
    
    withdrawal_code = message.text.strip()
    
    if not withdrawal_code:
        await message.answer('❌ Пожалуйста, введите код')
        return
    
    data = await state.get_data()
    casino_id = data.get('casino_id')
    account_id = data.get('account_id')
    
    # Получаем сумму вывода перед созданием заявки
    withdraw_amount = 0
    amount_check_ok = True
    try:
        checking_msg = await message.answer("🔍 Проверяю код вывода...")
        
        amount_result = await APIClient.check_withdraw_amount(casino_id, account_id, withdrawal_code)
        
        # Удаляем сообщение о проверке
        try:
            await checking_msg.delete()
        except:
            pass
        
        # Логируем ответ для отладки
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"[Withdraw] Amount check result (full): {amount_result}")
        logger.info(f"[Withdraw] Amount check result type: {type(amount_result)}")
        logger.info(f"[Withdraw] Amount check result keys: {amount_result.keys() if isinstance(amount_result, dict) else 'Not a dict'}")
        
        # Проверяем структуру ответа: может быть data.amount или просто amount
        amount_value = None
        success = amount_result.get('success', False)
        logger.info(f"[Withdraw] Success flag: {success}")
        
        if success:
            # Проверяем разные варианты структуры ответа
            if 'data' in amount_result and amount_result['data']:
                logger.info(f"[Withdraw] Found 'data' key: {amount_result['data']}")
                amount_value = amount_result['data'].get('amount')
                logger.info(f"[Withdraw] Amount from data: {amount_value}")
            # Если нет в data, проверяем напрямую
            if amount_value is None:
                amount_value = amount_result.get('amount')
                logger.info(f"[Withdraw] Amount from root: {amount_value}")
        
        logger.info(f"[Withdraw] Final extracted amount value: {amount_value}, type: {type(amount_value)}")
        
        if amount_value is not None:
            try:
                withdraw_amount = float(amount_value)
                logger.info(f"[Withdraw] Parsed withdraw amount: {withdraw_amount}")
                if withdraw_amount <= 0:
                    amount_check_ok = False
                    logger.warning(f"[Withdraw] Amount is <= 0: {withdraw_amount}")
                    await message.answer("⚠️ Сумма вывода не найдена. Проверьте код и попробуйте ещё раз.")
                else:
                    logger.info(f"[Withdraw] Amount is valid: {withdraw_amount}")
            except (ValueError, TypeError) as e:
                logger.error(f"[Withdraw] Error parsing amount: {e}, value: {amount_value}")
                amount_check_ok = False
                await message.answer("⚠️ Ошибка при обработке суммы вывода. Попробуйте ещё раз.")
        else:
            amount_check_ok = False
            error_message = amount_result.get('error') or amount_result.get('message') or 'Не удалось получить сумму вывода'
            logger.error(f"[Withdraw] Amount not found in response. Success: {success}, Error: {error_message}, Full response: {amount_result}")
            await message.answer(f"⚠️ {error_message}")
    except Exception as e:
        print(f"Error checking withdraw amount: {e}")
        amount_check_ok = False
        await message.answer("⚠️ Не удалось проверить сумму вывода. Попробуйте еще раз.")
    
    if not amount_check_ok:
        await message.answer("Заявка не создана. Проверьте код вывода и попробуйте ещё раз.")
        await state.clear()
        # Показываем главное меню и выходим без создания заявки
        from handlers.start import cmd_start
        await cmd_start(message, state, bot)
        return
    
    try:
        # ВАЖНО: Используем ТОЛЬКО BOT_TYPE из конфига, НЕ определяем по букмекеру
        # Если заявка создана в основном боте, botType должен быть 'main', даже если букмекер = '1xbet'
        # Если заявка создана в 1xbet боте, botType будет '1xbet' (из Config.BOT_TYPE)
        # Если заявка создана в mostbet боте, botType будет 'mostbet' (из Config.BOT_TYPE)
        bot_type = Config.BOT_TYPE
        
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"[Withdraw] Using botType from Config: {bot_type} (casino: {casino_id})")
        
        # Создаем заявку на вывод
        request_data = await APIClient.create_request(
            telegram_user_id=str(message.from_user.id),
            request_type='withdraw',
            amount=withdraw_amount,  # Используем полученную сумму или 0
            bookmaker=casino_id,
            bank=data.get('bank_id'),
            phone=data.get('phone'),
            account_id=account_id,
            telegram_username=message.from_user.username,
            telegram_first_name=message.from_user.first_name,
            telegram_last_name=message.from_user.last_name,
            receipt_photo=data.get('qr_photo'),
            withdrawal_code=withdrawal_code,
            bot_type=bot_type,  # Передаем botType из конфига (main/1xbet/mostbet)
        )
        
        # Проверяем, не вернулась ли существующая заявка (дубликат)
        if request_data.get('message') == 'Request already exists':
            request_id = request_data.get('data', {}).get('id')
            if request_id:
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"[Withdraw] Duplicate request detected, using existing ID: {request_id}")
        else:
            request_id = request_data.get('data', {}).get('id')
        
        if request_id:
            # Формируем сообщение с суммой для всех казино
            if withdraw_amount > 0:
                # Форматируем сумму без лишних нулей
                amount_str = f"{withdraw_amount:.2f}".rstrip('0').rstrip('.')
                casino_name = data.get('casino_name', 'Казино')
                
                if lang == 'ky':
                    success_message = f"🎰 {casino_name}\n"
                    success_message += f"✅ Чыгаруу {amount_str} сом\n"
                    success_message += f"🆔 {account_id}\n"
                    success_message += f"⏳ Акчаңыз 5 мүнөттүн ичинде капчыңызга келет.\n\n"
                    success_message += f"👨‍💻 Оператор:  @helperbingo_bot"
                else:
                    success_message = f"🎰 {casino_name}\n"
                    success_message += f"✅ Вывод {amount_str} сом\n"
                    success_message += f"🆔 {account_id}\n"
                    success_message += f"⏳ Ваши деньги поступят на ваш кошелёк в течение 5 минут.\n\n"
                    success_message += f"👨‍💻 Оператор:  @helperbingo_bot"
            else:
                # Если сумма не получена, используем стандартное сообщение
                casino_name = data.get('casino_name', 'Казино')
                if lang == 'ky':
                    success_message = f"🎰 {casino_name}\n"
                    success_message += f"✅ Чыгаруу өтүнүчү түзүлдү\n"
                    success_message += f"🆔 {account_id}\n"
                    success_message += f"⏳ Акчаңыз 5 мүнөттүн ичинде капчыңызга келет.\n\n"
                    success_message += f"👨‍💻 Оператор:  @helperbingo_bot"
                else:
                    success_message = f"🎰 {casino_name}\n"
                    success_message += f"✅ Заявка на вывод создана\n"
                    success_message += f"🆔 {account_id}\n"
                    success_message += f"⏳ Ваши деньги поступят на ваш кошелёк в течение 5 минут.\n\n"
                    success_message += f"👨‍💻 Оператор:  @helperbingo_bot"
            
            # Отправляем сообщение о создании заявки и сохраняем его ID
            request_created_msg = await message.answer(success_message)
            
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
                import asyncio
                asyncio.create_task(save_message_id_background())
        else:
            await message.answer(get_text(lang, 'withdraw', 'error'))
        
    except Exception as e:
        print(f"Error creating withdraw request: {e}")
        # Проверяем тип ошибки
        error_msg = str(e).lower()
        if 'connection' in error_msg or 'connect' in error_msg or 'refused' in error_msg:
            if lang == 'ky':
                await message.answer(
                    '❌ Сервер жеткиликсиз. Админ панелди 3001 портунда иштеткениңизди текшериңиз.\n\n'
                    'Админ панелди иштетүү:\n'
                    'cd admin_nextjs\n'
                    'npm run dev',
                )
            else:
                await message.answer(
                    '❌ Сервер недоступен. Пожалуйста, убедитесь, что админ-панель запущена на порту 3001.\n\n'
                    'Запустите админ-панель:\n'
                    'cd admin_nextjs\n'
                    'npm run dev',
                )
        else:
            await message.answer(get_text(lang, 'withdraw', 'error'))
    
    await state.clear()
    
    # НЕ показываем главное меню автоматически - пользователь сам вернется через инлайн кнопку

@router.message(F.text.in_(['❌ Операция отменена', '❌ Аракет жокко чыгарылды']))
async def cancel_withdraw(message: Message, state: FSMContext, bot: Bot):
    """Отмена операции вывода"""
    await state.clear()
    # Показываем главное меню
    from handlers.start import cmd_start
    await cmd_start(message, state, bot)

