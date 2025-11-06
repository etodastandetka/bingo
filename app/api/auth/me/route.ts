import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { createApiResponse } from '@/lib/api-helpers'

export async function GET(request: NextRequest) {
  try {
    const authUser = getAuthUser(request)

    if (!authUser) {
      return NextResponse.json(
        createApiResponse(null, 'Unauthorized'),
        { status: 401 }
      )
    }

    const user = await prisma.adminUser.findUnique({
      where: { id: authUser.userId },
      select: {
        id: true,
        username: true,
        email: true,
        isSuperAdmin: true,
        isActive: true,
      },
    })

    if (!user) {
      return NextResponse.json(
        createApiResponse(null, 'User not found'),
        { status: 404 }
      )
    }

    return NextResponse.json(createApiResponse(user))
  } catch (error: any) {
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to get user'),
      { status: 500 }
    )
  }
}

