from aiogram import Router, F
from aiogram.types import Message, CallbackQuery, FSInputFile
from aiogram.fsm.context import FSMContext
from aiogram.types import ReplyKeyboardMarkup, KeyboardButton
from states import DepositStates
from config import Config
from api_client import APIClient
from translations import get_text
import re
import os
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
    # Формируем кнопки по 2 в ряд
    keyboard = InlineKeyboardMarkup(inline_keyboard=[])
    row = []
    for casino in Config.CASINOS:
        # Проверяем, включено ли казино (по умолчанию true, если не указано)
        casino_id = casino['id']
        if enabled_casinos.get(casino_id, True):
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
async def deposit_account_id_received(message: Message, state: FSMContext):
    """ID счета получен, запрашиваем сумму"""
    lang = await get_lang_from_state(state)
    
    if message.text == get_text(lang, 'deposit', 'cancel'):
        await state.clear()
        # Показываем главное меню
        from handlers.start import cmd_start
        await cmd_start(message, state)
        return
    
    account_id = message.text.strip()
    
    if not account_id or not account_id.isdigit():
        await message.answer(get_text(lang, 'deposit', 'invalid_account_id'))
        return
    
    await state.update_data(account_id=account_id)
    
    keyboard = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=get_text(lang, 'deposit', 'cancel'))]],
        resize_keyboard=True
    )
    
    await message.answer(
        get_text(lang, 'deposit', 'enter_amount', min=str(Config.DEPOSIT_MIN), max=str(Config.DEPOSIT_MAX)),
        reply_markup=keyboard
    )
    await state.set_state(DepositStates.waiting_for_amount)

@router.message(DepositStates.waiting_for_amount)
async def deposit_amount_received(message: Message, state: FSMContext):
    """Сумма получена, создаем заявку и отправляем ссылку на оплату"""
    lang = await get_lang_from_state(state)
    
    # Проверяем отмену
    if message.text == get_text(lang, 'deposit', 'cancel'):
        await state.clear()
        # Показываем главное меню
        from handlers.start import cmd_start
        await cmd_start(message, state)
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
        
        # Добавляем копейки к сумме (случайное число от 1 до 99)
        import random
        amount_with_cents = amount + (random.randint(1, 99) / 100)
        
        # НЕ создаем заявку здесь - она будет создана на форме оплаты при нажатии "Я оплатил"
        # Формируем URL для оплаты с передачей всех необходимых данных
        payment_url = f"{Config.PAYMENT_SITE_URL}/pay?amount={amount_with_cents}"
        payment_url += f"&user_id={message.from_user.id}"
        payment_url += f"&casino_id={casino_id}"
        payment_url += f"&account_id={account_id}"
        if message.from_user.username:
            payment_url += f"&username={message.from_user.username}"
        if message.from_user.first_name:
            payment_url += f"&first_name={message.from_user.first_name}"
        if message.from_user.last_name:
            payment_url += f"&last_name={message.from_user.last_name}"
        
        # Отправляем кнопку WebApp для оплаты
        from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text='💳 Перейти к оплате', web_app=WebAppInfo(url=payment_url))]
        ])
        
        await message.answer(
            get_text(lang, 'deposit', 'go_to_payment', 
                    amount=amount_with_cents, 
                    casino=data.get("casino_name"), 
                    account_id=account_id),
            reply_markup=keyboard
        )
        
        # НЕ очищаем состояние и НЕ возвращаем в главное меню
        # Пользователь останется в боте, форма оплаты откроется в WebApp
        # Возврат в главное меню произойдет только при закрытии формы (успех/отмена/таймер)
        
    except ValueError:
        lang = await get_lang_from_state(state)
        await message.answer(get_text(lang, 'deposit', 'invalid_amount', min=Config.DEPOSIT_MIN, max=Config.DEPOSIT_MAX))
    except Exception as e:
        print(f"Error in deposit_amount_received: {e}")
        lang = await get_lang_from_state(state)
        await message.answer(get_text(lang, 'deposit', 'error'))
        await state.clear()
        # Показываем главное меню после ошибки
        from handlers.start import cmd_start
        await cmd_start(message, state)
        return

@router.message(F.text.in_(['❌ Операция отменена', '❌ Аракет жокко чыгарылды']))
async def cancel_deposit(message: Message, state: FSMContext):
    """Отмена операции пополнения"""
    await state.clear()
    # Показываем главное меню
    from handlers.start import cmd_start
    await cmd_start(message, state)

