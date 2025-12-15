import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value
  const pathname = request.nextUrl.pathname

  // КРИТИЧНО: Правильная обработка статических файлов Next.js
  // Файлы с хешами должны кешироваться долго, но HTML - нет
  if (pathname.startsWith('/_next/static/')) {
    const response = NextResponse.next()
    
    // Статические файлы с хешами (chunks, CSS, JS) - кешируем на год
    // Хеш в имени файла гарантирует, что при новом деплое будет новый файл
    if (pathname.match(/\/_next\/static\/.*\/chunks\/|\.(js|css|woff|woff2|ttf|otf|png|jpg|jpeg|gif|svg|ico|webp|avif)$/)) {
      response.headers.set(
        'Cache-Control',
        'public, max-age=31536000, immutable'
      )
    } else {
      // Остальные статические файлы - не кешируем
      response.headers.set(
        'Cache-Control',
        'public, max-age=0, must-revalidate'
      )
    }
    
    return response
  }

  // HTML файлы и страницы - не кешируем, чтобы всегда получать свежий HTML
  if (pathname === '/' || pathname.startsWith('/dashboard') || pathname.startsWith('/login')) {
    const response = NextResponse.next()
    response.headers.set(
      'Cache-Control',
      'no-cache, no-store, must-revalidate, max-age=0'
    )
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    return response
  }

  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/api/auth/login']
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))

  // API routes that don't require authentication (for external integrations)
  const publicApiRoutes = ['/api/auth', '/api/payment', '/api/transaction-history', '/api/public', '/api/chat-message', '/api/check-withdraw-amount']
  const isPublicApiRoute = publicApiRoutes.some(route => pathname.startsWith(route))

  // Add CORS headers for public API routes
  if (isPublicApiRoute && request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 200 })
    response.headers.set('Access-Control-Allow-Origin', '*')
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    return response
  }

  if (isPublicRoute || isPublicApiRoute) {
    const response = NextResponse.next()
    // Add CORS headers
    response.headers.set('Access-Control-Allow-Origin', '*')
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    return response
  }

  // Protect API routes
  if (pathname.startsWith('/api/') && !isPublicApiRoute) {
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // Protect dashboard pages
  if (pathname.startsWith('/dashboard') || pathname === '/') {
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  // Обрабатываем все маршруты, включая статические файлы для установки заголовков кеширования
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
    // Но также обрабатываем _next/static для установки заголовков кеширования
    '/_next/static/:path*',
  ],
}

