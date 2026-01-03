import { NextResponse } from 'next/server'
import { createApiResponse } from '@/lib/api-helpers'

export async function POST() {
  const response = NextResponse.json(createApiResponse(null, undefined))

  response.cookies.delete('auth_token')

  return response
}

