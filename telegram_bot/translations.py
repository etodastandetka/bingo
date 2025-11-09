# Переводы для бота

TRANSLATIONS = {
    'ru': {
        'start': {
            'greeting': 'Привет, {name}',
            'auto_deposit': '⚡️ Авто-пополнение: 0%',
            'auto_withdraw': '⚡️ Авто-вывод: 0%',
            'working': '🕐 Работаем: 24/7',
            'channel': '🗞 Наш канал: {channel}',
            'support': '👨‍💻Служба поддержки: {support}',
        },
        'menu': {
            'deposit': '💰 Пополнить',
            'withdraw': '💸 Вывести',
            'instruction': '📖 Инструкция',
            'language': '🌐 Язык',
        },
        'deposit': {
            'select_casino': 'Выберите казино:',
            'enter_account_id': 'ID\nОтправьте ID вашего счета {casino}',
            'enter_amount': 'Введите сумму пополнения:\nMin: {min} Max: {max}',
            'invalid_account_id': '❌ Пожалуйста, отправьте корректный ID счета (только цифры)',
            'invalid_amount': '❌ Сумма должна быть от {min} до {max}',
            'request_created': '✅ Заявка создана!\n\n💰 Сумма: {amount:.2f} KGS\n🎰 Казино: {casino}\n🆔 ID: {account_id}\n\nНажмите кнопку ниже для оплаты:',
            'error': '❌ Произошла ошибка. Попробуйте позже.',
            'cancel': '❌ Операция отменена',
            'no_casinos_available': '❌ Нет доступных казино',
            'deposit_success': '✅ Пополнение успешно!\n\n💰 Сумма: {amount:.2f} KGS\n🎰 Казино: {casino}\n🆔 ID: {account_id}',
        },
        'withdraw': {
            'select_casino': 'Выберите казино:',
            'select_bank': 'Казино: {casino}\n\nВыберите банк:',
            'enter_phone': 'Казино: {casino}\nБанк: {bank}\n\nВведите номер телефона (+996):',
            'invalid_phone': '❌ Номер должен начинаться с +996',
            'invalid_phone_format': '❌ Некорректный формат номера телефона',
            'send_qr_photo': 'Отправьте фото QR кода от банка:',
            'invalid_photo': '❌ Пожалуйста, отправьте фото QR кода',
            'enter_account_id': 'Введите ID вашего счета в казино:',
            'enter_code': 'Введите код с сайта казино:',
            'request_created': '✅ Заявка на вывод создана!\n\n🎰 Казино: {casino}\n🏦 Банк: {bank}\n📱 Телефон: {phone}\n🆔 ID: {account_id}\n\nВаша заявка будет обработана в ближайшее время.',
            'error': '❌ Произошла ошибка при создании заявки. Попробуйте позже.',
            'cancel': '❌ Операция отменена',
            'no_casinos_available': '❌ Нет доступных казино',
        },
        'language': {
            'select': 'Выберите язык:',
            'changed': '✅ Язык изменен на русский',
        },
        'instruction': {
            'text': '''📖 Инструкция по использованию бота

💰 ПОПОЛНЕНИЕ:
1. Нажмите "Пополнить"
2. Выберите казино
3. Введите ID вашего счета
4. Введите сумму пополнения
5. Перейдите по ссылке и оплатите

💸 ВЫВОД:
1. Нажмите "Вывести"
2. Выберите казино
3. Выберите банк
4. Введите номер телефона (+996)
5. Отправьте фото QR кода от банка
6. Введите ID счета в казино
7. Введите код с сайта казино

Ваша заявка будет обработана в ближайшее время!''',
        },
    },
    'ky': {
        'start': {
            'greeting': 'Салам, {name}',
            'auto_deposit': '⚡️ Авто-толтуруу: 0%',
            'auto_withdraw': '⚡️ Авто-чыгаруу: 0%',
            'working': '🕐 Иштеп жатабыз: 24/7',
            'channel': '🗞 Биздин канал: {channel}',
            'support': '👨‍💻Колдоо кызматы: {support}',
        },
        'menu': {
            'deposit': '💰 Толтуруу',
            'withdraw': '💸 Чыгаруу',
            'instruction': '📖 Көрсөтмө',
            'language': '🌐 Тил',
        },
        'deposit': {
            'select_casino': 'Казинону тандаңыз:',
            'enter_account_id': 'ID\nКазинодогу эсебиңиздин ID-син жөнөтүңүз {casino}',
            'enter_amount': 'Толтуруу суммасын киргизиңиз:\nМинимум: {min} Максимум: {max}',
            'invalid_account_id': '❌ Туура ID эсепти жөнөтүңүз (сандар гана)',
            'invalid_amount': '❌ Сумма {min} ден {max} ге чейин болушу керек',
            'request_created': '✅ Өтүнүч түзүлдү!\n\n💰 Сумма: {amount:.2f} KGS\n🎰 Казино: {casino}\n🆔 ID: {account_id}\n\nТөлөө үчүн төмөнкү баскычты басыңыз:',
            'error': '❌ Ката кетти. Кийин кайра аракет кылыңыз.',
            'cancel': '❌ Аракет жокко чыгарылды',
            'no_casinos_available': '❌ Жеткиликтүү казино жок',
            'deposit_success': '✅ Толтуруу ийгиликтүү!\n\n💰 Сумма: {amount:.2f} KGS\n🎰 Казино: {casino}\n🆔 ID: {account_id}',
        },
        'withdraw': {
            'select_casino': 'Казинону тандаңыз:',
            'select_bank': 'Казино: {casino}\n\nБанкты тандаңыз:',
            'enter_phone': 'Казино: {casino}\nБанк: {bank}\n\nТелефон номурун киргизиңиз (+996):',
            'invalid_phone': '❌ Номер +996 менен башталышы керек',
            'invalid_phone_format': '❌ Телефон номурунун туура эмес форматы',
            'send_qr_photo': 'Банктан QR коддун сүрөтүн жөнөтүңүз:',
            'invalid_photo': '❌ QR коддун сүрөтүн жөнөтүңүз',
            'enter_account_id': 'Казинодогу эсебиңиздин ID-син киргизиңиз:',
            'enter_code': 'Казинодогу сайттан кодду киргизиңиз:',
            'request_created': '✅ Чыгаруу өтүнүчү түзүлдү!\n\n🎰 Казино: {casino}\n🏦 Банк: {bank}\n📱 Телефон: {phone}\n🆔 ID: {account_id}\n\nСиздин өтүнүчүңүз жакынкы убакта иштетилет.',
            'error': '❌ Өтүнүч түзүүдө ката кетти. Кийин кайра аракет кылыңыз.',
            'cancel': '❌ Аракет жокко чыгарылды',
            'no_casinos_available': '❌ Жеткиликтүү казино жок',
        },
        'language': {
            'select': 'Тилди тандаңыз:',
            'changed': '✅ Тил кыргызчага өзгөртүлдү',
        },
        'instruction': {
            'text': '''📖 Ботту колдонуу боюнча көрсөтмө

💰 ТОЛТУРУУ:
1. "Толтуруу" баскычын басыңыз
2. Казинону тандаңыз
3. Эсебиңиздин ID-син киргизиңиз
4. Толтуруу суммасын киргизиңиз
5. Шилтемени басып, төлөңүз

💸 ЧЫГАРУУ:
1. "Чыгаруу" баскычын басыңыз
2. Казинону тандаңыз
3. Банкты тандаңыз
4. Телефон номурун киргизиңиз (+996)
5. Банктан QR коддун сүрөтүн жөнөтүңүз
6. Казинодогу эсебиңиздин ID-син киргизиңиз
7. Казинодогу сайттан кодду киргизиңиз

Сиздин өтүнүчүңүз жакынкы убакта иштетилет!''',
        },
    }
}

def get_text(lang: str, category: str, key: str, default: str = None, **kwargs) -> str:
    """Получить переведенный текст"""
    if lang not in TRANSLATIONS:
        lang = 'ru'
    
    try:
        text = TRANSLATIONS[lang][category][key]
        return text.format(**kwargs) if kwargs else text
    except (KeyError, IndexError):
        # Если перевод не найден, пробуем русский
        try:
            text = TRANSLATIONS['ru'][category][key]
            return text.format(**kwargs) if kwargs else text
        except (KeyError, IndexError):
            # Если default указан, используем его
            if default:
                return default.format(**kwargs) if kwargs else default
            return f"[{category}.{key}]"




