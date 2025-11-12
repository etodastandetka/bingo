import { NextRequest } from 'next/server'

export function createApiResponse<T>(data: T | null, error?: string) {
  if (error) {
    return {
      success: false,
      error,
    }
  }
  return {
    success: true,
    data,
  }
}

export function requireAuth(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value
  if (!token) {
    throw new Error('Unauthorized')
  }
}

export function getAuthUser(request: NextRequest): { userId: number } | null {
  const token = request.cookies.get('auth_token')?.value
  if (!token) {
    return null
  }
  // В упрощенной системе просто возвращаем объект с токеном
  // В реальной JWT системе здесь была бы верификация токена
  // Для совместимости возвращаем объект, но userId будет получен из БД
  return { userId: 0 } // Будет переопределено в route handlers
}

