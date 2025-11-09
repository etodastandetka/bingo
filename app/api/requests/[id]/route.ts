import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    requireAuth(request)

    const id = parseInt(params.id)

    const requestData = await prisma.request.findUnique({
      where: { id },
      include: {
        incomingPayments: true,
      },
    })

    if (!requestData) {
      return NextResponse.json(
        createApiResponse(null, 'Request not found'),
        { status: 404 }
      )
    }

    // Получаем все входящие платежи с совпадающей суммой (по целой части)
    // Если заявка на 100.23, показываем все платежи на 100.XX
    let matchingPayments: any[] = []
    if (requestData.amount) {
      const requestAmountInt = Math.floor(parseFloat(requestData.amount.toString()))
      
      // Получаем все платежи с той же целой частью суммы
      const allPayments = await prisma.incomingPayment.findMany({
        where: {
          amount: {
            gte: requestAmountInt,
            lt: requestAmountInt + 1,
          },
        },
        orderBy: { paymentDate: 'desc' },
        take: 50,
      })

      matchingPayments = allPayments.map(p => ({
        ...p,
        amount: p.amount.toString(),
      }))
    }

    // Получаем все транзакции по accountId (ID казино), если он есть
    // Включаем все заявки с таким же accountId и букмекером от всех пользователей
    let casinoTransactions: any[] = []
    if (requestData.accountId) {
      casinoTransactions = await prisma.request.findMany({
        where: {
          accountId: requestData.accountId,
          bookmaker: requestData.bookmaker, // Также фильтруем по букмекеру для точности
        },
        orderBy: { createdAt: 'desc' },
        take: 100, // Лимит на количество транзакций
        select: {
          id: true,
          userId: true,
          username: true,
          firstName: true,
          lastName: true,
          amount: true,
          requestType: true,
          status: true,
          createdAt: true,
          bookmaker: true,
          accountId: true,
        },
      })
    }

    // Получаем заметку пользователя
    const user = await prisma.botUser.findUnique({
      where: { userId: requestData.userId },
      select: { note: true },
    })

    return NextResponse.json(
      createApiResponse({
        ...requestData,
        userId: requestData.userId.toString(), // Преобразуем BigInt в строку
        amount: requestData.amount ? requestData.amount.toString() : null,
        photoFileUrl: requestData.photoFileUrl, // Фото чека (base64 или URL)
        userNote: user?.note || null, // Заметка пользователя
        incomingPayments: requestData.incomingPayments.map(p => ({
          ...p,
          amount: p.amount.toString(),
        })),
        matchingPayments, // Все платежи с совпадающей суммой (по целой части)
        casinoTransactions: casinoTransactions.map(t => ({
          ...t,
          userId: t.userId.toString(),
          amount: t.amount ? t.amount.toString() : null,
        })),
      })
    )
  } catch (error: any) {
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to fetch request'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    requireAuth(request)

    const id = parseInt(params.id)
    const body = await request.json()

    const updateData: any = {}
    if (body.status) updateData.status = body.status
    if (body.statusDetail) updateData.statusDetail = body.statusDetail
    if (body.processedAt !== undefined) {
      updateData.processedAt = body.processedAt ? new Date(body.processedAt) : null
    }

    if (body.status && ['completed', 'rejected', 'approved'].includes(body.status)) {
      updateData.processedAt = new Date()
    }

    const updatedRequest = await prisma.request.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(
      createApiResponse({
        ...updatedRequest,
        amount: updatedRequest.amount ? updatedRequest.amount.toString() : null,
      })
    )
  } catch (error: any) {
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to update request'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

