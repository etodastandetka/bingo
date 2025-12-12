import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value

  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/api/auth/login']
  const isPublicRoute = publicRoutes.some(route => request.nextUrl.pathname.startsWith(route))

  // API routes that don't require authentication (for external integrations)
  const publicApiRoutes = ['/api/auth', '/api/payment', '/api/transaction-history', '/api/public', '/api/chat-message', '/api/check-withdraw-amount']
  const isPublicApiRoute = publicApiRoutes.some(route => request.nextUrl.pathname.startsWith(route))

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
  if (request.nextUrl.pathname.startsWith('/api/') && !isPublicApiRoute) {
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // Protect dashboard pages
  if (request.nextUrl.pathname.startsWith('/dashboard') || request.nextUrl.pathname === '/') {
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

