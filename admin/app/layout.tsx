import type { Metadata } from 'next'
import './globals.css'
import ChunkErrorHandler from '@/components/ChunkErrorHandler'

export const metadata: Metadata = {
  title: 'Bingo Admin Panel',
  description: 'Admin panel for Bingo bot management',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
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
                setTimeout(function() {
                  clearReloadCount();
                }, 2000);
                
                var reloadAttempted = false;
                
                function reloadPage() {
                  if (reloadAttempted) return;
                  
                  var reloadCount = getReloadCount();
                  var lastReloadTime = getLastReloadTime();
                  var timeSinceLastReload = Date.now() - lastReloadTime;
                  
                  // Проверяем, не превышен ли лимит попыток
                  if (reloadCount >= MAX_RELOAD_ATTEMPTS) {
                    console.error('[ChunkErrorHandler] Max reload attempts reached. Please refresh the page manually.');
                    // Показываем сообщение пользователю
                    if (document.body) {
                      var errorDiv = document.createElement('div');
                      errorDiv.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; background: #ef4444; color: white; padding: 16px; text-align: center; z-index: 99999; font-family: sans-serif;';
                      errorDiv.innerHTML = '⚠️ Ошибка загрузки страницы. Пожалуйста, обновите страницу вручную (Ctrl+F5)';
                      document.body.appendChild(errorDiv);
                    }
                    return;
                  }
                  
                  // Cooldown применяется только для последующих попыток (не для первой)
                  if (reloadCount > 0 && timeSinceLastReload < RELOAD_COOLDOWN) {
                    console.warn('[ChunkErrorHandler] Reload cooldown active. Waiting...');
                    // Планируем перезагрузку после cooldown
                    setTimeout(function() {
                      reloadAttempted = false; // Сбрасываем флаг для повторной попытки
                      reloadPage();
                    }, RELOAD_COOLDOWN - timeSinceLastReload);
                    return;
                  }
                  
                  reloadAttempted = true;
                  incrementReloadCount();
                  
                  var delay = reloadCount === 0 ? 100 : 500; // Первая попытка быстрее
                  console.warn('[ChunkErrorHandler] Chunk load error detected (attempt ' + (reloadCount + 1) + '/' + MAX_RELOAD_ATTEMPTS + '), reloading page in ' + delay + 'ms...');
                  
                  // Очищаем кеш
                  if ('caches' in window) {
                    caches.keys().then(function(names) {
                      names.forEach(function(name) {
                        caches.delete(name);
                      });
                    }).catch(function() {
                      // Игнорируем ошибки очистки кеша
                    });
                  }
                  
                  setTimeout(function() {
                    window.location.reload();
                  }, delay);
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
                
                // Перехватываем console.error для ChunkLoadError
                var originalConsoleError = console.error;
                console.error = function() {
                  var errorString = Array.prototype.slice.call(arguments).join(' ');
                  if (errorString.includes('ChunkLoadError') || 
                      (errorString.includes('404') && errorString.includes('_next/static/chunks')) ||
                      (errorString.includes('Loading chunk'))) {
                    console.warn('[ChunkErrorHandler] Console error detected:', errorString);
                    reloadPage();
                  }
                  originalConsoleError.apply(console, arguments);
                };
              })();
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <ChunkErrorHandler />
        {children}
      </body>
    </html>
  )
}

