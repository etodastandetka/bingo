import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser } from '@/lib/auth'
import { createApiResponse } from '@/lib/api-helpers'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, password } = body

    console.log('🔐 Login attempt:', { username, hasPassword: !!password })

    if (!username || !password) {
      console.log('❌ Missing username or password')
      return NextResponse.json(
        createApiResponse(null, 'Username and password are required'),
        { status: 400 }
      )
    }

    const result = await authenticateUser(username, password)

    if (!result) {
      console.log('❌ Authentication failed for username:', username)
      return NextResponse.json(
        createApiResponse(null, 'Invalid credentials'),
        { status: 401 }
      )
    }

    console.log('✅ Login successful for username:', username)

    const response = NextResponse.json(
      createApiResponse({ user: result.user, message: 'Login successful' })
    )

    // Устанавливаем cookie с правильными параметрами
    // Проверяем, используется ли HTTPS по заголовку
    const protocol = request.headers.get('x-forwarded-proto') || request.nextUrl.protocol.replace(':', '')
    const isHttps = protocol === 'https'
    
    // Secure только для HTTPS, иначе cookie не установится на HTTP
    const secureFlag = isHttps
    
    response.cookies.set('auth_token', result.token, {
      httpOnly: true,
      secure: secureFlag, // Secure только для HTTPS
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/', // Важно: cookie должен быть доступен для всего сайта
    })

    console.log('🍪 Cookie установлен:', {
      hasToken: !!result.token,
      secure: secureFlag,
      sameSite: 'lax',
      path: '/',
      protocol: protocol,
      isHttps: isHttps
    })

    return response
  } catch (error: any) {
    return NextResponse.json(
      createApiResponse(null, error.message || 'Login failed'),
      { status: 500 }
    )
  }
}

