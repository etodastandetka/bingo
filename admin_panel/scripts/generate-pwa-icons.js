// Скрипт для создания PNG иконок для PWA
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

function createIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Фон с закругленными углами
  const radius = size * 0.125;
  ctx.fillStyle = '#0ea5e9';
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(size - radius, 0);
  ctx.quadraticCurveTo(size, 0, size, radius);
  ctx.lineTo(size, size - radius);
  ctx.quadraticCurveTo(size, size, size - radius, size);
  ctx.lineTo(radius, size);
  ctx.quadraticCurveTo(0, size, 0, size - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fill();
  
  const center = size / 2;
  
  // Основной элемент (ромб)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  const sizeInner = size * 0.5;
  ctx.beginPath();
  ctx.moveTo(center, center - sizeInner/2);
  ctx.lineTo(center + sizeInner/2, center);
  ctx.lineTo(center, center + sizeInner/2);
  ctx.lineTo(center - sizeInner/2, center);
  ctx.closePath();
  ctx.fill();
  
  // Круг
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.beginPath();
  ctx.arc(center, center, size * 0.156, 0, Math.PI * 2);
  ctx.fill();
  
  // Крест
  ctx.strokeStyle = 'white';
  ctx.lineWidth = size * 0.047;
  ctx.lineCap = 'round';
  const crossSize = size * 0.22;
  ctx.beginPath();
  ctx.moveTo(center - crossSize/2, center - crossSize/2);
  ctx.lineTo(center + crossSize/2, center + crossSize/2);
  ctx.moveTo(center + crossSize/2, center - crossSize/2);
  ctx.lineTo(center - crossSize/2, center + crossSize/2);
  ctx.stroke();
  
  return canvas;
}

const publicDir = path.join(__dirname, '..', 'public');

// Создаем иконку 192x192
const icon192 = createIcon(192);
const buffer192 = icon192.toBuffer('image/png');
fs.writeFileSync(path.join(publicDir, 'icon-192.png'), buffer192);
console.log('✓ Создана иконка icon-192.png');

// Создаем иконку 512x512
const icon512 = createIcon(512);
const buffer512 = icon512.toBuffer('image/png');
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), buffer512);
console.log('✓ Создана иконка icon-512.png');

console.log('✓ Все иконки созданы успешно!');

