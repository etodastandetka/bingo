'use client'

import { useEffect } from 'react'

export default function ChunkErrorHandler() {
  useEffect(() => {
    const MAX_RELOAD_ATTEMPTS = 3
    const RELOAD_COOLDOWN = 5000 // 5 секунд между попытками
    const STORAGE_KEY = 'chunk_error_reload_count'
    const STORAGE_TIMESTAMP_KEY = 'chunk_error_reload_timestamp'
    
    const getReloadCount = (): number => {
      try {
        const count = sessionStorage.getItem(STORAGE_KEY)
        return count ? parseInt(count, 10) : 0
      } catch {
        return 0
      }
    }

    const getLastReloadTime = (): number => {
      try {
        const timestamp = sessionStorage.getItem(STORAGE_TIMESTAMP_KEY)
        return timestamp ? parseInt(timestamp, 10) : 0
      } catch {
        return 0
      }
    }

    const incrementReloadCount = (): void => {
      try {
        const count = getReloadCount() + 1
        sessionStorage.setItem(STORAGE_KEY, count.toString())
        sessionStorage.setItem(STORAGE_TIMESTAMP_KEY, Date.now().toString())
      } catch {
        // Игнорируем ошибки sessionStorage
      }
    }

    const clearReloadCount = (): void => {
      try {
        sessionStorage.removeItem(STORAGE_KEY)
        sessionStorage.removeItem(STORAGE_TIMESTAMP_KEY)
      } catch {
        // Игнорируем ошибки sessionStorage
      }
    }

    // Очищаем счетчик при успешной загрузке страницы (через 2 секунды)
    setTimeout(() => {
      clearReloadCount()
    }, 2000)

    let reloadAttempted = false

    const reloadPage = () => {
      if (reloadAttempted) return
      
      const reloadCount = getReloadCount()
      const lastReloadTime = getLastReloadTime()
      const timeSinceLastReload = Date.now() - lastReloadTime

      // Проверяем, не превышен ли лимит попыток
      if (reloadCount >= MAX_RELOAD_ATTEMPTS) {
        console.error('[ChunkErrorHandler] Max reload attempts reached. Please refresh the page manually or contact support.')
        // Показываем сообщение пользователю
        if (document.body) {
          const errorDiv = document.createElement('div')
          errorDiv.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; background: #ef4444; color: white; padding: 16px; text-align: center; z-index: 99999; font-family: sans-serif;'
          errorDiv.innerHTML = '⚠️ Ошибка загрузки страницы. Пожалуйста, обновите страницу вручную (Ctrl+F5 или Cmd+Shift+R)'
          document.body.appendChild(errorDiv)
        }
        return
      }

      // Cooldown применяется только для последующих попыток (не для первой)
      if (reloadCount > 0 && timeSinceLastReload < RELOAD_COOLDOWN) {
        console.warn(`[ChunkErrorHandler] Reload cooldown active. Waiting ${Math.ceil((RELOAD_COOLDOWN - timeSinceLastReload) / 1000)}s...`)
        // Планируем перезагрузку после cooldown
        setTimeout(() => {
          reloadAttempted = false // Сбрасываем флаг для повторной попытки
          reloadPage()
        }, RELOAD_COOLDOWN - timeSinceLastReload)
        return
      }

      reloadAttempted = true
      incrementReloadCount()
      
      const delay = reloadCount === 0 ? 100 : 500 // Первая попытка быстрее
      console.warn(`[ChunkErrorHandler] Chunk load error detected (attempt ${reloadCount + 1}/${MAX_RELOAD_ATTEMPTS}), reloading page in ${delay}ms...`)
      
      setTimeout(() => {
        // Очищаем кеш перед перезагрузкой
        if ('caches' in window) {
          caches.keys().then(names => {
            names.forEach(name => caches.delete(name))
          }).catch(() => {
            // Игнорируем ошибки очистки кеша
          })
        }
        window.location.reload()
      }, delay)
    }

    // Обработка ошибок загрузки чанков Next.js
    const handleError = (event: ErrorEvent) => {
      const errorMessage = event.message || event.error?.message || event.error?.toString() || ''
      const errorSource = event.filename || ''
      
      if (
        errorMessage.includes('Loading chunk') || 
        errorMessage.includes('ChunkLoadError') ||
        errorMessage.includes('Failed to fetch dynamically imported module') ||
        errorMessage.includes('ERR_ABORTED') ||
        errorMessage.includes('404') ||
        errorSource.includes('_next/static/chunks') ||
        (event.target && (event.target as HTMLElement).tagName === 'SCRIPT' && errorSource.includes('chunk'))
      ) {
        console.warn('Chunk load error detected:', errorMessage, errorSource)
        reloadPage()
      }
    }

    // Обработка unhandled promise rejections (для ChunkLoadError)
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      const errorMessage = reason?.message || reason?.toString() || ''
      const errorStack = reason?.stack || ''
      
      if (
        errorMessage.includes('Loading chunk') || 
        errorMessage.includes('ChunkLoadError') ||
        errorMessage.includes('Failed to fetch dynamically imported module') ||
        errorMessage.includes('ERR_ABORTED') ||
        errorMessage.includes('404') ||
        errorStack.includes('chunk') ||
        errorMessage.includes('net::ERR_ABORTED')
      ) {
        console.warn('Chunk load error in promise:', errorMessage)
        event.preventDefault()
        reloadPage()
      }
    }

    // Перехватываем ошибки загрузки скриптов
    const originalError = window.console.error
    window.console.error = (...args: any[]) => {
      const errorString = args.map(arg => String(arg)).join(' ')
      if (
        errorString.includes('ChunkLoadError') ||
        errorString.includes('Loading chunk') ||
        errorString.includes('404') && errorString.includes('_next/static/chunks')
      ) {
        console.warn('Chunk error detected in console:', errorString)
        reloadPage()
      }
      originalError.apply(window.console, args)
    }

    window.addEventListener('error', handleError, true)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      window.removeEventListener('error', handleError, true)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      window.console.error = originalError
    }
  }, [])

  return null
}

