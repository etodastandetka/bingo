import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createApiResponse } from '@/lib/api-helpers'
import { ensureUserExists } from '@/lib/sync-user'

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

    console.log(`[open-operator-chat PATCH] Received request, token: ${token ? token.substring(0, 10) + '...' : 'missing'}, expected: ${expected ? expected.substring(0, 10) + '...' : 'missing'}`)

    if (!expected || !token || token !== expected) {
      console.error(`[open-operator-chat PATCH] Unauthorized! Token mismatch. Expected: ${expected}, Got: ${token}`)
      return NextResponse.json(createApiResponse(null, 'Unauthorized'), { status: 401 })
    }

    const body = await request.json()
    const { userId, isClosed } = body || {}

    console.log(`[open-operator-chat PATCH] Body: userId=${userId}, isClosed=${isClosed}`)

    if (!userId) {
      return NextResponse.json(createApiResponse(null, 'User ID is required'), { status: 400 })
    }

    const userIdBigInt = BigInt(userId)

    // Убеждаемся, что пользователь существует в BotUser перед созданием BotUserData
    // Это необходимо для соблюдения внешнего ключа (foreign key constraint)
    await ensureUserExists(userIdBigInt)

    const result = await prisma.botUserData.upsert({
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

    console.log(`[open-operator-chat PATCH] Successfully updated chat status for user ${userId}: ${result.dataValue}`)

    return NextResponse.json(createApiResponse({ success: true, dataValue: result.dataValue }))
  } catch (error: any) {
    console.error('[open-operator-chat PATCH] Error:', error)
    return NextResponse.json(createApiResponse(null, error.message || 'Failed to update chat status'), { status: 500 })
  }
}

