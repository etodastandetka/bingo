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
    // Также проверяем, не устарел ли счетчик (если прошло больше минуты)
    const lastReloadTime = getLastReloadTime()
    const timeSinceLastReload = Date.now() - lastReloadTime
    const SESSION_TIMEOUT = 60000 // 1 минута
    
    if (timeSinceLastReload > SESSION_TIMEOUT || timeSinceLastReload === 0) {
      // Если прошло больше минуты или это первая загрузка, очищаем счетчик
      clearReloadCount()
    }
    
    setTimeout(() => {
      clearReloadCount()
    }, 2000)

    let reloadAttempted = false

    const clearAllCaches = async () => {
      try {
        // Очищаем все кеши
        if ('caches' in window) {
          const cacheNames = await caches.keys()
          await Promise.all(cacheNames.map(name => caches.delete(name)))
        }
        
        // Очищаем localStorage и sessionStorage от старых данных Next.js
        try {
          const keys = Object.keys(localStorage)
          keys.forEach(key => {
            if (key.startsWith('next-') || key.includes('chunk') || key.includes('_next')) {
              localStorage.removeItem(key)
            }
          })
        } catch {}
        
        // Очищаем IndexedDB если возможно
        if ('indexedDB' in window) {
          try {
            const databases = await indexedDB.databases()
            databases.forEach(db => {
              if (db.name && (db.name.includes('next') || db.name.includes('cache'))) {
                indexedDB.deleteDatabase(db.name)
              }
            })
          } catch {}
        }
      } catch (error) {
        console.warn('[ChunkErrorHandler] Error clearing caches:', error)
      }
    }

    const reloadPage = () => {
      if (reloadAttempted) return
      
      const reloadCount = getReloadCount()
      const lastReloadTime = getLastReloadTime()
      const timeSinceLastReload = Date.now() - lastReloadTime
      const SESSION_TIMEOUT = 60000 // 1 минута - если прошло больше, считаем новую сессию

      // Если прошло больше минуты с последней попытки, сбрасываем счетчик (новая сессия)
      const isNewSession = timeSinceLastReload > SESSION_TIMEOUT || timeSinceLastReload === 0
      
      if (isNewSession && reloadCount > 0) {
        clearReloadCount()
        console.warn('[ChunkErrorHandler] Session timeout, resetting reload count')
      }

      // Проверяем, не превышен ли лимит попыток
      const currentCount = isNewSession ? 0 : reloadCount
      if (currentCount >= MAX_RELOAD_ATTEMPTS) {
        console.error('[ChunkErrorHandler] Max reload attempts reached. Please refresh the page manually or contact support.')
        if (document.body) {
          const errorDiv = document.createElement('div')
          errorDiv.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; background: #ef4444; color: white; padding: 16px; text-align: center; z-index: 99999; font-family: sans-serif;'
          errorDiv.innerHTML = '⚠️ Ошибка загрузки страницы. Пожалуйста, обновите страницу вручную (Ctrl+F5 или Cmd+Shift+R)'
          document.body.appendChild(errorDiv)
        }
        return
      }

      // Первая попытка всегда выполняется немедленно (reloadCount === 0 или новая сессия)
      const isFirstAttempt = currentCount === 0
      
      if (isFirstAttempt) {
        reloadAttempted = true
        incrementReloadCount()
        console.warn(`[ChunkErrorHandler] Chunk load error detected (attempt 1/${MAX_RELOAD_ATTEMPTS}), clearing cache and reloading...`)
        
        // Очищаем кеш и перезагружаем немедленно
        clearAllCaches().then(() => {
          // Используем location.href для принудительной перезагрузки без кеша
          window.location.href = window.location.href.split('#')[0] + '?nocache=' + Date.now()
        }).catch(() => {
          // Если очистка кеша не удалась, все равно перезагружаем
          window.location.href = window.location.href.split('#')[0] + '?nocache=' + Date.now()
        })
        return
      }

      // Для последующих попыток проверяем cooldown
      if (timeSinceLastReload < RELOAD_COOLDOWN) {
        const waitTime = RELOAD_COOLDOWN - timeSinceLastReload
        console.warn(`[ChunkErrorHandler] Reload cooldown active. Waiting ${Math.ceil(waitTime / 1000)}s...`)
        setTimeout(() => {
          reloadAttempted = false
          reloadPage()
        }, waitTime)
        return
      }

      reloadAttempted = true
      incrementReloadCount()
      
      console.warn(`[ChunkErrorHandler] Chunk load error detected (attempt ${currentCount + 1}/${MAX_RELOAD_ATTEMPTS}), clearing cache and reloading...`)
      
      // Очищаем кеш и перезагружаем
      clearAllCaches().then(() => {
        window.location.href = window.location.href.split('#')[0] + '?nocache=' + Date.now()
      }).catch(() => {
        window.location.href = window.location.href.split('#')[0] + '?nocache=' + Date.now()
      })
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

