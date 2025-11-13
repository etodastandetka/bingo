from aiogram import Router, F
from aiogram.types import Message, ReplyKeyboardMarkup, KeyboardButton
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from config import Config
from translations import get_text

router = Router()

def get_user_lang(state: FSMContext) -> str:
    """Получить язык пользователя (по умолчанию русский)"""
    # В реальном проекте можно сохранять в БД
    # Здесь используем состояние
    return 'ru'  # По умолчанию русский

async def get_lang_from_state(state: FSMContext) -> str:
    """Получить язык из состояния"""
    data = await state.get_data()
    return data.get('language', 'ru')

@router.message(Command("start"))
async def cmd_start(message: Message, state: FSMContext):
    lang = await get_lang_from_state(state)
    first_name = message.from_user.first_name or ('kotik' if lang == 'ru' else 'баатыр')
    
    text = f"""{get_text(lang, 'start', 'greeting', name=first_name)}

{get_text(lang, 'start', 'auto_deposit')}
{get_text(lang, 'start', 'auto_withdraw')}
{get_text(lang, 'start', 'working')}

{get_text(lang, 'start', 'support', support=Config.SUPPORT)}"""
    
    keyboard = ReplyKeyboardMarkup(
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
    
    await message.answer(text, reply_markup=keyboard)

