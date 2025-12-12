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
    const { value, name, email, password, bank, hash, isActive } = body

    // Валидация в зависимости от банка
    if (bank === 'Demir Bank') {
      if (!value || !/^\d{16}$/.test(value)) {
        return NextResponse.json(
          createApiResponse(null, 'Реквизит должен содержать ровно 16 цифр'),
          { status: 400 }
        )
      }
      if (!email) {
        return NextResponse.json(
          createApiResponse(null, 'Почта обязательна для Demir Bank'),
          { status: 400 }
        )
      }
      if (!password) {
        return NextResponse.json(
          createApiResponse(null, 'Пароль обязателен для Demir Bank'),
          { status: 400 }
        )
      }
    } else if (bank === 'Bakai') {
      if (!hash) {
        return NextResponse.json(
          createApiResponse(null, 'Hash обязателен для Bakai'),
          { status: 400 }
        )
      }
      if (!name) {
        return NextResponse.json(
          createApiResponse(null, 'Название обязательно для Bakai'),
          { status: 400 }
        )
      }
    } else if (bank) {
      return NextResponse.json(
        createApiResponse(null, 'Неизвестный банк'),
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
        value: bank === 'Demir Bank' ? value : null,
        name,
        email: bank === 'Demir Bank' ? email : null,
        password: bank === 'Demir Bank' ? password : null,
        bank,
        hash: bank === 'Bakai' ? hash : null,
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

