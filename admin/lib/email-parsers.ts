/**
 * Парсеры для извлечения данных о платежах из email уведомлений банков
 * Поддерживает русский и кыргызский языки
 */

interface PaymentData {
  amount: number
  isoDatetime: string | null
  bank: string
}

/**
 * Парсинг email от DemirBank
 * Поддерживает форматы:
 * - Русский: "Вы получили 1 000.00 KGS" или "Пополнение на сумму 1,000.00 сом"
 * - Кыргызский: "100.36 KGS суммасында" или "07.12.2025 10:14:42 100.36 KGS суммасында"
 */
function parseDemirBankEmail(text: string): PaymentData | null {
  // Поддерживаем разные форматы сумм:
  // - "170.03 KGS" (точка как десятичный разделитель)
  // - "7,363.00 KGS" (запятая как разделитель тысяч, точка как десятичный разделитель)
  // - "1 000.00" (с пробелами)
  // - "1000.00" (без разделителей)
  // - "100.36 KGS суммасында" (кыргызский формат)
  // - "на сумму 170.03 KGS" (сумма в середине предложения)
  // - "на сумму 7,363.00 KGS" (с разделителем тысяч)
  // ВАЖНО: Паттерны в порядке приоритета - более специфичные сначала
  // Это гарантирует, что мы найдем правильную сумму, а не случайные числа из HTML
  // ПРОБЛЕМА: паттерны могут захватывать секунды из времени (например, "58" из "10:48:58")
  // РЕШЕНИЕ: используем только специфичные паттерны, которые явно указывают на сумму
  // И убираем паттерны с пробелами, которые могут захватывать секунды
  const amountPatterns = [
    // Кыргызский формат (высший приоритет): "100.80 KGS суммасында" - самый специфичный
    // БЕЗ пробелов в числе, чтобы не захватить секунды: только "100.80", не "31 100.80"
    /([0-9]{1,6}(?:\.[0-9]{1,2})?)\s*KGS\s*суммасында/i,
    // Формат: "на сумму 170.03 KGS" или "на сумму 7,363.00 KGS"
    // Этот паттерн безопасен, т.к. требует "на сумму" перед числом
    // БЕЗ пробелов в числе, чтобы не захватить секунды
    /на\s+сумму\s+([0-9]{1,3}(?:,\s*[0-9]{3})*(?:\.[0-9]{1,2})?)\s*(?:KGS|сом|сомов)/i,
    /на\s+сумму\s+([0-9]{1,6}(?:\.[0-9]{1,2})?)\s*(?:KGS|сом|сомов)/i,
    // Формат с датой перед суммой: "07.12.2025 10:40:52 100.80 KGS"
    // Явно указываем полный формат даты и времени, БЕЗ пробелов в сумме
    /\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}:\d{2}\s+([0-9]{1,6}(?:\.[0-9]{1,2})?)\s*(?:KGS|сом|сомов)/i,
    // Стандартные форматы с запятой как разделителем тысяч: "7,363.00 KGS"
    // Безопасен, т.к. запятая в числе не встречается во времени
    /([0-9]{1,3}(?:,\s*[0-9]{3})*(?:\.[0-9]{1,2})?)\s*(?:KGS|сом|сомов)/i,
    // Простой формат БЕЗ пробелов: "100.80 KGS" (не "1 000.80", т.к. пробелы могут быть из времени)
    // Ограничиваем до 6 цифр перед точкой, чтобы не захватить большие числа
    /([0-9]{1,6}(?:\.[0-9]{1,2})?)\s*(?:KGS|сом|сомов)/i,
    // Европейский формат с запятой как десятичным разделителем: "100,36 KGS"
    // Безопасен, т.к. запятая не встречается во времени
    /([0-9]{1,6}(?:,[0-9]{1,2})?)\s*(?:KGS|сом|сомов)/i,
    // Поиск по слову "сумма" - безопасен, т.к. требует ключевое слово
    // БЕЗ пробелов в числе, чтобы не захватить секунды
    /сумма[:\s]+([0-9]{1,3}(?:,\s*[0-9]{3})*(?:\.[0-9]{1,2})?)/i,
    /сумма[:\s]+([0-9]{1,6}(?:\.[0-9]{1,2})?)/i,
  ]

  let amount: number | null = null

  for (const pattern of amountPatterns) {
    const match = text.match(pattern)
    if (match) {
      let amountStr = match[1]
      
      // ВАЖНО: Сначала определяем, что у нас есть - точка или запятая как десятичный разделитель
      // Если есть и точка, и запятая - запятая это разделитель тысяч, точка - десятичный
      // Если только запятая и после неё 1-2 цифры - это десятичный разделитель
      // Если только точка - это десятичный разделитель
      
      const hasDot = amountStr.includes('.')
      const hasComma = amountStr.includes(',')
      
      if (hasDot && hasComma) {
        // Есть и точка, и запятая: "1,000.79" или "1 000,79"
        // Определяем по позиции: что ближе к концу - то десятичный разделитель
        const lastDot = amountStr.lastIndexOf('.')
        const lastComma = amountStr.lastIndexOf(',')
        
        if (lastDot > lastComma) {
          // Точка ближе к концу - это десятичный разделитель: "1,000.79"
          amountStr = amountStr.replace(/\s+/g, '').replace(/,/g, '') // Убираем пробелы и запятые
        } else {
          // Запятая ближе к концу - это десятичный разделитель: "1 000,79"
          amountStr = amountStr.replace(/\s+/g, '').replace(/\./g, '').replace(',', '.') // Убираем пробелы и точки, запятую заменяем на точку
        }
      } else if (hasComma && !hasDot) {
        // Только запятая
        const parts = amountStr.split(',')
        // Проверяем: если после запятой 1-2 цифры И перед запятой не больше 6 цифр - это десятичный разделитель
        if (parts.length === 2 && parts[1].length <= 2 && parts[0].replace(/\s+/g, '').length <= 6) {
          // Десятичный разделитель (европейский формат): "100,79" -> "100.79"
          amountStr = parts[0].replace(/\s+/g, '') + '.' + parts[1]
        } else {
          // Разделитель тысяч: "1,000" -> "1000"
          amountStr = amountStr.replace(/\s+/g, '').replace(/,/g, '')
        }
      } else if (hasDot && !hasComma) {
        // Только точка - это десятичный разделитель: "100.79" или "1 000.79"
        // Убираем пробелы (разделители тысяч), точку оставляем
        amountStr = amountStr.replace(/\s+/g, '')
      } else {
        // Нет ни точки, ни запятой - просто число: "100" или "1 000"
        amountStr = amountStr.replace(/\s+/g, '')
      }
      
      // ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА: если сумма больше 10000, возможно это ошибка парсинга
      // Обычно платежи не превышают 10000 KGS, но могут быть и больше
      // Поэтому проверяем только очень большие суммы (больше 100000)
      
      amount = parseFloat(amountStr)
      
      // ВАЖНО: Проверяем, что сумма разумная (не больше 100000)
      // Это защита от неправильного парсинга (обычно платежи не превышают 100000 KGS)
      if (!isNaN(amount) && amount > 0 && amount <= 100000) {
        console.log(`✅ Parsed amount: ${amount} from original: "${match[1]}" -> "${amountStr}" (pattern: ${pattern})`)
        break
      } else if (amount > 100000) {
        console.log(`⚠️ Parsed amount too large (${amount}), likely parsing error. Skipping pattern: ${pattern}`)
        // Продолжаем поиск с другим паттерном
        continue
      }
    }
  }

  if (!amount || isNaN(amount) || amount <= 0) {
    console.log(`⚠️ Could not parse amount from text. Preview: ${text.substring(0, 200)}`)
    return null
  }

  // Парсим дату из email
  // Паттерны для даты: 
  // - "2024-12-07 10:30:00" 
  // - "07.12.2024 10:30"
  // - "07.12.2025 10:14:42" (кыргызский формат с секундами)
  // - "от 07.12.2025 00:23:27" (с предлогом "от")
  // - "05.12.2025 00:47:56" (в конце предложения)
  const datePatterns = [
    /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/, // "2024-12-07 10:30:00"
    /(?:от\s+)?(\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}:\d{2})/, // "от 07.12.2025 00:23:27" или "07.12.2025 10:14:42"
    /(\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2})/, // "07.12.2024 10:30"
    /(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2})/, // "07/12/2024 10:30"
  ]

  let isoDatetime: string | null = null

  for (const pattern of datePatterns) {
    const match = text.match(pattern)
    if (match) {
      try {
        const dateStr = match[1]
        let date: Date

        if (dateStr.includes('-')) {
          // Формат: "2024-12-07 10:30:00"
          // Время в письме в часовом поясе Кыргызстана (UTC+6)
          // Сохраняем как UTC, вычитая 6 часов из времени
          const tempDate = new Date(dateStr.replace(' ', 'T') + '+06:00')
          // Конвертируем в UTC для хранения в БД
          date = tempDate
        } else if (dateStr.includes('.')) {
          // Формат: "07.12.2025 10:14:42" или "07.12.2024 10:30"
          // Время в письме в часовом поясе Кыргызстана (UTC+6)
          const [datePart, timePart] = dateStr.split(' ')
          const [day, month, year] = datePart.split('.')
          // Если время с секундами: "10:14:42", иначе добавляем ":00"
          const timeWithSeconds = timePart.includes(':') && timePart.split(':').length === 3 
            ? timePart 
            : timePart + ':00'
          // Создаем дату с явным указанием часового пояса UTC+6
          date = new Date(`${year}-${month}-${day}T${timeWithSeconds}+06:00`)
        } else if (dateStr.includes('/')) {
          // Формат: "07/12/2024 10:30"
          // Время в письме в часовом поясе Кыргызстана (UTC+6)
          const [datePart, timePart] = dateStr.split(' ')
          const [day, month, year] = datePart.split('/')
          date = new Date(`${year}-${month}-${day}T${timePart}:00+06:00`)
        } else {
          continue
        }

        if (!isNaN(date.getTime())) {
          isoDatetime = date.toISOString()
          console.log(`✅ Parsed date: ${isoDatetime} from: ${dateStr} (original timezone: UTC+6)`)
          break
        }
      } catch (e) {
        console.warn(`⚠️ Error parsing date: ${e}`)
        // Игнорируем ошибки парсинга даты
      }
    }
  }

  return {
    amount,
    isoDatetime,
    bank: 'DEMIRBANK',
  }
}

