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

@router.message(F.text.in_(['💸 Вывести', '💸 Чыгаруу']))
async def withdraw_start(message: Message, state: FSMContext):
    """Начало процесса вывода - выбор казино"""
    lang = await get_lang_from_state(state)
    
    # Проверяем блокировку пользователя
    try:
        blocked_check = await APIClient.check_blocked(str(message.from_user.id))
        if blocked_check.get('success') and blocked_check.get('data', {}).get('blocked'):
            blocked_data = blocked_check.get('data', {})
            blocked_message = blocked_data.get('message', 'Вы заблокированы')
            await message.answer(blocked_message)
            return
    except Exception as e:
        print(f"Error checking blocked status: {e}")
        # Продолжаем работу, если проверка не удалась
    
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
    enabled_banks = settings.get('withdrawals', {}).get('banks', [])
    
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
    
    keyboard = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=get_text(lang, 'withdraw', 'cancel'))]],
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
    keyboard = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=get_text(lang, 'withdraw', 'cancel'))]],
        resize_keyboard=True
    )
    
    # Отправляем фото казино с текстом
    data = await state.get_data()
    casino_id = data.get('casino_id', '')
    casino_name = data.get('casino_name', '')
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
    
    # Проверяем блокировку accountId
    try:
        blocked_check = await APIClient.check_blocked(str(message.from_user.id), account_id)
        if blocked_check.get('success') and blocked_check.get('data', {}).get('blocked'):
            blocked_data = blocked_check.get('data', {})
            blocked_message = blocked_data.get('message', 'Аккаунт заблокирован')
            await message.answer(blocked_message)
            return
    except Exception as e:
        print(f"Error checking blocked accountId: {e}")
        # Продолжаем работу, если проверка не удалась
    
    await state.update_data(account_id=account_id)
    
    keyboard = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=get_text(lang, 'withdraw', 'cancel'))]],
        resize_keyboard=True
    )
    
    await message.answer(
        get_text(lang, 'withdraw', 'enter_code'),
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
        
        amount_value = amount_result.get('data', {}).get('amount') if amount_result.get('success') else None
        if amount_value is not None:
            withdraw_amount = amount_value
            if withdraw_amount <= 0:
                amount_check_ok = False
                await message.answer("⚠️ Сумма вывода не найдена. Проверьте код и попробуйте ещё раз.")
        else:
            amount_check_ok = False
            error_message = amount_result.get('error') or amount_result.get('message') or 'Не удалось получить сумму вывода'
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
        )
        
        request_id = request_data.get('data', {}).get('id')
        
        if request_id:
            # Формируем сообщение с суммой
            if withdraw_amount > 0:
                if lang == 'ky':
                    success_message = f"✅ Ваша заявка на вывод {withdraw_amount:.2f} KGS была отправлена!\n\n"
                    success_message += f"🎰 Казино: {data.get('casino_name')}\n"
                    success_message += f"🏦 Банк: {data.get('bank_name')}\n"
                    success_message += f"📱 Телефон: {data.get('phone')}\n"
                    success_message += f"🆔 ID: {account_id}\n\n"
                    success_message += f"Ваша заявка будет обработана в ближайшее время."
                else:
                    success_message = f"✅ Ваша заявка на вывод {withdraw_amount:.2f} KGS была отправлена!\n\n"
                    success_message += f"🎰 Казино: {data.get('casino_name')}\n"
                    success_message += f"🏦 Банк: {data.get('bank_name')}\n"
                    success_message += f"📱 Телефон: {data.get('phone')}\n"
                    success_message += f"🆔 ID: {account_id}\n\n"
                    success_message += f"Ваша заявка будет обработана в ближайшее время."
            else:
                success_message = get_text(lang, 'withdraw', 'request_created',
                        casino=data.get("casino_name"),
                        bank=data.get("bank_name"),
                        phone=data.get("phone"),
                        account_id=account_id)
            
            await message.answer(success_message)
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
    
    # Показываем главное меню после создания заявки или ошибки
    from handlers.start import cmd_start
    await cmd_start(message, state, bot)

@router.message(F.text.in_(['❌ Операция отменена', '❌ Аракет жокко чыгарылды']))
async def cancel_withdraw(message: Message, state: FSMContext, bot: Bot):
    """Отмена операции вывода"""
    await state.clear()
    # Показываем главное меню
    from handlers.start import cmd_start
    await cmd_start(message, state, bot)

