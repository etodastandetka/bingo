import asyncio
import logging
import aiohttp
import ssl
import os
from pathlib import Path
from dotenv import load_dotenv
from aiogram import Bot, Dispatcher, Router, F
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery
from aiogram.filters import Command
from aiogram.fsm.storage.memory import MemoryStorage

# Загружаем .env из admin/.env
admin_env_path = Path(__file__).parent.parent / 'admin' / '.env'
if admin_env_path.exists():
    load_dotenv(dotenv_path=admin_env_path, override=True)
else:
    load_dotenv()

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Конфигурация
ADMIN_BOT_TOKEN = os.getenv('ADMIN_BOT_TOKEN')
ADMIN_IDS = [int(id.strip()) for id in os.getenv('ADMIN_IDS', '').split(',') if id.strip().isdigit()]
API_BASE_URL = os.getenv('API_BASE_URL', 'http://localhost:3001/api')

# Проверка токена
if not ADMIN_BOT_TOKEN:
    logger.error("ADMIN_BOT_TOKEN не установлен! Проверьте файл .env")
    exit(1)

if not ADMIN_IDS:
    logger.warning("ADMIN_IDS не установлен! Бот будет доступен всем пользователям")

router = Router()

# Отключаем проверку SSL для внутренних запросов
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

async def manage_pm2(action: str) -> dict:
    """Управление PM2 процессами через API"""
    connector = aiohttp.TCPConnector(ssl=ssl_context)
    async with aiohttp.ClientSession(connector=connector) as session:
        url = f"{API_BASE_URL}/admin/pm2"
        
        try:
            async with session.post(
                url,
                json={'action': action},
                timeout=aiohttp.ClientTimeout(total=35),
                ssl=ssl_context
            ) as response:
                content_type = response.headers.get('Content-Type', '')
                if 'application/json' not in content_type:
                    text = await response.text()
                    return {
                        'success': False,
                        'message': f'Non-JSON response: {text[:200]}',
                        'error': text
                    }
                try:
                    return await response.json()
                except Exception as e:
                    return {
                        'success': False,
                        'message': f'Failed to parse JSON: {str(e)}',
                        'error': str(e)
                    }
        except asyncio.TimeoutError:
            return {
                'success': False,
                'message': f'Timeout while trying to {action} PM2 processes',
                'error': 'Request timeout'
            }
        except Exception as e:
            return {
                'success': False,
                'message': f'Error managing PM2: {str(e)}',
                'error': str(e)
            }

def is_admin(user_id: int) -> bool:
    """Проверка, является ли пользователь админом"""
    if not ADMIN_IDS:
        return True  # Если список пуст, разрешаем всем
    return user_id in ADMIN_IDS

@router.message(Command("start"))
async def cmd_start(message: Message):
    """Обработка команды /start"""
    if not is_admin(message.from_user.id):
        await message.answer('❌ У вас нет доступа к этому боту')
        return
    
    # Отправляем 2 сообщения с кнопками управления PM2
    keyboard_stop = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text='🛑 Отключить ботов',
            callback_data='pm2_stop'
        )]
    ])
    await message.answer(
        '🛑 Управление сервером\n\nНажмите кнопку для отключения всех ботов (pm2 stop all)',
        reply_markup=keyboard_stop
    )
    
    await asyncio.sleep(0.5)  # Небольшая задержка между сообщениями
    
    keyboard_start = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text='▶️ Включить ботов',
            callback_data='pm2_restart'
        )]
    ])
    await message.answer(
        '▶️ Управление сервером\n\nНажмите кнопку для включения/перезапуска всех ботов (pm2 restart all)',
        reply_markup=keyboard_start
    )

