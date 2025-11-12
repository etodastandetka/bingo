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

