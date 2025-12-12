from aiogram import Router, F
from aiogram.types import Message
from aiogram.fsm.context import FSMContext
from translations import get_text

router = Router()

async def get_lang_from_state(state: FSMContext) -> str:
    """Получить язык из состояния"""
    data = await state.get_data()
    return data.get('language', 'ru')

@router.message(F.text.in_(['📖 Инструкция', '📖 Көрсөтмө']))
async def show_instruction(message: Message, state: FSMContext):
    """Показать инструкцию"""
    lang = await get_lang_from_state(state)
    
    text = get_text(lang, 'instruction', 'text')
    
    await message.answer(text)

