# Rebel Bingo KOTK Banner

Ретро-стилизованный баннер с эффектом глитча и CRT для брендинга.

## Где размещен

Баннер уже добавлен на:
1. **Главная страница** (`/`) - вверху страницы
2. **Страница меню** (`/menu`) - вверху страницы

## Где еще можно разместить

### Вариант 1: На всех страницах (Layout)
Добавить в `src/app/layout.tsx`:

```tsx
import { RebelBanner } from '@/components/RebelBanner';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <div className="min-h-screen">
          <RebelBanner className="mx-auto max-w-md px-4 pt-4" />
          {children}
        </div>
      </body>
    </html>
  );
}
```

### Вариант 2: На странице истории
В `src/app/history/page.tsx`:

```tsx
import { RebelBanner } from '@/components/RebelBanner';

// В начале main:
<RebelBanner className="mb-4" />
```

### Вариант 3: На странице лимитов
В `src/app/limits/page.tsx`:

```tsx
import { RebelBanner } from '@/components/RebelBanner';

// В начале main:
<RebelBanner className="mb-4" />
```

### Вариант 4: В шапке как логотип
Можно использовать как логотип в header:

```tsx
<header>
  <RebelBanner className="h-20" />
</header>
```

## Использование компонента

```tsx
import { RebelBanner } from '@/components/RebelBanner';

// Простое использование
<RebelBanner />

// С дополнительными классами
<RebelBanner className="mb-4 mx-auto max-w-md" />
```

## Эффекты

- **Glitch эффект** - искажение текста с RGB смещением
- **CRT Scanlines** - горизонтальные линии как на старых мониторах
- **Хроматическая аберрация** - цветовые искажения по краям
- **Анимации** - плавные движения для создания эффекта "живого" экрана

## Кастомизация

Можно изменить:
- Размер текста (текущий: `text-4xl md:text-5xl`)
- Цвета глитча (текущие: `#ff00ff` и `#00ffff`)
- Скорость анимаций (в `globals.css`)
- Прозрачность эффектов

