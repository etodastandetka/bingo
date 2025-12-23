from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
import aiohttp
import asyncio
import qrcode
import io
import base64
import os
import json
import ssl
import hashlib
from datetime import datetime, timedelta
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

app = Flask(__name__)
CORS(app)

# Загружаем конфигурацию доменов из корня проекта
def load_domains_config():
    """Загружает конфигурацию доменов из domains.json"""
    try:
        # Путь к domains.json в корне проекта (на уровень выше payment_site)
        domains_path = Path(__file__).parent.parent / 'domains.json'
        if domains_path.exists():
            with open(domains_path, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        print(f"Warning: Could not load domains.json: {e}")
    return None

# Загружаем конфигурацию доменов
domains_config = load_domains_config()

# Определяем API_BASE_URL из конфига или .env
if domains_config and 'domains' in domains_config:
    API_BASE_URL = os.getenv('API_BASE_URL', domains_config['domains'].get('admin_api', 'http://localhost:3001/api'))
else:
    API_BASE_URL = os.getenv('API_BASE_URL', 'http://localhost:3001/api')

# Отключаем проверку SSL для внутренних запросов
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

# Путь к изображениям банков (из admin панели)
# Если изображения не найдены, можно использовать относительный путь
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES_DIR = os.path.join(BASE_DIR, 'admin', 'public', 'images')

# Проверяем существование директории
if not os.path.exists(IMAGES_DIR):
    print(f"Warning: Images directory not found: {IMAGES_DIR}")
    IMAGES_DIR = None

# Банки для пополнения
BANKS = [
    {'id': 'mbank', 'name': 'Mbank', 'icon': '/static/images/mbank.png'},
    {'id': 'omoney', 'name': 'О деньги', 'icon': '/static/images/omoney.jpg'},
    {'id': 'bakai', 'name': 'BAKAI', 'icon': '/static/images/bakai.jpg'},
    {'id': 'megapay', 'name': 'MEGApay', 'icon': '/static/images/megapay.jpg'},
]

async def generate_qr_async(amount, bank):
    """Асинхронная генерация QR кода"""
    connector = aiohttp.TCPConnector(ssl=ssl_context)
    async with aiohttp.ClientSession(connector=connector) as session:
        async with session.post(
            f'{API_BASE_URL}/public/generate-qr',
            json={'amount': amount, 'bank': bank}
        ) as response:
            return await response.json()

def generate_qr_image(qr_hash, unique_id=None):
    """Генерация изображения QR кода с встроенным водяным знаком и уникальным ID"""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,  # Увеличиваем коррекцию ошибок для лучшей читаемости
        box_size=12,  # Увеличен размер QR кода
        border=4,
    )
    qr.add_data(qr_hash)
    qr.make(fit=True)
    
    # Создаем базовое изображение QR кода
    img = qr.make_image(fill_color="black", back_color="white")
    img = img.convert('RGBA')
    
    # Получаем размеры изображения
    width, height = img.size
    
    # Создаем слой для водяного знака поверх QR кода (без фонового водяного знака)
    watermark = Image.new('RGBA', (width, height), (255, 255, 255, 0))
    draw = ImageDraw.Draw(watermark)
    
    # Добавляем диагональный текст водяного знака поверх QR кода (как на изображении)
    try:
        # Размер шрифта для диагонального текста (немного уменьшен)
        font_size = int(width * 0.095)
        try:
            # Пытаемся использовать жирный шрифт
            font = ImageFont.truetype("arialbd.ttf", font_size)  # Bold Arial
        except:
            try:
                font = ImageFont.truetype("arial.ttf", font_size)
            except:
                try:
                    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
                except:
                    font = ImageFont.load_default()
    except:
        font = ImageFont.load_default()
    
    # Основной текст (как на изображении) - "ПОПОЛНЕНИЕ КАЗИНО"
    text = "ПОПОЛНЕНИЕ КАЗИНО"
    
    # Получаем размеры текста
    try:
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
    except:
        # Fallback для старых версий PIL
        text_width = len(text) * font_size * 0.6
        text_height = font_size
    
    # Создаем временное изображение для поворота текста
    text_img = Image.new('RGBA', (int(text_width * 2.0), int(text_height * 2.0)), (255, 255, 255, 0))
    text_draw = ImageDraw.Draw(text_img)
    
    # Рисуем текст (просто красный, без белой обводки)
    x_offset = int(text_width * 0.5)
    y_offset = int(text_height * 0.5)
    
    # Основной текст (красный, достаточно видимый, но не мешает сканированию)
    # Используем более видимый красный с легкой прозрачностью
    text_draw.text((x_offset, y_offset), text, font=font, fill=(220, 0, 0, 160))  # Более читаемый красный
    
    # Поворачиваем текст на -45 градусов
    text_img = text_img.rotate(-45, expand=True, fillcolor=(255, 255, 255, 0))
    
    # Позиционируем в центре QR кода
    text_x = (width - text_img.width) // 2
    text_y = (height - text_img.height) // 2
    
    # Вставляем повернутый текст в водяной знак
    watermark.paste(text_img, (text_x, text_y), text_img)
    
    # Убираем уникальный ID в углах (на изображении его нет)
    
    # Объединяем QR код с водяным знаком
    img = Image.alpha_composite(img, watermark)
    
    # Добавляем место внизу для текста "ОТСКАНИРУЙТЕ QR" и "В любом банке"
    # Без красной рамки, как на изображении
    bottom_padding = 80  # Место для двух строк текста
    bordered_img = Image.new('RGB', (width, height + bottom_padding), (255, 255, 255))
    
    # Вставляем QR код с водяным знаком
    bordered_img.paste(img.convert('RGB'), (0, 0))
    
    # Создаем объект для рисования текста
    draw_border = ImageDraw.Draw(bordered_img)
    
    # Добавляем текст внизу: "ОТСКАНИРУЙТЕ QR" (черный, uppercase) и "В любом банке" (синий, lowercase)
    try:
        # Шрифт для "ОТСКАНИРУЙТЕ QR" (черный, uppercase, немного больше)
        scan_font_size = int(width * 0.05)
        try:
            scan_font = ImageFont.truetype("arial.ttf", scan_font_size)
        except:
            try:
                scan_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", scan_font_size)
            except:
                scan_font = ImageFont.load_default()
        
        # Шрифт для "В любом банке" (синий, lowercase, немного меньше)
        bank_font_size = int(width * 0.04)
        try:
            bank_font = ImageFont.truetype("arial.ttf", bank_font_size)
        except:
            try:
                bank_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", bank_font_size)
            except:
                bank_font = ImageFont.load_default()
    except:
        scan_font = ImageFont.load_default()
        bank_font = ImageFont.load_default()
    
    # Текст "ОТСКАНИРУЙТЕ QR" (черный, uppercase)
    scan_text = "ОТСКАНИРУЙТЕ QR"
    try:
        scan_bbox = draw_border.textbbox((0, 0), scan_text, font=scan_font)
        scan_text_width = scan_bbox[2] - scan_bbox[0]
    except:
        scan_text_width = len(scan_text) * scan_font_size * 0.6
    
    scan_x = (width - scan_text_width) // 2
    scan_y = height + 15
    draw_border.text((scan_x, scan_y), scan_text, font=scan_font, fill=(0, 0, 0, 255))  # Черный
    
    # Текст "В любом банке" (синий, lowercase)
    bank_text = "В любом банке"
    try:
        bank_bbox = draw_border.textbbox((0, 0), bank_text, font=bank_font)
        bank_text_width = bank_bbox[2] - bank_bbox[0]
    except:
        bank_text_width = len(bank_text) * bank_font_size * 0.6
    
    bank_x = (width - bank_text_width) // 2
    bank_y = scan_y + scan_font_size + 10
    # Синий цвет как на изображении (более яркий синий)
    draw_border.text((bank_x, bank_y), bank_text, font=bank_font, fill=(0, 123, 255, 255))  # Синий
    
    # Конвертируем обратно в RGB для лучшей совместимости
    final_img = bordered_img.convert('RGB')
    
    # Сохраняем в буфер
    buffer = io.BytesIO()
    final_img.save(buffer, format='PNG', quality=95)
    buffer.seek(0)
    
    img_base64 = base64.b64encode(buffer.read()).decode('utf-8')
    return f'data:image/png;base64,{img_base64}'

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/static/images/<path:filename>')
def images(filename):
    """Отдача изображений банков"""
    if not IMAGES_DIR or not os.path.exists(IMAGES_DIR):
        return '', 404
    try:
        return send_from_directory(IMAGES_DIR, filename)
    except:
        # Если файл не найден, возвращаем пустой ответ
        return '', 404

