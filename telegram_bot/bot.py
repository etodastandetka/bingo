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
    # Увеличиваем таймаут для отправки больших файлов (фото QR кодов)
    class CustomAiohttpSession(AiohttpSession):
        def __init__(self, *args, **kwargs):
            # Сохраняем числовое значение таймаута перед вызовом super()
            # Увеличиваем таймаут до 60 секунд для отправки больших файлов
            timeout_value = kwargs.pop('timeout', None)
            if timeout_value is None:
                timeout_value = aiohttp.ClientTimeout(total=60.0, connect=10.0)
            elif isinstance(timeout_value, (int, float)):
                timeout_value = aiohttp.ClientTimeout(total=float(timeout_value), connect=10.0)
            elif isinstance(timeout_value, aiohttp.ClientTimeout):
                # Если уже ClientTimeout, увеличиваем total если он меньше 60
                if timeout_value.total is None or timeout_value.total < 60.0:
                    timeout_value = aiohttp.ClientTimeout(total=60.0, connect=timeout_value.connect or 10.0)
            
            kwargs['timeout'] = timeout_value
            super().__init__(*args, **kwargs)
            
            # Сохраняем числовое значение для совместимости
            self._numeric_timeout = timeout_value.total if isinstance(timeout_value, aiohttp.ClientTimeout) else 60.0
        
        @property
        def timeout(self):
            # Возвращаем числовое значение вместо ClientTimeout для совместимости
            return self._numeric_timeout
        
        @timeout.setter
        def timeout(self, value):
            # Сохраняем числовое значение, даже если передан ClientTimeout
            if isinstance(value, aiohttp.ClientTimeout):
                self._numeric_timeout = value.total or 60.0
            else:
                self._numeric_timeout = float(value) if value is not None else 60.0
    
    # Создаем кастомную сессию с увеличенным таймаутом (60 секунд для больших файлов)
    session = CustomAiohttpSession(
        api=TelegramAPIServer.from_base('https://api.telegram.org'),
        timeout=aiohttp.ClientTimeout(total=60.0, connect=10.0)  # 60 секунд для отправки фото
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
    
    # Запуск polling с обработкой ошибок и retry
    # Указываем request_timeout как число (в секундах) для совместимости
    max_retries = 5
    retry_delay = 5  # секунд
    
    for attempt in range(max_retries):
        try:
            # Используем request_timeout как число, а не ClientTimeout объект
            # Увеличиваем до 60 секунд для отправки больших файлов (QR коды)
            await dp.start_polling(
                bot, 
                allowed_updates=["message", "callback_query", "chat_member"],
                request_timeout=60.0  # 60 секунд для отправки больших файлов
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

