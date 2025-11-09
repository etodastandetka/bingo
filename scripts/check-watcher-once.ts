#!/usr/bin/env tsx
/**
 * Скрипт для одноразовой проверки email (для тестирования)
 * Использование: npm run watcher:check или tsx scripts/check-watcher-once.ts
 */

import { checkEmailsOnce } from '../lib/email-watcher'

checkEmailsOnce()
  .then(() => {
    console.log('✅ Check completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })

