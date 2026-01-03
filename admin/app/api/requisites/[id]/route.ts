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

    // Валидация в зависимости от банка
    if (body.bank === 'Demir Bank') {
      if (body.value !== undefined && (!body.value || !/^\d{16}$/.test(body.value))) {
        return NextResponse.json(
          createApiResponse(null, 'Реквизит должен содержать ровно 16 цифр'),
          { status: 400 }
        )
      }
      if (body.email !== undefined && !body.email) {
        return NextResponse.json(
          createApiResponse(null, 'Почта обязательна для Demir Bank'),
          { status: 400 }
        )
      }
      if (body.password !== undefined && body.password !== '' && !body.password) {
        return NextResponse.json(
          createApiResponse(null, 'Пароль обязателен для Demir Bank'),
          { status: 400 }
        )
      }
    } else if (body.bank === 'Bakai') {
      if (body.hash !== undefined && !body.hash) {
        return NextResponse.json(
          createApiResponse(null, 'Hash обязателен для Bakai'),
          { status: 400 }
        )
      }
      if (body.name !== undefined && !body.name) {
        return NextResponse.json(
          createApiResponse(null, 'Название обязательно для Bakai'),
          { status: 400 }
        )
      }
    }

    // If setting as active, deactivate others
    if (body.isActive) {
      await prisma.botRequisite.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      })
    }

    const updateData: any = {}
    if (body.value !== undefined) {
      updateData.value = body.bank === 'Demir Bank' ? body.value : null
    }
    if (body.name !== undefined) updateData.name = body.name
    if (body.email !== undefined) {
      updateData.email = body.bank === 'Demir Bank' ? body.email : null
    }
    // Обновляем пароль только если он передан и не пустой
    if (body.password !== undefined && body.password !== '') {
      updateData.password = body.bank === 'Demir Bank' ? body.password : null
    }
    if (body.bank !== undefined) updateData.bank = body.bank
    if (body.hash !== undefined) {
      updateData.hash = body.bank === 'Bakai' ? body.hash : null
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

