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
                let reloadAttempted = false;
                
                function reloadPage() {
                  if (!reloadAttempted) {
                    reloadAttempted = true;
                    console.warn('[ChunkErrorHandler] Chunk load error detected, reloading page...');
                    // Очищаем кеш
                    if ('caches' in window) {
                      caches.keys().then(function(names) {
                        names.forEach(function(name) {
                          caches.delete(name);
                        });
                      });
                    }
                    setTimeout(function() {
                      window.location.reload();
                    }, 100);
                  }
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

