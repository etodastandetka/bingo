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

async function sendOperatorMessage(userId: bigint, text: string) {
  try {
    const token = process.env.OPERATOR_BOT_TOKEN
    if (!token) return
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: userId.toString(),
        text,
        parse_mode: 'HTML',
        protect_content: true,
      }),
    })
    const data = await resp.json().catch(() => null)
    if (!resp.ok || !data?.ok) {
      console.error('Operator sendMessage failed', { userId: userId.toString(), status: resp.status, data })
    }
  } catch {}
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

    // Уведомление пользователю через оператор-бота
    sendOperatorMessage(
      updated.userId,
      [
        `📨 Оператор отправил вашу заявку #${updated.id} на проверку.`,
        `💰 Сумма: ${updated.amount?.toString() || '0'}`,
        `🟡 Статус: На проверке`,
        `🗓 Создано: ${formatDateTime(updated.createdAt)}`,
        `⏳ Отправлено на проверку: ${formatDateTime(updated.updatedAt)}`,
      ].join('\n')
    )

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


