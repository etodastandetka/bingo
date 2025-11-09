#!/usr/bin/env tsx
/**
 * Скрипт для запуска Email Watcher
 * Использование: npm run watcher или tsx scripts/start-watcher.ts
 */

import { startWatcher } from '../lib/email-watcher'

// Обработка сигналов для корректного завершения
process.on('SIGINT', () => {
  console.log('\n👋 Stopping watcher...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n👋 Stopping watcher...')
  process.exit(0)
})

// Запускаем watcher
startWatcher().catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})


