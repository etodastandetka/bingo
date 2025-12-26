import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage
from config import Config
from handlers import start, deposit, withdraw, language, instruction, chat

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

async def main():
    """Главная функция запуска бота"""
    if not Config.BOT_TOKEN:
        logger.error("BOT_TOKEN не установлен! Проверьте файл .env")
        return
    
    # Инициализация бота и диспетчера с увеличенными таймаутами
    from aiogram.client.session.aiohttp import AiohttpSession
    from aiogram.client.telegram import TelegramAPIServer
    
    # Создаем сессию с увеличенными таймаутами
    session = AiohttpSession(
        api=TelegramAPIServer.from_base('https://api.telegram.org'),
        timeout=aiohttp.ClientTimeout(total=30, connect=10)  # 30 секунд общий таймаут, 10 секунд на подключение
    )
    
    bot = Bot(token=Config.BOT_TOKEN, session=session)
    dp = Dispatcher(storage=MemoryStorage())
    
    # Регистрация роутеров
    dp.include_router(start.router)
    dp.include_router(deposit.router)
    dp.include_router(withdraw.router)
    dp.include_router(language.router)
    dp.include_router(instruction.router)
    dp.include_router(chat.router)
    
    logger.info("Бот запущен!")
    
    # Запуск polling
    await dp.start_polling(bot)

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Бот остановлен")

