import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createApiResponse } from '@/lib/api-helpers'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, password } = body

    if (!username || !password) {
      return NextResponse.json(
        createApiResponse(null, 'Логин и пароль обязательны'),
        { status: 400 }
      )
    }

    const admin = await prisma.adminUser.findUnique({
      where: { username },
    })

    if (!admin || !admin.isActive) {
      return NextResponse.json(
        createApiResponse(null, 'Неверный логин или пароль'),
        { status: 401 }
      )
    }

    const isPasswordValid = await bcrypt.compare(password, admin.password)

    if (!isPasswordValid) {
      return NextResponse.json(
        createApiResponse(null, 'Неверный логин или пароль'),
        { status: 401 }
      )
    }

    // Генерируем простой токен (в продакшене лучше использовать JWT)
    const token = crypto.randomBytes(32).toString('hex')

    const response = NextResponse.json(
      createApiResponse({
        token,
        user: {
          id: admin.id,
          username: admin.username,
          email: admin.email,
          isSuperAdmin: admin.isSuperAdmin,
        },
      })
    )

    // Устанавливаем cookie
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 часа
      path: '/',
    })

    return response
  } catch (error: any) {
    console.error('Login error:', error)
    return NextResponse.json(
      createApiResponse(null, 'Ошибка при входе'),
      { status: 500 }
    )
  }
}

