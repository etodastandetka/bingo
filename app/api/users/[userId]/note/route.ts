import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'

// Получение заметки пользователя
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    requireAuth(request)

    const userId = BigInt(params.userId)

    const user = await prisma.botUser.findUnique({
      where: { userId },
      select: { note: true },
    })

    return NextResponse.json(
      createApiResponse({
        note: user?.note || null,
      })
    )
  } catch (error: any) {
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to fetch note'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

// Обновление заметки пользователя
export async function PATCH(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    requireAuth(request)

    const userId = BigInt(params.userId)
    const body = await request.json()
    const { note } = body

    // Создаем или обновляем пользователя с заметкой
    const user = await prisma.botUser.upsert({
      where: { userId },
      update: {
        note: note || null,
      },
      create: {
        userId,
        note: note || null,
        language: 'ru',
      },
    })

    return NextResponse.json(
      createApiResponse({
        note: user.note,
      })
    )
  } catch (error: any) {
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to update note'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

