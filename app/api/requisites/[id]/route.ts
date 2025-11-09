import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    requireAuth(request)

    const id = parseInt(params.id)
    const body = await request.json()

    // If setting as active, deactivate others
    if (body.isActive) {
      await prisma.botRequisite.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      })
    }

    const updateData: any = {}
    if (body.value !== undefined) updateData.value = body.value
    if (body.name !== undefined) updateData.name = body.name
    if (body.email !== undefined) updateData.email = body.email
    if (body.bank !== undefined) updateData.bank = body.bank || null
    // Обновляем пароль только если он передан и не пустой
    if (body.password !== undefined && body.password !== '') {
      updateData.password = body.password
    }
    if (body.isActive !== undefined) updateData.isActive = body.isActive

    const requisite = await prisma.botRequisite.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(
      createApiResponse(requisite)
    )
  } catch (error: any) {
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to update requisite'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    requireAuth(request)

    const id = parseInt(params.id)

    await prisma.botRequisite.delete({
      where: { id },
    })

    return NextResponse.json(
      createApiResponse(null)
    )
  } catch (error: any) {
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to delete requisite'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

