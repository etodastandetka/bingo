import { NextResponse } from 'next/server'
import { createApiResponse } from '@/lib/api-helpers'

export async function POST() {
  try {
    const response = NextResponse.json(createApiResponse(null, undefined))

    // Удаляем куку auth_token с правильными параметрами
    response.cookies.set('auth_token', '', {
      expires: new Date(0),
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    })

    // Также удаляем старую куку на случай, если она была установлена по-другому
    response.cookies.delete('auth_token')

    return response
  } catch (error) {
    // Даже при ошибке возвращаем успешный ответ, чтобы не блокировать выход
    const response = NextResponse.json(createApiResponse(null, undefined))
    response.cookies.delete('auth_token')
    return response
  }
}

