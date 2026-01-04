import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createApiResponse } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('x-operator-token')
    const expected = process.env.OPERATOR_SERVICE_TOKEN || 'dev-operator-token'

    if (!expected || !token || token !== expected) {
      return NextResponse.json(createApiResponse(null, 'Unauthorized'), { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(createApiResponse(null, 'User ID is required'), { status: 400 })
    }

    const userIdBigInt = BigInt(userId)

    const chatStatus = await prisma.botUserData.findUnique({
      where: {
        userId_dataType: {
          userId: userIdBigInt,
          dataType: 'operator_chat_status',
        },
      },
      select: {
        dataValue: true,
      },
    })

    const isClosed = chatStatus?.dataValue === 'closed'

    return NextResponse.json(createApiResponse({ isClosed }))
  } catch (error: any) {
    console.error('get-operator-chat-status error:', error)
    return NextResponse.json(createApiResponse(null, error.message || 'Failed to get chat status'), { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const token = request.headers.get('x-operator-token')
    const expected = process.env.OPERATOR_SERVICE_TOKEN || 'dev-operator-token'

    if (!expected || !token || token !== expected) {
      return NextResponse.json(createApiResponse(null, 'Unauthorized'), { status: 401 })
    }

    const body = await request.json()
    const { userId, isClosed } = body || {}

    if (!userId) {
      return NextResponse.json(createApiResponse(null, 'User ID is required'), { status: 400 })
    }

    const userIdBigInt = BigInt(userId)

    await prisma.botUserData.upsert({
      where: {
        userId_dataType: {
          userId: userIdBigInt,
          dataType: 'operator_chat_status',
        },
      },
      update: {
        dataValue: isClosed ? 'closed' : 'open',
      },
      create: {
        userId: userIdBigInt,
        dataType: 'operator_chat_status',
        dataValue: isClosed ? 'closed' : 'open',
      },
    })

    return NextResponse.json(createApiResponse({ success: true }))
  } catch (error: any) {
    console.error('open-operator-chat error:', error)
    return NextResponse.json(createApiResponse(null, error.message || 'Failed to update chat status'), { status: 500 })
  }
}

