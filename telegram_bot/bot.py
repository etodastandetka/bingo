import asyncio
import logging
import aiohttp
from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage
from config import Config, print_logo
from handlers import start, deposit, withdraw, language, instruction, chat

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Выводим логотип при запуске
print_logo()

async def main():
    """Главная функция запуска бота"""
    if not Config.BOT_TOKEN:
        logger.error("BOT_TOKEN не установлен! Проверьте файл .env")
        return
    
    # Инициализация бота и диспетчера с увеличенными таймаутами
    from aiogram.client.session.aiohttp import AiohttpSession
    from aiogram.client.telegram import TelegramAPIServer
    from aiogram.exceptions import TelegramNetworkError
    
    # Создаем кастомную сессию, которая возвращает числовой таймаут
    # Проблема: aiogram пытается сложить bot.session.timeout (ClientTimeout) с int
    # Решение: создаем сессию с переопределенным свойством timeout (getter + setter)
    class CustomAiohttpSession(AiohttpSession):
        def __init__(self, *args, **kwargs):
            # Сохраняем числовое значение таймаута перед вызовом super()
            self._numeric_timeout = kwargs.pop('timeout', 30.0)
            # Если передан ClientTimeout, извлекаем числовое значение
            if isinstance(self._numeric_timeout, aiohttp.ClientTimeout):
                self._numeric_timeout = self._numeric_timeout.total or 30.0
            super().__init__(*args, **kwargs)
        
        @property
        def timeout(self):
            # Возвращаем числовое значение вместо ClientTimeout
            return self._numeric_timeout
        
        @timeout.setter
        def timeout(self, value):
            # Сохраняем числовое значение, даже если передан ClientTimeout
            if isinstance(value, aiohttp.ClientTimeout):
                self._numeric_timeout = value.total or 30.0
            else:
                self._numeric_timeout = float(value) if value is not None else 30.0
    
    # Создаем кастомную сессию
    session = CustomAiohttpSession(
        api=TelegramAPIServer.from_base('https://api.telegram.org')
    )
    
    # Создаем бота
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
    
    # Запуск polling с обработкой ошибок и retry
    # Указываем request_timeout как число (в секундах) для совместимости
    max_retries = 5
    retry_delay = 5  # секунд
    
    for attempt in range(max_retries):
        try:
            # Используем request_timeout как число, а не ClientTimeout объект
            await dp.start_polling(
                bot, 
                allowed_updates=["message", "callback_query", "chat_member"],
                request_timeout=30.0  # 30 секунд в числовом формате
            )
            break  # Успешный запуск
        except TelegramNetworkError as e:
            if attempt < max_retries - 1:
                logger.warning(f"Ошибка подключения к Telegram API (попытка {attempt + 1}/{max_retries}): {e}")
                logger.info(f"Повторная попытка через {retry_delay} секунд...")
                await asyncio.sleep(retry_delay)
            else:
                logger.error(f"Не удалось подключиться к Telegram API после {max_retries} попыток")
                raise
        except Exception as e:
            logger.error(f"Неожиданная ошибка при запуске бота: {e}")
            raise

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Бот остановлен")

