from aiogram import Router, F
from aiogram.types import Message, CallbackQuery
from aiogram.fsm.context import FSMContext
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, ReplyKeyboardMarkup, KeyboardButton
from states import LanguageStates
from config import Config
from translations import get_text

router = Router()

async def get_lang_from_state(state: FSMContext) -> str:
    """Получить язык из состояния"""
    data = await state.get_data()
    return data.get('language', 'ru')

@router.message(F.text.in_(['🌐 Язык', '🌐 Тил', '🌐 Til']))
async def language_menu(message: Message, state: FSMContext):
    """Меню выбора языка"""
    lang = await get_lang_from_state(state)
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[])
    
    for language in Config.LANGUAGES:
        keyboard.inline_keyboard.append([
            InlineKeyboardButton(
                text=language['name'],
                callback_data=f'lang_{language["code"]}'
            )
        ])
    
    await message.answer(
        get_text(lang, 'language', 'select'),
        reply_markup=keyboard,
    )

@router.callback_query(F.data.startswith('lang_'))
async def language_selected(callback: CallbackQuery, state: FSMContext):
    """Язык выбран"""
    lang_code = callback.data.replace('lang_', '')
    
    # Сохраняем язык в состоянии
    await state.update_data(language=lang_code)
    
    # Отправляем обновленное главное меню
    from config import Config
    from aiogram.types import ReplyKeyboardMarkup, KeyboardButton
    
    first_name = callback.from_user.first_name or ('kotik' if lang_code == 'ru' else 'баатыр')
    
    text = f"""{get_text(lang_code, 'start', 'greeting', name=first_name)}

{get_text(lang_code, 'start', 'auto_deposit')}
{get_text(lang_code, 'start', 'auto_withdraw')}
{get_text(lang_code, 'start', 'working')}

{get_text(lang_code, 'start', 'channel', channel=Config.CHANNEL)}
{get_text(lang_code, 'start', 'support', support=Config.SUPPORT)}"""
    
    keyboard = ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(text=get_text(lang_code, 'menu', 'deposit')),
                KeyboardButton(text=get_text(lang_code, 'menu', 'withdraw'))
            ],
            [
                KeyboardButton(text=get_text(lang_code, 'menu', 'instruction')),
                KeyboardButton(text=get_text(lang_code, 'menu', 'language'))
            ]
        ],
        resize_keyboard=True
    )
    
    await callback.message.answer(text, reply_markup=keyboard)
    await callback.answer(get_text(lang_code, 'language', 'changed'))

