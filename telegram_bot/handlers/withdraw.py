from aiogram import Router, F
from aiogram.types import CallbackQuery, Message
from aiogram.fsm.context import FSMContext
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, ReplyKeyboardMarkup, KeyboardButton
from states import WithdrawStates
from config import Config
from api_client import APIClient
from translations import get_text
import base64
import io

router = Router()

async def get_lang_from_state(state: FSMContext) -> str:
    """Получить язык из состояния"""
    data = await state.get_data()
    return data.get('language', 'ru')

@router.message(F.text.in_(['💸 Вывести', '💸 Чыгаруу']))
async def withdraw_start(message: Message, state: FSMContext):
    """Начало процесса вывода - выбор казино"""
    lang = await get_lang_from_state(state)
    
    # Получаем настройки из админки
    settings = await APIClient.get_payment_settings()
    enabled_casinos = settings.get('casinos', {})
    
    # Фильтруем казино по настройкам (показываем только включенные)
    keyboard = InlineKeyboardMarkup(inline_keyboard=[])
    row = []
    for casino in Config.CASINOS:
        # Проверяем, включено ли казино (по умолчанию true, если не указано)
        casino_id = casino['id']
        if enabled_casinos.get(casino_id, True):
            row.append(InlineKeyboardButton(
                text=casino['name'],
                callback_data=f'withdraw_casino_{casino_id}'
            ))
            if len(row) == 2:
                keyboard.inline_keyboard.append(row)
                row = []
    if row:
        keyboard.inline_keyboard.append(row)
    
    if not keyboard.inline_keyboard:
        await message.answer(get_text(lang, 'withdraw', 'no_casinos_available'))
        return
    
    await message.answer(
        get_text(lang, 'withdraw', 'select_casino'),
        reply_markup=keyboard
    )
    await state.set_state(WithdrawStates.waiting_for_casino)

@router.callback_query(F.data.startswith('withdraw_casino_'), WithdrawStates.waiting_for_casino)
async def withdraw_casino_selected(callback: CallbackQuery, state: FSMContext):
    """Казино выбрано, запрашиваем выбор банка"""
    lang = await get_lang_from_state(state)
    casino_id = callback.data.replace('withdraw_casino_', '')
    casino_name = next((c['name'] for c in Config.CASINOS if c['id'] == casino_id), casino_id)
    
    await state.update_data(casino_id=casino_id, casino_name=casino_name)
    
    # Получаем настройки из админки для фильтрации банков
    settings = await APIClient.get_payment_settings()
    enabled_banks = settings.get('withdrawals', {}).get('banks', [])
    
    # Создаем обычную клавиатуру для банков
    keyboard = ReplyKeyboardMarkup(keyboard=[], resize_keyboard=True)
    
    # Создаем кнопки банков по 2 в ряд (только включенные)
    row = []
    for bank in Config.WITHDRAW_BANKS:
        if bank['id'] in enabled_banks:
            row.append(KeyboardButton(text=bank['name']))
            if len(row) == 2:
                keyboard.keyboard.append(row)
                row = []
    if row:
        keyboard.keyboard.append(row)
    
    keyboard.keyboard.append([
        KeyboardButton(text=get_text(lang, 'withdraw', 'cancel'))
    ])
    
    await callback.message.answer(
        get_text(lang, 'withdraw', 'select_bank', casino=casino_name),
        reply_markup=keyboard
    )
    await state.set_state(WithdrawStates.waiting_for_bank)
    await callback.answer()

@router.message(WithdrawStates.waiting_for_bank)
async def withdraw_bank_selected(message: Message, state: FSMContext):
    """Банк выбран, запрашиваем номер телефона"""
    lang = await get_lang_from_state(state)
    
    if message.text == get_text(lang, 'withdraw', 'cancel'):
        await state.clear()
        # Показываем главное меню
        from handlers.start import cmd_start
        await cmd_start(message, state)
        return
    
    # Ищем банк по названию
    bank = next((b for b in Config.WITHDRAW_BANKS if b['name'] == message.text), None)
    if not bank:
        await message.answer('❌ Пожалуйста, выберите банк из списка')
        return
    
    bank_id = bank['id']
    bank_name = bank['name']
    
    await state.update_data(bank_id=bank_id, bank_name=bank_name)
    
    data = await state.get_data()
    casino_name = data.get('casino_name', '')
    
    keyboard = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=get_text(lang, 'withdraw', 'cancel'))]],
        resize_keyboard=True
    )
    
    await message.answer(
        get_text(lang, 'withdraw', 'enter_phone', casino=casino_name, bank=bank_name),
        reply_markup=keyboard
    )
    await state.set_state(WithdrawStates.waiting_for_phone)

