import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createApiResponse } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json(
        createApiResponse(null, 'Invalid request ID'),
        { status: 400 }
      )
    }

    const body = await request.json()
    const { message_id } = body

    if (!message_id) {
      return NextResponse.json(
        createApiResponse(null, 'message_id is required'),
        { status: 400 }
      )
    }

    await prisma.request.update({
      where: { id },
      data: {
        requestCreatedMessageId: BigInt(message_id),
      },
    })

    return NextResponse.json(
      createApiResponse({ success: true })
    )
  } catch (error: any) {
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to update message ID'),
      { status: 500 }
    )
  }
}

