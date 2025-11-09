import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createApiResponse } from '@/lib/api-helpers'

// API для создания заявок из внешних источников (мини-приложение, бот и т.д.)
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const {
      userId,
      user_id,
      telegram_user_id,
      playerId,
      type, // deposit/withdraw
      amount,
      bookmaker,
      bank,
      phone,
      account_id,
      telegram_username,
      telegram_first_name,
      telegram_last_name,
      receipt_photo, // base64 строка фото чека
      withdrawal_code, // код вывода с сайта казино
    } = body

    // Определяем user_id (пробуем разные варианты)
    // Приоритет: telegram_user_id > userId > user_id > playerId
    const finalUserId = telegram_user_id || userId || user_id || playerId
    const finalAccountId = account_id || user_id || userId || playerId

    console.log('📝 Payment API - Creating request:', {
      telegram_user_id,
      userId,
      user_id,
      playerId,
      finalUserId,
      type,
      amount,
      bookmaker,
      bank
    })

    // Если user_id не передан, используем playerId как userId (для тестирования)
    // Но лучше использовать telegram_user_id если он доступен
    if (!finalUserId || !type || !amount) {
      console.error('❌ Payment API: Missing required fields', { 
        userId, 
        user_id, 
        telegram_user_id, 
        playerId, 
        type, 
        amount 
      })
      const errorResponse = NextResponse.json(
        createApiResponse(null, 'Missing required fields: userId, type, amount'),
        { 
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
          }
        }
      )
      return errorResponse
    }

    // Преобразуем userId в BigInt (если это строка с числом)
    let userIdBigInt: bigint
    try {
      if (typeof finalUserId === 'string') {
        userIdBigInt = BigInt(finalUserId)
      } else {
        userIdBigInt = BigInt(finalUserId)
      }
    } catch (e) {
      console.error('❌ Payment API: Invalid userId format', finalUserId, e)
      const errorResponse = NextResponse.json(
        createApiResponse(null, 'Invalid userId format'),
        { 
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
          }
        }
      )
      return errorResponse
    }

    console.log('💾 Payment API - Saving to database:', {
      userId: userIdBigInt.toString(),
      username: telegram_username,
      firstName: telegram_first_name,
      type,
      amount: parseFloat(amount),
      bookmaker,
      bank,
      phone,
      account_id: finalAccountId?.toString(),
      withdrawal_code: withdrawal_code ? '***' : null, // Не логируем сам код
      has_receipt_photo: !!receipt_photo
    })

    const newRequest = await prisma.request.create({
      data: {
        userId: userIdBigInt,
        username: telegram_username,
        firstName: telegram_first_name,
        lastName: telegram_last_name,
        bookmaker,
        accountId: finalAccountId?.toString(),
        amount: parseFloat(amount),
        requestType: type,
        bank,
        phone,
        status: 'pending',
        photoFileUrl: receipt_photo || null, // Сохраняем base64 фото чека
        withdrawalCode: withdrawal_code || null, // Сохраняем код вывода
      },
    })

    console.log('✅ Payment API - Request created successfully:', {
      id: newRequest.id,
      userId: newRequest.userId.toString(),
      type: newRequest.requestType,
      status: newRequest.status,
      amount: newRequest.amount?.toString()
    })

    const response = NextResponse.json(
      createApiResponse({
        id: newRequest.id,
        transactionId: newRequest.id,
        message: 'Заявка успешно создана',
      })
    )
    response.headers.set('Access-Control-Allow-Origin', '*')
    return response
  } catch (error: any) {
    console.error('Payment API error:', error)
    const errorResponse = NextResponse.json(
      createApiResponse(null, error.message || 'Failed to create request'),
      { status: 500 }
    )
    errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return errorResponse
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, status, status_detail } = body

    if (!id || !status) {
      const response = NextResponse.json(
        createApiResponse(null, 'Missing required fields: id, status'),
        { status: 400 }
      )
      response.headers.set('Access-Control-Allow-Origin', '*')
      return response
    }

    const updateData: any = {
      status,
    }

    if (status_detail) {
      updateData.statusDetail = status_detail
    }

    if (['completed', 'rejected', 'approved'].includes(status)) {
      updateData.processedAt = new Date()
    }

    const updatedRequest = await prisma.request.update({
      where: { id: parseInt(id) },
      data: updateData,
    })

    const response = NextResponse.json(
      createApiResponse({
        ...updatedRequest,
        amount: updatedRequest.amount ? updatedRequest.amount.toString() : null,
      })
    )
    response.headers.set('Access-Control-Allow-Origin', '*')
    return response
  } catch (error: any) {
    console.error('Payment API update error:', error)
    const errorResponse = NextResponse.json(
      createApiResponse(null, error.message || 'Failed to update request'),
      { status: 500 }
    )
    errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return errorResponse
  }
}

