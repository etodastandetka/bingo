from aiogram import Router, F, Bot
from aiogram.types import Message, FSInputFile
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
    """Начало процесса пополнения - автоматически выбираем 1xbet"""
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
    
    # Автоматически устанавливаем 1xbet
    casino_id = '1xbet'
    casino_name = '1xBet'
    
    # Проверяем, включено ли казино
    enabled_casinos = settings.get('casinos', {})
    if enabled_casinos.get(casino_id, True) is False:
        await message.answer(get_text(lang, 'deposit', 'casino_disabled'))
        return
    
    await state.update_data(casino_id=casino_id, casino_name=casino_name)
    
    keyboard = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=get_text(lang, 'deposit', 'cancel'))]],
        resize_keyboard=True
    )
    
    # Отправляем фото казино с текстом
    # Фото находятся в корневой папке проекта
    photo_path = Path(__file__).parent.parent.parent / f"{casino_id}.jpg"
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

    # Проверяем игрока через API
    data = await state.get_data()
    casino_id = data.get('casino_id')
    player_info = None

    if casino_id:
        checking_msg = await message.answer("🔍 Проверяю ID игрока...")
        try:
            check_result = await APIClient.check_player(casino_id, account_id)
        finally:
            try:
                await checking_msg.delete()
            except:
                pass

        check_success = check_result.get('success')
        check_data = check_result.get('data') or {}
        player_exists = check_data.get('exists')
        player_info = check_data.get('player') or {}

        if (not check_success) or (player_exists is False) or (not player_info and player_exists is not True):
            await message.answer(get_text(lang, 'deposit', 'player_not_found'))
            return

    await state.update_data(account_id=account_id, player_info=player_info)
    
    keyboard = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=get_text(lang, 'deposit', 'cancel'))]],
        resize_keyboard=True
    )
    
    amount_prompt = get_text(lang, 'deposit', 'enter_amount', min=str(Config.DEPOSIT_MIN), max=str(Config.DEPOSIT_MAX))
    # Убрали данные казино - показываем только запрос суммы

    await message.answer(
        amount_prompt,
        reply_markup=keyboard
    )
    await state.set_state(DepositStates.waiting_for_amount)

@router.message(DepositStates.waiting_for_amount)
async def deposit_amount_received(message: Message, state: FSMContext, bot: Bot):
    """Сумма получена, создаем заявку и отправляем ссылку на оплату"""
    lang = await get_lang_from_state(state)
    
    # Проверяем отмену
    if message.text == get_text(lang, 'deposit', 'cancel'):
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
        
        # НЕ создаем заявку здесь - она будет создана на форме оплаты при нажатии "Я оплатил"
        # Формируем URL для оплаты с передачей всех необходимых данных
        from urllib.parse import urlencode
        
        params = {
            'amount': str(amount_with_cents),
            'user_id': str(message.from_user.id),
            'casino_id': casino_id,
            'account_id': account_id,
        }
        
        # Добавляем опциональные параметры с правильным кодированием
        if message.from_user.username:
            params['username'] = message.from_user.username
        if message.from_user.first_name:
            params['first_name'] = message.from_user.first_name
        if message.from_user.last_name:
            params['last_name'] = message.from_user.last_name
        
        # Добавляем timestamp для отслеживания времени создания заявки
        import time
        params['created_at'] = str(int(time.time() * 1000))
        
        # Формируем URL с правильно закодированными параметрами
        # Всегда используем продакшн URL для пользователей (Telegram не принимает localhost)
        if 'localhost' in Config.PAYMENT_SITE_URL.lower():
            # Если в конфиге localhost, используем fallback URL
            payment_url = f"{Config.PAYMENT_FALLBACK_URL}/pay?{urlencode(params)}"
        else:
            payment_url = f"{Config.PAYMENT_SITE_URL}/pay?{urlencode(params)}"
        
        # Отправляем ссылку в тексте и обычную кнопку с URL
        from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text='💳 Перейти к оплате', url=payment_url)]
        ])
        
        # Формируем текст без ссылки (ссылка только в кнопке)
        payment_text = get_text(lang, 'deposit', 'go_to_payment', 
                               amount=amount_with_cents, 
                               casino=data.get("casino_name"), 
                               account_id=account_id)
        # Убрали ссылку из текста - она открывается через кнопку (мини-приложение)
        
        await message.answer(
            payment_text,
            reply_markup=keyboard
        )
        
        # НЕ очищаем состояние и НЕ возвращаем в главное меню
        # Пользователь останется в боте, форма оплаты откроется в WebApp
        # Возврат в главное меню произойдет только при закрытии формы (успех/отмена/таймер)
        
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

@router.message(F.text.in_(['❌ Операция отменена', '❌ Аракет жокко чыгарылды']))
async def cancel_deposit(message: Message, state: FSMContext, bot: Bot):
    """Отмена операции пополнения"""
    await state.clear()
    # Показываем главное меню
    from handlers.start import cmd_start
    await cmd_start(message, state, bot)