/**
 * Парсинг email от других банков (можно расширить)
 */
function parseOtherBankEmail(text: string, bank: string): PaymentData | null {
  // Универсальный парсер для других банков
  // Ищем сумму в формате "XXX.XX KGS" или "XXX,XXX.XX сом"
  
  const amountPatterns = [
    /([0-9]{1,3}(?:\s+[0-9]{3})*(?:\.[0-9]{1,2})?)\s*(?:KGS|сом|сомов)/i,
    /([0-9]{1,3}(?:,\s*[0-9]{3})*(?:\.[0-9]{1,2})?)\s*(?:KGS|сом|сомов)/i,
    /([0-9]+(?:\.[0-9]{1,2})?)\s*(?:KGS|сом|сомов)/i,
  ]

  let amount: number | null = null

  for (const pattern of amountPatterns) {
    const match = text.match(pattern)
    if (match) {
      const amountStr = match[1].replace(/\s+/g, '').replace(/,/g, '')
      amount = parseFloat(amountStr)
      if (!isNaN(amount) && amount > 0) {
        break
      }
    }
  }

  if (!amount || isNaN(amount) || amount <= 0) {
    return null
  }

  return {
    amount,
    isoDatetime: null, // Дата будет взята из даты письма
    bank: bank.toUpperCase(),
  }
}

/**
 * Главная функция парсинга email по банку
 */
export function parseEmailByBank(text: string, bank: string): PaymentData | null {
  const normalizedBank = bank.toUpperCase()

  if (normalizedBank.includes('DEMIR') || normalizedBank === 'DEMIRBANK') {
    return parseDemirBankEmail(text)
  }

  // Для других банков используем универсальный парсер
  return parseOtherBankEmail(text, bank)
}

