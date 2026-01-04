/**
 * Утилиты для работы с датами и временем в бишкекском часовом поясе (UTC+6, Asia/Bishkek)
 */

/**
 * Форматирует дату и время в бишкекском часовом поясе
 * Формат: DD.MM.YYYY • HH:MM
 * @param value - Дата в формате Date, строке ISO или null
 * @returns Отформатированная строка с датой и временем в бишкекском времени
 */
export function formatDateTimeBishkek(value?: string | Date | null): string {
  if (!value) return '—'
  
  const d = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(d.getTime())) return '—'
  
  try {
    // Преобразуем в бишкекское время (UTC+6, Asia/Bishkek)
    const bishkekTime = new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Asia/Bishkek',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d)
    
    // Извлекаем части даты и времени
    const day = bishkekTime.find(part => part.type === 'day')?.value || '00'
    const month = bishkekTime.find(part => part.type === 'month')?.value || '00'
    const year = bishkekTime.find(part => part.type === 'year')?.value || '0000'
    const hours = bishkekTime.find(part => part.type === 'hour')?.value || '00'
    const minutes = bishkekTime.find(part => part.type === 'minute')?.value || '00'
    
    return `${day}.${month}.${year} • ${hours}:${minutes}`
  } catch (error) {
    // Fallback на локальное время, если произошла ошибка
    console.error('Error formatting date with Bishkek timezone:', error)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    return `${day}.${month}.${year} • ${hours}:${minutes}`
  }
}

