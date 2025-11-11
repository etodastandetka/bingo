from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
import aiohttp
import asyncio
import qrcode
import io
import base64
import os
import ssl
from datetime import datetime, timedelta

app = Flask(__name__)
CORS(app)

API_BASE_URL = 'https://fqxgmrzplndwsyvkeu.ru/api'

# Отключаем проверку SSL для внутренних запросов
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

# Путь к изображениям банков (из admin панели)
# Если изображения не найдены, можно использовать относительный путь
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES_DIR = os.path.join(BASE_DIR, 'admin_nextjs', 'public', 'images')

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

def generate_qr_image(qr_hash):
    """Генерация изображения QR кода"""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(qr_hash)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
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
    
    # Вычисляем время окончания (5 минут)
    expires_at = datetime.now() + timedelta(minutes=5)
    expires_timestamp = int(expires_at.timestamp() * 1000)
    
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
                         expires_timestamp=expires_timestamp)

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
            qr_image = generate_qr_image(qr_hash)
            
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

