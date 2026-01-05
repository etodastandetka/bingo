import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'

// Отключаем кеширование для актуальных данных
export const dynamic = 'force-dynamic'

// Увеличиваем таймаут для больших изображений
export const maxDuration = 60

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    requireAuth(request)

    const id = parseInt(params.id)

    // Получаем только photoFileUrl из базы данных
    const requestData = await prisma.request.findUnique({
      where: { id },
      select: {
        id: true,
        photoFileUrl: true,
      },
    })

    if (!requestData) {
      return NextResponse.json(
        createApiResponse(null, 'Request not found'),
        { status: 404 }
      )
    }

    if (!requestData.photoFileUrl) {
      return NextResponse.json(
        createApiResponse(null, 'Photo not found'),
        { status: 404 }
      )
    }

    // Возвращаем только фото
    return NextResponse.json(
      createApiResponse({
        photoFileUrl: requestData.photoFileUrl,
      })
    )
  } catch (error: any) {
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to fetch photo'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

