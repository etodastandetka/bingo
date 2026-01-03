import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'

// Получение и обновление заметки пользователя
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

    // Если пользователя нет, возвращаем null
    return NextResponse.json(
      createApiResponse({
        note: user?.note || null,
      })
    )
  } catch (error: any) {
    console.error('Error fetching note:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to fetch note'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    requireAuth(request)

    const userId = BigInt(params.userId)
    const body = await request.json()
    const { note } = body

    // Получаем данные из последней заявки для создания пользователя, если его нет
    const lastRequest = await prisma.request.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })

    // Используем upsert для создания или обновления пользователя
    const user = await prisma.botUser.upsert({
      where: { userId },
      update: {
        note: note || null,
      },
      create: {
        userId,
        username: lastRequest?.username || null,
        firstName: lastRequest?.firstName || null,
        lastName: lastRequest?.lastName || null,
        language: 'ru',
        note: note || null,
      },
    })

    return NextResponse.json(
      createApiResponse({
        note: user.note,
      })
    )
  } catch (error: any) {
    console.error('Error updating note:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to update note'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

