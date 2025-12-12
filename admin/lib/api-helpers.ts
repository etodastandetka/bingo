import { NextRequest } from 'next/server'
import { verifyToken, TokenPayload } from './auth'

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export function getAuthUser(request: NextRequest): TokenPayload | null {
  const token = request.cookies.get('auth_token')?.value

  if (!token) {
    return null
  }

  return verifyToken(token)
}

// Функция для рекурсивного преобразования BigInt в строки
function serializeBigInt(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj
  }
  
  if (typeof obj === 'bigint') {
    return obj.toString()
  }
  
  if (Array.isArray(obj)) {
    return obj.map(serializeBigInt)
  }
  
  if (typeof obj === 'object') {
    const serialized: any = {}
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        serialized[key] = serializeBigInt(obj[key])
      }
    }
    return serialized
  }
  
  return obj
}

export function createApiResponse<T>(
  data?: T,
  error?: string,
  message?: string
): ApiResponse<T> {
  if (error) {
    return { success: false, error }
  }
  // Сериализуем BigInt перед возвратом
  const serializedData = data ? serializeBigInt(data) : undefined
  return { success: true, data: serializedData, message }
}

export function requireAuth(request: NextRequest): TokenPayload {
  const user = getAuthUser(request)
  if (!user) {
    throw new Error('Unauthorized')
  }
  return user
}

