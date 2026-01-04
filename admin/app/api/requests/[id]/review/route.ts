import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

const formatDateTime = (value?: string | Date | null) => {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(d.getTime())) return '—'
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${day}.${month}.${year} • ${hours}:${minutes}`
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    requireAuth(request)

    const id = parseInt(params.id, 10)
    if (Number.isNaN(id)) {
      return NextResponse.json(createApiResponse(null, 'Invalid id'), { status: 400 })
    }

    const existing = await prisma.request.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(createApiResponse(null, 'Request not found'), { status: 404 })
    }

    const updated = await prisma.request.update({
      where: { id },
      data: {
        status: 'pending',
        statusDetail: 'pending_check',
      },
    })

    // Уведомление пользователю через основной бот (не оператор-бот)
    try {
      const { sendMessageWithMainMenuButton, getBotTypeByUserLastMessage } = await import('@/lib/send-notification')
      
      // Определяем botType по последнему сообщению пользователя
      let botType: string | null = null
      try {
        botType = await getBotTypeByUserLastMessage(updated.userId, updated.createdAt)
      } catch (error) {
        console.warn('Failed to get botType, using bookmaker:', error)
      }
      
      const amount = updated.amount?.toString() || '0'
      const accountId = updated.accountId || '—'
      
      const notificationMessage = [
        `Оператор отправил на проверку вашу заявку`,
        `Сумма: ${amount} KGS`,
        `ID: ${accountId}`,
        ``,
        `Время проверки до 3х часов`,
      ].join('\n')
      
      await sendMessageWithMainMenuButton(
        updated.userId,
        notificationMessage,
        updated.bookmaker,
        botType
      )
      console.log(`✅ Notification sent to user ${updated.userId.toString()} about request ${updated.id} sent to review`)
    } catch (error: any) {
      console.error('Failed to send review notification:', error)
      // Не прерываем выполнение, если уведомление не отправилось
    }

    return NextResponse.json(
      createApiResponse({
        request: {
          ...updated,
          userId: updated.userId.toString(),
          amount: updated.amount?.toString() || '0',
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        },
      })
    )
  } catch (error: any) {
    console.error('requests/[id]/review error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to send request to review'),
      { status: 500 }
    )
  }
}


