import type { Metadata } from 'next'
import './globals.css'
import ChunkErrorHandler from '@/components/ChunkErrorHandler'

export const metadata: Metadata = {
  title: 'Bingo Admin Panel',
  description: 'Admin panel for Bingo bot management',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Bingo Admin',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
}

export const viewport = {
  themeColor: '#3b82f6',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Bingo Admin" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                // Выводим ASCII логотип в консоль браузера
                console.log('%c' + \`
 ███████████   ███                                        
▒▒███▒▒▒▒▒███ ▒▒▒                                         
 ▒███    ▒███ ████  ████████    ███████  ██████           
 ▒██████████ ▒▒███ ▒▒███▒▒███  ███▒▒███ ███▒▒███          
 ▒███▒▒▒▒▒███ ▒███  ▒███ ▒███ ▒███ ▒███▒███ ▒███          
 ▒███    ▒███ ▒███  ▒███ ▒███ ▒███ ▒███▒███ ▒███          
 ███████████  █████ ████ █████▒▒███████▒▒██████           
▒▒▒▒▒▒▒▒▒▒▒  ▒▒▒▒▒ ▒▒▒▒ ▒▒▒▒▒  ▒▒▒▒▒███ ▒▒▒▒▒▒            
                               ███ ▒███                   
                              ▒▒██████                    
                               ▒▒▒▒▒▒                     
 █████   ████    ███████    ███████████ █████ █████   ████
▒▒███   ███▒   ███▒▒▒▒▒███ ▒█▒▒▒███▒▒▒█▒▒███ ▒▒███   ███▒ 
 ▒███  ███    ███     ▒▒███▒   ▒███  ▒  ▒███  ▒███  ███   
 ▒███████    ▒███      ▒███    ▒███     ▒███  ▒███████    
 ▒███▒▒███   ▒███      ▒███    ▒███     ▒███  ▒███▒▒███   
 ▒███ ▒▒███  ▒▒███     ███     ▒███     ▒███  ▒███ ▒▒███  
 █████ ▒▒████ ▒▒▒███████▒      █████    █████ █████ ▒▒████
▒▒▒▒▒   ▒▒▒▒    ▒▒▒▒▒▒▒       ▒▒▒▒▒    ▒▒▒▒▒ ▒▒▒▒▒   ▒▒▒▒ 
\`, 'color: #3b82f6; font-family: monospace; font-size: 10px; line-height: 1.2;');
                console.log('%cBingo Admin Panel', 'color: #3b82f6; font-size: 16px; font-weight: bold;');
                console.log('');
                
                // Обработка ошибок загрузки чанков - выполняется ДО загрузки React
                var MAX_RELOAD_ATTEMPTS = 3;
                var RELOAD_COOLDOWN = 5000; // 5 секунд между попытками
                var STORAGE_KEY = 'chunk_error_reload_count';
                var STORAGE_TIMESTAMP_KEY = 'chunk_error_reload_timestamp';
                
                function getReloadCount() {
                  try {
                    var count = sessionStorage.getItem(STORAGE_KEY);
                    return count ? parseInt(count, 10) : 0;
                  } catch {
                    return 0;
                  }
                }
                
                function getLastReloadTime() {
                  try {
                    var timestamp = sessionStorage.getItem(STORAGE_TIMESTAMP_KEY);
                    return timestamp ? parseInt(timestamp, 10) : 0;
                  } catch {
                    return 0;
                  }
                }
                
                function incrementReloadCount() {
                  try {
                    var count = getReloadCount() + 1;
                    sessionStorage.setItem(STORAGE_KEY, count.toString());
                    sessionStorage.setItem(STORAGE_TIMESTAMP_KEY, Date.now().toString());
                  } catch {
                    // Игнорируем ошибки sessionStorage
                  }
                }
                
                function clearReloadCount() {
                  try {
                    sessionStorage.removeItem(STORAGE_KEY);
                    sessionStorage.removeItem(STORAGE_TIMESTAMP_KEY);
                  } catch {
                    // Игнорируем ошибки sessionStorage
                  }
                }
                
                // Очищаем счетчик при успешной загрузке страницы (через 2 секунды)
                // Также проверяем, не устарел ли счетчик (если прошло больше минуты)
                var lastReloadTime = getLastReloadTime();
                var timeSinceLastReload = Date.now() - lastReloadTime;
                var SESSION_TIMEOUT = 60000; // 1 минута
                
                if (timeSinceLastReload > SESSION_TIMEOUT || timeSinceLastReload === 0) {
                  // Если прошло больше минуты или это первая загрузка, очищаем счетчик
                  clearReloadCount();
                }
                
                setTimeout(function() {
                  clearReloadCount();
                }, 2000);
                
                var reloadAttempted = false;
                
                function clearAllCaches() {
                  return new Promise(function(resolve) {
                    try {
                      // Очищаем все кеши
                      if ('caches' in window) {
                        caches.keys().then(function(names) {
                          return Promise.all(names.map(function(name) {
                            return caches.delete(name);
                          }));
                        }).then(function() {
                          // Очищаем localStorage от старых данных Next.js
                          try {
                            var keys = Object.keys(localStorage);
                            keys.forEach(function(key) {
                              if (key.indexOf('next-') === 0 || key.indexOf('chunk') !== -1 || key.indexOf('_next') !== -1) {
                                localStorage.removeItem(key);
                              }
                            });
                          } catch (e) {}
                          resolve();
                        }).catch(function() {
                          resolve();
                        });
                      } else {
                        resolve();
                      }
                    } catch (error) {
                      resolve();
                    }
                  });
                }
                
                function getCleanUrl() {
                  try {
                    var url = new URL(window.location.href);
                    // Удаляем все параметры nocache
                    url.searchParams.delete('nocache');
                    // Добавляем новый параметр для обхода кеша
                    url.searchParams.set('nocache', Date.now().toString());
                    return url.toString();
                  } catch (e) {
                    // Fallback для старых браузеров
                    var url = window.location.href.split('#')[0];
                    var baseUrl = url.split('?')[0];
                    return baseUrl + '?nocache=' + Date.now();
                  }
                }
                
                function reloadPage() {
                  if (reloadAttempted) return;
                  
                  var reloadCount = getReloadCount();
                  var lastReloadTime = getLastReloadTime();
                  var timeSinceLastReload = Date.now() - lastReloadTime;
                  
                  var SESSION_TIMEOUT = 60000; // 1 минута - если прошло больше, считаем новую сессию
                  var MIN_RELOAD_INTERVAL = 2000; // Минимум 2 секунды между попытками
                  
                  // Если прошло больше минуты с последней попытки, сбрасываем счетчик (новая сессия)
                  var isNewSession = timeSinceLastReload > SESSION_TIMEOUT || timeSinceLastReload === 0;
                  
                  if (isNewSession && reloadCount > 0) {
                    clearReloadCount();
                    console.warn('[ChunkErrorHandler] Session timeout, resetting reload count');
                  }
                  
                  // Проверяем, не превышен ли лимит попыток
                  var currentCount = isNewSession ? 0 : reloadCount;
                  if (currentCount >= MAX_RELOAD_ATTEMPTS) {
                    console.error('[ChunkErrorHandler] Max reload attempts reached. Please refresh the page manually.');
                    if (document.body) {
                      var errorDiv = document.createElement('div');
                      errorDiv.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; background: #ef4444; color: white; padding: 16px; text-align: center; z-index: 99999; font-family: sans-serif;';
                      errorDiv.innerHTML = '⚠️ Ошибка загрузки страницы. Пожалуйста, обновите страницу вручную (Ctrl+F5)';
                      document.body.appendChild(errorDiv);
                    }
                    return;
                  }
                  
                  // Если прошло меньше MIN_RELOAD_INTERVAL с последней попытки, ждем
                  // Это предотвращает множественные быстрые перезагрузки
                  if (timeSinceLastReload > 0 && timeSinceLastReload < MIN_RELOAD_INTERVAL) {
                    var waitTime = MIN_RELOAD_INTERVAL - timeSinceLastReload;
                    console.warn('[ChunkErrorHandler] Too soon after last reload. Waiting ' + Math.ceil(waitTime / 1000) + 's...');
                    setTimeout(function() {
                      reloadAttempted = false;
                      reloadPage();
                    }, waitTime);
                    return;
                  }
                  
                  // Первая попытка или если прошло достаточно времени - перезагружаем немедленно
                  var isFirstAttempt = currentCount === 0;
                  var shouldReloadImmediately = isFirstAttempt || timeSinceLastReload >= MIN_RELOAD_INTERVAL;
                  
                  if (shouldReloadImmediately) {
                    reloadAttempted = true;
                    incrementReloadCount();
                    var attemptNumber = currentCount + 1;
                    console.warn('[ChunkErrorHandler] Chunk load error detected (attempt ' + attemptNumber + '/' + MAX_RELOAD_ATTEMPTS + '), clearing cache and reloading...');
                    
                    // Очищаем кеш и перезагружаем немедленно
                    clearAllCaches().then(function() {
                      // Используем replace вместо href, чтобы не накапливать историю
                      window.location.replace(getCleanUrl());
                    }).catch(function() {
                      // Если очистка кеша не удалась, все равно перезагружаем
                      window.location.replace(getCleanUrl());
                    });
                    return;
                  }
                  
                  // Для остальных случаев проверяем cooldown
                  if (timeSinceLastReload < RELOAD_COOLDOWN) {
                    var waitTime = RELOAD_COOLDOWN - timeSinceLastReload;
                    console.warn('[ChunkErrorHandler] Reload cooldown active. Waiting ' + Math.ceil(waitTime / 1000) + 's...');
                    setTimeout(function() {
                      reloadAttempted = false;
                      reloadPage();
                    }, waitTime);
                    return;
                  }
                  
                  reloadAttempted = true;
                  incrementReloadCount();
                  
                  console.warn('[ChunkErrorHandler] Chunk load error detected (attempt ' + (currentCount + 1) + '/' + MAX_RELOAD_ATTEMPTS + '), clearing cache and reloading...');
                  
                  // Очищаем кеш и перезагружаем
                  clearAllCaches().then(function() {
                    window.location.replace(getCleanUrl());
                  }).catch(function() {
                    window.location.replace(getCleanUrl());
                  });
                }
                
                // Перехватываем ошибки загрузки скриптов
                window.addEventListener('error', function(event) {
                  var errorSource = event.filename || event.target?.src || '';
                  var errorMessage = event.message || '';
                  
                  if (errorSource.includes('_next/static/chunks') && 
                      (errorSource.includes('404') || errorMessage.includes('404') || 
                       errorSource.includes('chunk') || errorMessage.includes('ChunkLoadError'))) {
                    console.warn('[ChunkErrorHandler] Script load error:', errorSource, errorMessage);
                    reloadPage();
                  }
                }, true);
                
                // Перехватываем unhandled promise rejections
                window.addEventListener('unhandledrejection', function(event) {
                  var reason = event.reason;
                  var errorMessage = reason?.message || reason?.toString() || '';
                  
                  if (errorMessage.includes('ChunkLoadError') || 
                      errorMessage.includes('Loading chunk') ||
                      errorMessage.includes('404') && errorMessage.includes('_next/static/chunks')) {
                    console.warn('[ChunkErrorHandler] Promise rejection:', errorMessage);
                    event.preventDefault();
                    reloadPage();
                  }
                });
                
                // Перехватываем console.error для ChunkLoadError и Server Action errors
                var originalConsoleError = console.error;
                console.error = function() {
                  var errorString = Array.prototype.slice.call(arguments).join(' ');
                  if (errorString.includes('ChunkLoadError') || 
                      (errorString.includes('404') && errorString.includes('_next/static/chunks')) ||
                      (errorString.includes('Loading chunk')) ||
                      (errorString.includes('Failed to find Server Action')) ||
                      (errorString.includes('Server Action'))) {
                    console.warn('[ChunkErrorHandler] Console error detected:', errorString);
                    reloadPage();
                  }
                  originalConsoleError.apply(console, arguments);
                };
                
                // Перехватываем ошибки Server Actions
                window.addEventListener('error', function(event) {
                  var errorMessage = event.message || '';
                  if (errorMessage.includes('Failed to find Server Action') || 
                      errorMessage.includes('Server Action')) {
                    console.warn('[ChunkErrorHandler] Server Action error detected:', errorMessage);
                    reloadPage();
                  }
                }, true);
              })();
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <ChunkErrorHandler />
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js')
                    .then((reg) => console.log('Service Worker registered', reg))
                    .catch((err) => console.log('Service Worker registration failed', err));
                });
              }
            `,
          }}
        />
      </body>
    </html>
  )
}

