// Простой скрипт для создания иконок PWA
// Запуск: node scripts/generate-icons.js

const fs = require('fs');
const path = require('path');

// SVG иконка
const svgIcon = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="64" fill="#0ea5e9"/>
  <path d="M256 128L384 256L256 384L128 256L256 128Z" fill="white" opacity="0.9"/>
  <circle cx="256" cy="256" r="80" fill="white" opacity="0.3"/>
  <path d="M200 200L312 312M312 200L200 312" stroke="white" stroke-width="24" stroke-linecap="round"/>
</svg>`;

// Сохраняем SVG
const publicDir = path.join(__dirname, '..', 'public');
fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgIcon);

// Для PNG иконок нужно использовать библиотеку типа sharp или canvas
// Пока создадим простые placeholder файлы
console.log('SVG иконка создана!');
console.log('Для создания PNG иконок установите sharp: npm install sharp');
console.log('Или используйте онлайн конвертер для конвертации icon.svg в PNG форматы 192x192 и 512x512');

