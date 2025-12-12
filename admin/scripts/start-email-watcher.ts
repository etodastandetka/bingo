/**
 * Скрипт запуска Email Watcher для автопополнения
 * Использование: npm run start:email-watcher
 * или: tsx scripts/start-email-watcher.ts
 */

import { startWatcher } from '../lib/email-watcher'

// Устанавливаем API URL для localhost
process.env.API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api'
process.env.NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

console.log('🚀 Starting Email Watcher...')
console.log(`📡 API Base URL: ${process.env.API_BASE_URL}`)
console.log(`🌐 Public API URL: ${process.env.NEXT_PUBLIC_API_URL}`)

startWatcher().catch((error) => {
  console.error('❌ Fatal error in email watcher:', error)
  process.exit(1)
})

