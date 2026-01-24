import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    requireAuth(request)

    const id = parseInt(params.id)

    if (isNaN(id)) {
      return NextResponse.json(
        createApiResponse(null, 'Invalid log ID'),
        { status: 400 }
      )
    }

    // Удаляем запись лога
    await prisma.casinoLimitLog.delete({
      where: { id },
    })

    return NextResponse.json(
      createApiResponse({ success: true, message: 'Log deleted successfully' })
    )
  } catch (error: any) {
    console.error('Delete casino limit log error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to delete log'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

