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
    
    # Инициализация бота и диспетчера
    bot = Bot(token=Config.BOT_TOKEN)
    dp = Dispatcher(storage=MemoryStorage())
    
    # Регистрация роутеров
    dp.include_router(start.router)
    dp.include_router(deposit.router)
    dp.include_router(withdraw.router)
    dp.include_router(language.router)
    dp.include_router(instruction.router)
    dp.include_router(chat.router)
    
    logger.info("Бот 1xBet запущен!")
    
    # Удаляем webhook перед запуском polling (если он был установлен)
    # Делаем несколько попыток, так как webhook может быть установлен извне
    max_webhook_retries = 3
    for attempt in range(max_webhook_retries):
        try:
            await bot.delete_webhook(drop_pending_updates=True)
            logger.info("Webhook удален, переходим на polling режим")
            break
        except Exception as e:
            if attempt < max_webhook_retries - 1:
                logger.warning(f"Попытка {attempt + 1}/{max_webhook_retries} удаления webhook не удалась: {e}, повторяем...")
                await asyncio.sleep(1)
            else:
                logger.error(f"Не удалось удалить webhook после {max_webhook_retries} попыток: {e}")
                # Продолжаем работу, возможно webhook уже удален
    
    # Запуск polling
    await dp.start_polling(bot)

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Бот остановлен")

