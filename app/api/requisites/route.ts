import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'

export async function GET(request: NextRequest) {
  try {
    requireAuth(request)

    const requisites = await prisma.botRequisite.findMany({
      orderBy: [
        { isActive: 'desc' },
        { createdAt: 'desc' },
      ],
    })

    return NextResponse.json(createApiResponse(requisites))
  } catch (error: any) {
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to fetch requisites'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    requireAuth(request)

    const body = await request.json()
    const { value, name, email, password, bank, isActive } = body

    if (!value) {
      return NextResponse.json(
        createApiResponse(null, 'Value is required'),
        { status: 400 }
      )
    }

    // If setting as active, deactivate others
    if (isActive) {
      await prisma.botRequisite.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      })
    }

    const requisite = await prisma.botRequisite.create({
      data: {
        value,
        name,
        email,
        password,
        bank: bank || null,
        isActive: isActive || false,
      },
    })

    return NextResponse.json(
      createApiResponse(requisite)
    )
  } catch (error: any) {
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to create requisite'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

