import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const referrerId = body.referrer_id || body.referrerId
    const referredId = body.referred_id || body.referredId
    const username = body.username || null
    const firstName = body.first_name || body.firstName || null
    const lastName = body.last_name || body.lastName || null
    
    if (!referrerId || !referredId) {
      const errorResponse = NextResponse.json({
        success: false,
        error: 'Referrer ID and Referred ID are required'
      }, { status: 400 })
      errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return errorResponse
    }
    
    const referrerIdBigInt = BigInt(referrerId)
    const referredIdBigInt = BigInt(referredId)
    
    // Нельзя быть рефералом самого себя
    if (referrerIdBigInt === referredIdBigInt) {
      const errorResponse = NextResponse.json({
        success: false,
        error: 'Cannot refer yourself'
      }, { status: 400 })
      errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return errorResponse
    }
    
    // Проверяем, существует ли уже реферальная связь
    const existingReferral = await prisma.botReferral.findUnique({
      where: {
        referredId: referredIdBigInt
      }
    })
    
    if (existingReferral) {
      // Если уже есть реферал, но от другого рефера, возвращаем ошибку
      if (existingReferral.referrerId.toString() !== referrerId) {
        const errorResponse = NextResponse.json({
          success: false,
          error: 'User already referred by another user'
        }, { status: 400 })
        errorResponse.headers.set('Access-Control-Allow-Origin', '*')
        return errorResponse
      }
      // Если уже привязан к этому же рефералу, возвращаем успех
      const successResponse = NextResponse.json({
        success: true,
        message: 'Referral already exists',
        referral_id: existingReferral.id
      })
      successResponse.headers.set('Access-Control-Allow-Origin', '*')
      return successResponse
    }
    
    // Проверяем, существует ли рефер (тот, кто приглашает)
    let referrer = await prisma.botUser.findUnique({
      where: { userId: referrerIdBigInt }
    })
    
    // Если рефера нет в БД, создаем его
    if (!referrer) {
      referrer = await prisma.botUser.create({
        data: {
          userId: referrerIdBigInt,
          username: null,
          firstName: null,
          lastName: null,
          language: 'ru'
        }
      })
    }
    
    // Проверяем, существует ли реферал (тот, кого приглашают)
    let referred = await prisma.botUser.findUnique({
      where: { userId: referredIdBigInt }
    })
    
    // Если реферала нет в БД, создаем его
    if (!referred) {
      referred = await prisma.botUser.create({
        data: {
          userId: referredIdBigInt,
          username: username,
          firstName: firstName,
          lastName: lastName,
          language: 'ru'
        }
      })
    } else {
      // Обновляем данные пользователя, если они есть
      if (username || firstName || lastName) {
        await prisma.botUser.update({
          where: { userId: referredIdBigInt },
          data: {
            username: username || referred.username,
            firstName: firstName || referred.firstName,
            lastName: lastName || referred.lastName
          }
        })
      }
    }
    
    // Создаем реферальную связь
    const referral = await prisma.botReferral.create({
      data: {
        referrerId: referrerIdBigInt,
        referredId: referredIdBigInt
      }
    })
    
    const response = NextResponse.json({
      success: true,
      message: 'Referral registered successfully',
      referral_id: referral.id
    })
    response.headers.set('Access-Control-Allow-Origin', '*')
    return response
    
  } catch (error: any) {
    console.error('Referral register error:', error)
    const errorResponse = NextResponse.json({
      success: false,
      error: error.message || 'Failed to register referral'
    }, { status: 500 })
    errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return errorResponse
  }
}

export const dynamic = 'force-dynamic'

