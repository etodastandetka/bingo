import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'

// Получение всех быстрых ответов
export async function GET(request: NextRequest) {
  try {
    requireAuth(request)

    const replies = await prisma.quickReply.findMany({
      orderBy: {
        order: 'asc',
      },
    })

    return NextResponse.json(
      createApiResponse({
        replies,
      })
    )
  } catch (error: any) {
    console.error('Quick replies API error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to fetch quick replies'),
      { status: 500 }
    )
  }
}

// Создание нового быстрого ответа
export async function POST(request: NextRequest) {
  try {
    requireAuth(request)

    const body = await request.json()
    const { text, order } = body

    if (!text || !text.trim()) {
      return NextResponse.json(
        createApiResponse(null, 'Text is required'),
        { status: 400 }
      )
    }

    // Если order не указан, ставим в конец
    let finalOrder = order
    if (finalOrder === undefined || finalOrder === null) {
      const maxOrder = await prisma.quickReply.findFirst({
        orderBy: { order: 'desc' },
        select: { order: true },
      })
      finalOrder = (maxOrder?.order || 0) + 1
    }

    const reply = await prisma.quickReply.create({
      data: {
        text: text.trim(),
        order: finalOrder,
      },
    })

    return NextResponse.json(
      createApiResponse({
        reply,
      })
    )
  } catch (error: any) {
    console.error('Create quick reply API error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to create quick reply'),
      { status: 500 }
    )
  }
}

// Обновление быстрого ответа
export async function PATCH(request: NextRequest) {
  try {
    requireAuth(request)

    const body = await request.json()
    const { id, text, order } = body

    if (!id) {
      return NextResponse.json(
        createApiResponse(null, 'ID is required'),
        { status: 400 }
      )
    }

    const updateData: any = {}
    if (text !== undefined) {
      if (!text.trim()) {
        return NextResponse.json(
          createApiResponse(null, 'Text cannot be empty'),
          { status: 400 }
        )
      }
      updateData.text = text.trim()
    }
    if (order !== undefined) {
      updateData.order = order
    }

    const reply = await prisma.quickReply.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(
      createApiResponse({
        reply,
      })
    )
  } catch (error: any) {
    console.error('Update quick reply API error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to update quick reply'),
      { status: 500 }
    )
  }
}

// Удаление быстрого ответа
export async function DELETE(request: NextRequest) {
  try {
    requireAuth(request)

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        createApiResponse(null, 'ID is required'),
        { status: 400 }
      )
    }

    await prisma.quickReply.delete({
      where: { id: parseInt(id) },
    })

    return NextResponse.json(
      createApiResponse({
        success: true,
      })
    )
  } catch (error: any) {
    console.error('Delete quick reply API error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to delete quick reply'),
      { status: 500 }
    )
  }
}










