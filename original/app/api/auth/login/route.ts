import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser } from '@/lib/auth'
import { createApiResponse } from '@/lib/api-helpers'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, password } = body

    if (!username || !password) {
      return NextResponse.json(
        createApiResponse(null, 'Username and password are required'),
        { status: 400 }
      )
    }

    const result = await authenticateUser(username, password)

    if (!result) {
      return NextResponse.json(
        createApiResponse(null, 'Invalid credentials'),
        { status: 401 }
      )
    }

    const response = NextResponse.json(
      createApiResponse({ user: result.user, message: 'Login successful' })
    )

    response.cookies.set('auth_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    })

    return response
  } catch (error: any) {
    return NextResponse.json(
      createApiResponse(null, error.message || 'Login failed'),
      { status: 500 }
    )
  }
}

