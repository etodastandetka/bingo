# Bingo Admin Panel (Next.js)

Админ-панель для управления ботом Bingo, построенная на Next.js с PostgreSQL.

## Особенности

- 🔐 Аутентификация с JWT
- 📊 Дашборд со статистикой
- 📝 Управление заявками (пополнения/выводы)
- 👥 Управление пользователями
- 💳 Управление реквизитами
- 📈 Статистика и аналитика
- 🎨 Современный UI с Tailwind CSS

## Технологии

- **Next.js 14** (App Router)
- **TypeScript**
- **Prisma** (ORM для PostgreSQL)
- **Tailwind CSS**
- **JWT** для аутентификации

## Установка

1. Установите зависимости:

```bash
npm install
```

2. Настройте переменные окружения:

Скопируйте `.env.example` в `.env` и заполните:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/bingo_admin?schema=public"
JWT_SECRET="your-secret-key-change-in-production"
NODE_ENV="development"
```

3. Настройте базу данных:

```bash
# Генерируем Prisma Client
npm run db:generate

# Применяем схему к базе данных
npm run db:push

# Или создаем миграции
npm run db:migrate
```

4. Создайте первого администратора:

```bash
# Создание администратора с переменными окружения
ADMIN_USERNAME=admin ADMIN_PASSWORD=admin123 ADMIN_EMAIL=admin@bingo.com npm run create-admin

# Или отредактируйте .env файл и запустите:
npm run create-admin
```

По умолчанию создается пользователь:
- Username: `admin`
- Password: `admin123`
- Email: `admin@bingo.com`

⚠️ **ВАЖНО**: Смените пароль после первого входа!

5. Запустите сервер разработки:

```bash
npm run dev
```

Откройте [http://localhost:3001](http://localhost:3001) в браузере.

## Структура базы данных

База данных содержит следующие основные таблицы:

- `admin_users` - Администраторы системы
- `users` - Пользователи бота
- `requests` - Заявки на пополнение/вывод
- `transactions` - Транзакции пользователей
- `requisites` - Реквизиты для пополнений
- `referrals` - Реферальные связи
- `referral_earnings` - Реферальные заработки
- `chat_messages` - Сообщения чата
- `incoming_payments` - Входящие платежи
- И другие...

## API Routes

### Аутентификация
- `POST /api/auth/login` - Вход
- `POST /api/auth/logout` - Выход
- `GET /api/auth/me` - Текущий пользователь

### Заявки
- `GET /api/requests` - Список заявок
- `POST /api/requests` - Создать заявку
- `GET /api/requests/[id]` - Детали заявки
- `PATCH /api/requests/[id]` - Обновить заявку

### Пользователи
- `GET /api/users` - Список пользователей
- `GET /api/users/[userId]` - Детали пользователя

### Реквизиты
- `GET /api/requisites` - Список реквизитов
- `POST /api/requisites` - Создать реквизит
- `PATCH /api/requisites/[id]` - Обновить реквизит
- `DELETE /api/requisites/[id]` - Удалить реквизит

### Статистика
- `GET /api/statistics` - Статистика системы

## Развертывание

1. Соберите проект:

```bash
npm run build
```

2. Запустите production сервер:

```bash
npm start
```

## Лицензия

Private - для внутреннего использования

