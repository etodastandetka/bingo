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

    const getCleanUrl = () => {
      const url = new URL(window.location.href)
      // Удаляем все параметры nocache
      url.searchParams.delete('nocache')
      // Добавляем новый параметр для обхода кеша
      url.searchParams.set('nocache', Date.now().toString())
      return url.toString()
    }

    const reloadPage = () => {
      if (reloadAttempted) return
      
      const reloadCount = getReloadCount()
      const lastReloadTime = getLastReloadTime()
      const timeSinceLastReload = Date.now() - lastReloadTime
      const SESSION_TIMEOUT = 60000 // 1 минута - если прошло больше, считаем новую сессию
      const MIN_RELOAD_INTERVAL = 2000 // Минимум 2 секунды между попытками

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

      // Если прошло меньше MIN_RELOAD_INTERVAL с последней попытки, ждем
      // Это предотвращает множественные быстрые перезагрузки
      if (timeSinceLastReload > 0 && timeSinceLastReload < MIN_RELOAD_INTERVAL) {
        const waitTime = MIN_RELOAD_INTERVAL - timeSinceLastReload
        console.warn(`[ChunkErrorHandler] Too soon after last reload. Waiting ${Math.ceil(waitTime / 1000)}s...`)
        setTimeout(() => {
          reloadAttempted = false
          reloadPage()
        }, waitTime)
        return
      }

      // Первая попытка или если прошло достаточно времени - перезагружаем немедленно
      const isFirstAttempt = currentCount === 0
      const shouldReloadImmediately = isFirstAttempt || timeSinceLastReload >= MIN_RELOAD_INTERVAL
      
      if (shouldReloadImmediately) {
        reloadAttempted = true
        incrementReloadCount()
        const attemptNumber = currentCount + 1
        console.warn(`[ChunkErrorHandler] Chunk load error detected (attempt ${attemptNumber}/${MAX_RELOAD_ATTEMPTS}), clearing cache and reloading...`)
        
        // Очищаем кеш и перезагружаем немедленно
        clearAllCaches().then(() => {
          // Используем replace вместо href, чтобы не накапливать историю
          window.location.replace(getCleanUrl())
        }).catch(() => {
          // Если очистка кеша не удалась, все равно перезагружаем
          window.location.replace(getCleanUrl())
        })
        return
      }

      // Для остальных случаев проверяем cooldown
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
        window.location.replace(getCleanUrl())
      }).catch(() => {
        window.location.replace(getCleanUrl())
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

