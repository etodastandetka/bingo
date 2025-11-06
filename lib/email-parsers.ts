/**
 * Парсеры для email уведомлений от банков
 * Поддерживаются: Demirbank, Optima, MBank, MegaPay, Bakai
 */

export interface ParsedEmail {
  amount: number
  isoDatetime: string | null
  bank: string
}

const AMOUNT_RE = /на\s+сумму\s+([0-9]+(?:[\.,][0-9]{1,2})?)\s*(KGS|сом|сомов)?/i
const DATETIME_RE = /(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2}:\d{2})/

/**
 * Парсинг email от Demirbank
 * Пример: "Вам поступил перевод с помощью QR-платежа на сумму 100.53 KGS от 22.09.2025 22:13:24."
 */
export function parseDemirbankEmail(text: string): ParsedEmail | null {
  if (!text) return null

  const amountMatch = text.match(AMOUNT_RE)
  if (!amountMatch) return null

  const amountStr = amountMatch[1].replace(',', '.')
  const amount = parseFloat(amountStr)
  if (isNaN(amount)) return null

  const datetimeMatch = text.match(DATETIME_RE)
  let isoDatetime: string | null = null
  if (datetimeMatch) {
    const [, date, time] = datetimeMatch
    const [dd, mm, yyyy] = date.split('.')
    isoDatetime = `${yyyy}-${mm}-${dd}T${time}`
  }

  return {
    amount,
    isoDatetime,
    bank: 'demirbank',
  }
}

/**
 * Универсальный парсер для других банков (Optima, MBank, MegaPay, Bakai)
 */
function parseGenericAmountDateTime(text: string): ParsedEmail | null {
  if (!text) return null

  let amountMatch = text.match(AMOUNT_RE)
  if (!amountMatch) {
    // Fallback: ищем любое число перед (сом|KGS)
    const fallbackMatch = text.match(/([0-9]+(?:[\.,][0-9]{1,2})?)\s*(KGS|сом|сомов)/i)
    if (!fallbackMatch) return null
    amountMatch = fallbackMatch
  }

  const amountStr = amountMatch[1].replace(',', '.')
  const amount = parseFloat(amountStr)
  if (isNaN(amount)) return null

  const datetimeMatch = text.match(DATETIME_RE)
  let isoDatetime: string | null = null
  if (datetimeMatch) {
    const [, date, time] = datetimeMatch
    const [dd, mm, yyyy] = date.split('.')
    isoDatetime = `${yyyy}-${mm}-${dd}T${time}`
  }

  return {
    amount,
    isoDatetime,
    bank: 'unknown',
  }
}

export function parseOptimaEmail(text: string): ParsedEmail | null {
  const result = parseGenericAmountDateTime(text)
  if (result) result.bank = 'optima'
  return result
}

export function parseMbankEmail(text: string): ParsedEmail | null {
  const result = parseGenericAmountDateTime(text)
  if (result) result.bank = 'mbank'
  return result
}

export function parseMegapayEmail(text: string): ParsedEmail | null {
  const result = parseGenericAmountDateTime(text)
  if (result) result.bank = 'megapay'
  return result
}

export function parseBakaiEmail(text: string): ParsedEmail | null {
  const result = parseGenericAmountDateTime(text)
  if (result) result.bank = 'bakai'
  return result
}

/**
 * Автоматический парсинг email по типу банка
 */
export function parseEmailByBank(text: string, bank: string): ParsedEmail | null {
  const normalizedBank = bank.toLowerCase()

  switch (normalizedBank) {
    case 'demirbank':
      return parseDemirbankEmail(text)
    case 'optima':
      return parseOptimaEmail(text)
    case 'mbank':
      return parseMbankEmail(text)
    case 'megapay':
      return parseMegapayEmail(text)
    case 'bakai':
      return parseBakaiEmail(text)
    default:
      // Пробуем все парсеры по очереди
      return (
        parseDemirbankEmail(text) ||
        parseOptimaEmail(text) ||
        parseMbankEmail(text) ||
        parseMegapayEmail(text) ||
        parseBakaiEmail(text)
      )
  }
}


