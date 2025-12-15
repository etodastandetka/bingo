'use client'

import { useEffect } from 'react'

export default function ChunkErrorHandler() {
  useEffect(() => {
    let reloadAttempted = false

    const reloadPage = () => {
      if (!reloadAttempted) {
        reloadAttempted = true
        console.warn('Chunk load error detected, reloading page in 100ms...')
        setTimeout(() => {
          // Очищаем кеш перед перезагрузкой
          if ('caches' in window) {
            caches.keys().then(names => {
              names.forEach(name => caches.delete(name))
            })
          }
          window.location.reload()
        }, 100)
      }
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