@router.message(WithdrawStates.waiting_for_phone)
async def withdraw_phone_received(message: Message, state: FSMContext):
    """Номер телефона получен, запрашиваем фото QR кода"""
    lang = await get_lang_from_state(state)
    
    if message.text == get_text(lang, 'withdraw', 'cancel'):
        await state.clear()
        # Показываем главное меню
        from handlers.start import cmd_start
        await cmd_start(message, state)
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
        reply_markup=keyboard
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
    
    await message.answer(
        get_text(lang, 'withdraw', 'enter_account_id'),
        reply_markup=keyboard
    )
    await state.set_state(WithdrawStates.waiting_for_account_id)

@router.message(WithdrawStates.waiting_for_qr_photo)
async def withdraw_qr_photo_invalid(message: Message, state: FSMContext):
    """Если отправлено не фото"""
    lang = await get_lang_from_state(state)
    await message.answer(get_text(lang, 'withdraw', 'invalid_photo'))

@router.message(WithdrawStates.waiting_for_account_id)
async def withdraw_account_id_received(message: Message, state: FSMContext):
    """ID казино получен, запрашиваем код с сайта казино"""
    lang = await get_lang_from_state(state)
    
    if message.text == get_text(lang, 'withdraw', 'cancel'):
        await state.clear()
        # Показываем главное меню
        from handlers.start import cmd_start
        await cmd_start(message, state)
        return
    
    account_id = message.text.strip()
    
    if not account_id or not account_id.isdigit():
        await message.answer('❌ Пожалуйста, отправьте корректный ID счета (только цифры)')
        return
    
    await state.update_data(account_id=account_id)
    
    keyboard = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=get_text(lang, 'withdraw', 'cancel'))]],
        resize_keyboard=True
    )
    
    await message.answer(
        get_text(lang, 'withdraw', 'enter_code'),
        reply_markup=keyboard
    )
    await state.set_state(WithdrawStates.waiting_for_withdrawal_code)

@router.message(WithdrawStates.waiting_for_withdrawal_code)
async def withdraw_code_received(message: Message, state: FSMContext):
    """Код получен, создаем заявку"""
    lang = await get_lang_from_state(state)
    
    if message.text == get_text(lang, 'withdraw', 'cancel'):
        await state.clear()
        # Показываем главное меню
        from handlers.start import cmd_start
        await cmd_start(message, state)
        return
    
    withdrawal_code = message.text.strip()
    
    if not withdrawal_code:
        await message.answer('❌ Пожалуйста, введите код')
        return
    
    data = await state.get_data()
    
    try:
        # Создаем заявку на вывод
        request_data = await APIClient.create_request(
            telegram_user_id=str(message.from_user.id),
            request_type='withdraw',
            amount=0,  # Сумма будет указана позже админом
            bookmaker=data.get('casino_id'),
            bank=data.get('bank_id'),
            phone=data.get('phone'),
            account_id=data.get('account_id'),
            telegram_username=message.from_user.username,
            telegram_first_name=message.from_user.first_name,
            telegram_last_name=message.from_user.last_name,
            receipt_photo=data.get('qr_photo'),
            withdrawal_code=withdrawal_code,
        )
        
        request_id = request_data.get('data', {}).get('id')
        
        if request_id:
            await message.answer(
                get_text(lang, 'withdraw', 'request_created',
                        casino=data.get("casino_name"),
                        bank=data.get("bank_name"),
                        phone=data.get("phone"),
                        account_id=data.get("account_id"))
            )
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
                    'npm run dev'
                )
            else:
                await message.answer(
                    '❌ Сервер недоступен. Пожалуйста, убедитесь, что админ-панель запущена на порту 3001.\n\n'
                    'Запустите админ-панель:\n'
                    'cd admin_nextjs\n'
                    'npm run dev'
                )
        else:
            await message.answer(get_text(lang, 'withdraw', 'error'))
    
    await state.clear()
    
    # Показываем главное меню после создания заявки или ошибки
    from handlers.start import cmd_start
    await cmd_start(message, state)

@router.message(F.text.in_(['❌ Операция отменена', '❌ Аракет жокко чыгарылды']))
async def cancel_withdraw(message: Message, state: FSMContext):
    """Отмена операции вывода"""
    await state.clear()
    # Показываем главное меню
    from handlers.start import cmd_start
    await cmd_start(message, state)

