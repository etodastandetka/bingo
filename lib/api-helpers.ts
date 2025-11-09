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

export function createApiResponse<T>(
  data?: T,
  error?: string,
  message?: string
): ApiResponse<T> {
  if (error) {
    return { success: false, error }
  }
  return { success: true, data, message }
}

export function requireAuth(request: NextRequest): TokenPayload {
  const user = getAuthUser(request)
  if (!user) {
    throw new Error('Unauthorized')
  }
  return user
}