@router.callback_query(F.data == 'pm2_stop')
async def pm2_stop_callback(callback: CallbackQuery):
    """Обработка кнопки 'Отключить ботов'"""
    if not is_admin(callback.from_user.id):
        try:
            await callback.answer('❌ У вас нет прав для выполнения этого действия', show_alert=True)
        except:
            pass
        return
    
    try:
        await callback.answer('⏳ Выполняется команда pm2 stop all...')
    except:
        pass
    
    try:
        result = await manage_pm2('stop')
        
        if result.get('success'):
            processed = result.get('processed', 0)
            total = result.get('total', 0)
            results = result.get('results', '')
            stdout = result.get('stdout', '')
            
            response_text = f'✅ Боты отключены!\n\nОбработано: {processed}/{total}'
            if results:
                response_text += f'\n\nДетали:\n```\n{results}\n```'
            elif stdout:
                response_text += f'\n\nВывод:\n```\n{stdout}\n```'
            await callback.message.answer(response_text, parse_mode='Markdown')
            logger.info(f"[PM2] User {callback.from_user.id} stopped PM2 processes: {processed}/{total}")
        else:
            error_msg = result.get('message') or result.get('error') or 'Неизвестная ошибка'
            error_details = result.get('stderr', '')
            response = f'❌ Ошибка при отключении ботов:\n\n{error_msg}'
            if error_details:
                response += f'\n\nДетали:\n```\n{error_details}\n```'
            await callback.message.answer(response, parse_mode='Markdown')
            logger.error(f"[PM2] Failed to stop PM2: {error_msg}")
    except Exception as e:
        logger.error(f"[PM2] Error stopping PM2: {e}", exc_info=True)
        try:
            await callback.message.answer(f'❌ Ошибка при выполнении команды: {str(e)}')
        except:
            pass

@router.callback_query(F.data == 'pm2_restart')
async def pm2_restart_callback(callback: CallbackQuery):
    """Обработка кнопки 'Включить ботов'"""
    if not is_admin(callback.from_user.id):
        try:
            await callback.answer('❌ У вас нет прав для выполнения этого действия', show_alert=True)
        except:
            pass
        return
    
    try:
        await callback.answer('⏳ Выполняется команда pm2 restart all...')
    except:
        pass
    
    try:
        result = await manage_pm2('restart')
        
        if result.get('success'):
            processed = result.get('processed', 0)
            total = result.get('total', 0)
            results = result.get('results', '')
            stdout = result.get('stdout', '')
            
            response_text = f'✅ Боты перезапущены!\n\nОбработано: {processed}/{total}'
            if results:
                response_text += f'\n\nДетали:\n```\n{results}\n```'
            elif stdout:
                response_text += f'\n\nВывод:\n```\n{stdout}\n```'
            await callback.message.answer(response_text, parse_mode='Markdown')
            logger.info(f"[PM2] User {callback.from_user.id} restarted PM2 processes: {processed}/{total}")
        else:
            error_msg = result.get('message') or result.get('error') or 'Неизвестная ошибка'
            error_details = result.get('stderr', '')
            response = f'❌ Ошибка при перезапуске ботов:\n\n{error_msg}'
            if error_details:
                response += f'\n\nДетали:\n```\n{error_details}\n```'
            await callback.message.answer(response, parse_mode='Markdown')
            logger.error(f"[PM2] Failed to restart PM2: {error_msg}")
    except Exception as e:
        logger.error(f"[PM2] Error restarting PM2: {e}", exc_info=True)
        try:
            await callback.message.answer(f'❌ Ошибка при выполнении команды: {str(e)}')
        except:
            pass

async def main():
    """Главная функция запуска бота"""
    logger.info("Запуск админ-бота для управления PM2...")
    
    # Инициализация бота и диспетчера
    bot = Bot(token=ADMIN_BOT_TOKEN)
    dp = Dispatcher(storage=MemoryStorage())
    dp.include_router(router)
    
    try:
        # Удаляем вебхук если есть
        await bot.delete_webhook(drop_pending_updates=True)
        logger.info("Вебхук удален")
        
        # Запускаем polling
        logger.info("Бот запущен и готов к работе")
        await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())
    except Exception as e:
        logger.error(f"Ошибка при запуске бота: {e}", exc_info=True)
    finally:
        await bot.session.close()

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Бот остановлен пользователем")

