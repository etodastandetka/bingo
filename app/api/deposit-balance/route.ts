import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { depositToCasino } from '@/lib/deposit-balance'
import { sendDepositSuccessNotification } from '@/lib/telegram-notifications'

export const dynamic = 'force-dynamic'

// API для пополнения баланса игрока
export async function POST(request: NextRequest) {
  try {
    requireAuth(request)

    const body = await request.json()
    const { requestId, bookmaker, accountId, amount } = body

    if (!requestId || !bookmaker || !accountId || !amount) {
      return NextResponse.json(
        createApiResponse(null, 'Missing required fields: requestId, bookmaker, accountId, amount'),
        { status: 400 }
      )
    }

    // Получаем заявку
    const requestData = await prisma.request.findUnique({
      where: { id: parseInt(requestId) },
    })

    if (!requestData) {
      return NextResponse.json(
        createApiResponse(null, 'Request not found'),
        { status: 404 }
      )
    }

    // ВАЖНО: Используем accountId (ID казино), а не userId (Telegram ID)
    // accountId - это ID игрока в казино (например, ID счета 1xbet, Melbet и т.д.)
    console.log(`[Deposit Balance] Bookmaker: ${bookmaker}, Casino Account ID: ${accountId}, Amount: ${amount}, Request ID: ${requestId}`)
    
    // Пополняем баланс через API казино
    const depositResult = await depositToCasino(bookmaker, accountId, parseFloat(amount))

    if (!depositResult.success) {
      console.error(`[Deposit Balance] Failed for ${bookmaker}, accountId: ${accountId}`, depositResult)
      return NextResponse.json(
        createApiResponse(null, depositResult.message || 'Failed to deposit balance'),
        { status: 500 }
      )
    }
    
    console.log(`[Deposit Balance] Success for ${bookmaker}, accountId: ${accountId}`, depositResult)

    // Обновляем статус заявки на completed
    const updatedRequest = await prisma.request.update({
      where: { id: parseInt(requestId) },
      data: {
        status: 'completed',
        processedAt: new Date(),
      },
    })

    // Отправляем уведомление пользователю
    if (requestData.userId && requestData.bookmaker && requestData.accountId && requestData.amount) {
      await sendDepositSuccessNotification(
        requestData.userId,
        parseFloat(requestData.amount.toString()),
        requestData.bookmaker,
        requestData.accountId
      )
    }

    return NextResponse.json(
      createApiResponse({
        success: true,
        message: depositResult.message,
        request: {
          ...updatedRequest,
          amount: updatedRequest.amount ? updatedRequest.amount.toString() : null,
        },
      })
    )
  } catch (error: any) {
    console.error('Deposit balance API error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to deposit balance'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