@app.route('/success')
def success():
    """Страница успешной отправки заявки"""
    request_id = request.args.get('request_id', '')
    amount = request.args.get('amount', '')
    bookmaker = request.args.get('bookmaker', '')
    
    return render_template('success.html',
                         request_id=request_id,
                         amount=amount,
                         bookmaker=bookmaker)

@app.route('/pay')
def pay():
    amount = request.args.get('amount', '0')
    qr_hash = request.args.get('qr', '')
    request_id = request.args.get('request_id', '')
    # Новые параметры для создания заявки
    user_id = request.args.get('user_id', '')
    casino_id = request.args.get('casino_id', '')
    account_id = request.args.get('account_id', '')
    username = request.args.get('username', '')
    first_name = request.args.get('first_name', '')
    last_name = request.args.get('last_name', '')
    
    # Получаем время создания из URL параметров (если передано из бота)
    created_at_timestamp = request.args.get('created_at')
    if created_at_timestamp:
        try:
            created_at_timestamp = int(created_at_timestamp)
        except:
            created_at_timestamp = None
    
    # Если не передано время создания, создаем новое время
    if not created_at_timestamp:
        created_at = datetime.now()
        created_at_timestamp = int(created_at.timestamp() * 1000)
    
    # Вычисляем время окончания (5 минут от времени создания)
    created_at_dt = datetime.fromtimestamp(created_at_timestamp / 1000)
    expires_at = created_at_dt + timedelta(minutes=5)
    expires_timestamp = int(expires_at.timestamp() * 1000)
    
    # Генерируем уникальный идентификатор для отслеживания
    unique_id = hashlib.md5(f"{user_id}_{request_id}_{created_at_timestamp}".encode()).hexdigest()[:8].upper()
    
    return render_template('pay.html', 
                         amount=amount,
                         qr_hash=qr_hash,
                         request_id=request_id,
                         user_id=user_id,
                         casino_id=casino_id,
                         account_id=account_id,
                         username=username,
                         first_name=first_name,
                         last_name=last_name,
                         banks=BANKS,
                         created_at_timestamp=created_at_timestamp,
                         expires_timestamp=expires_timestamp,
                         unique_id=unique_id)

