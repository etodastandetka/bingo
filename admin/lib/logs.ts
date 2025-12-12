// Простое хранилище логов в памяти (в продакшене лучше использовать Redis или БД)
let logs: Array<{
  id: number
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
  data?: any
}> = []

let logIdCounter = 1
const MAX_LOGS = 1000 // Максимальное количество логов

// Функция для добавления лога (можно вызывать из других API)
export function addLog(level: 'info' | 'warn' | 'error' | 'success', message: string, data?: any) {
  const log = {
    id: logIdCounter++,
    timestamp: new Date().toISOString(),
    level,
    message,
    data
  }
  
  logs.push(log)
  
  // Ограничиваем количество логов
  if (logs.length > MAX_LOGS) {
    logs = logs.slice(-MAX_LOGS)
  }
  
  // Также выводим в консоль сервера
  const consoleMethod = level === 'error' ? console.error 
    : level === 'warn' ? console.warn 
    : level === 'success' ? console.log 
    : console.log
    
  consoleMethod(`[${level.toUpperCase()}] ${message}`, data || '')
}

// Функция для получения логов
export function getLogs(limit: number = 100, level?: string) {
  let filteredLogs = [...logs].reverse() // Новые сначала
  
  if (level && level !== 'all') {
    filteredLogs = filteredLogs.filter(log => log.level === level)
  }
  
  return filteredLogs.slice(0, limit)
}

// Функция для очистки логов
export function clearLogs() {
  logs = []
  logIdCounter = 1
}