@app.route('/api/generate-qr', methods=['POST'])
def generate_qr():
    try:
        data = request.json
        amount = float(data.get('amount', 0))
        bank = data.get('bank', 'omoney')  # По умолчанию O!Money
        
        # Асинхронный вызов
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        qr_data = loop.run_until_complete(generate_qr_async(amount, bank))
        loop.close()
        
        if qr_data.get('success'):
            qr_hash = qr_data.get('qr_hash')
            # Получаем unique_id из параметров запроса
            unique_id = request.json.get('unique_id')
            # Получаем primary_url для кодирования в QR (если есть, иначе используем qr_hash)
            primary_url = qr_data.get('primary_url')
            # Для Optima Bank используем deep link, для остальных - qr_hash
            qr_data_to_encode = primary_url if bank.lower() == 'optima' and primary_url else qr_hash
            qr_image = generate_qr_image(qr_data_to_encode, unique_id)
            
            return jsonify({
                'success': True,
                'qr_hash': qr_hash,
                'qr_image': qr_image,
                'all_bank_urls': qr_data.get('all_bank_urls', {}),
                'bank_urls': qr_data.get('all_bank_urls', {})  # Для совместимости
            })
        else:
            return jsonify({
                'success': False,
                'error': qr_data.get('error', 'Failed to generate QR')
            }), 400
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 3003))
    debug = os.getenv('FLASK_ENV') != 'production'
    app.run(host='0.0.0.0', port=port, debug=debug)

