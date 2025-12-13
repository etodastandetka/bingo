import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'
import { sendNotificationToUser, formatDepositMessage, formatWithdrawMessage, formatRejectMessage, getAdminUsername, editNotificationMessage } from '@/lib/send-notification'

// Отключаем кеширование для актуальных данных
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

    // Получаем заметку пользователя (не блокируем основной запрос)
    const user = await prisma.botUser.findUnique({
      where: { userId: requestData.userId },
      select: { note: true },
    }).catch(() => null)
    const userNote = user?.note || null

    if (!requestData) {
      return NextResponse.json(
        createApiResponse(null, 'Request not found'),
        { status: 404 }
      )
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
        take: 50, // Уменьшен лимит для оптимизации
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
          bank: true,
        },
      })
    }

    return NextResponse.json(
      createApiResponse({
        ...requestData,
        userId: requestData.userId.toString(), // Преобразуем BigInt в строку
        amount: requestData.amount ? requestData.amount.toString() : null,
        photoFileUrl: requestData.photoFileUrl, // Фото чека (base64 или URL)
        userNote: userNote, // Заметка пользователя
        createdAt: requestData.createdAt.toISOString(),
        updatedAt: requestData.updatedAt.toISOString(),
        processedAt: requestData.processedAt ? requestData.processedAt.toISOString() : null,
        incomingPayments: requestData.incomingPayments.map(p => ({
          ...p,
          amount: p.amount.toString(),
          paymentDate: p.paymentDate ? p.paymentDate.toISOString() : null,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        })),
        casinoTransactions: casinoTransactions.map(t => ({
          ...t,
          userId: t.userId.toString(),
          amount: t.amount ? t.amount.toString() : null,
          createdAt: t.createdAt.toISOString(),
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
    const authUser = requireAuth(request)

    const id = parseInt(params.id)
    const body = await request.json()

    const updateData: any = {}
    if (body.status) updateData.status = body.status
    if (body.statusDetail) updateData.statusDetail = body.statusDetail
    if (body.amount) updateData.amount = parseFloat(body.amount)
    if (body.bookmaker !== undefined) updateData.bookmaker = body.bookmaker
    if (body.processedAt !== undefined) {
      updateData.processedAt = body.processedAt ? new Date(body.processedAt) : null
    }

    // Получаем текущую заявку для сравнения статуса
    const currentRequest = await prisma.request.findUnique({
      where: { id },
    })

    if (!currentRequest) {
      return NextResponse.json(
        createApiResponse(null, 'Request not found'),
        { status: 404 }
      )
    }

    if (body.status && ['completed', 'rejected', 'approved'].includes(body.status)) {
      updateData.processedAt = new Date()
      // Сохраняем логин админа, который обработал заявку
      updateData.processedByUsername = authUser.username
    }

    const updatedRequest = await prisma.request.update({
      where: { id },
      data: updateData,
    })

    // Отправляем уведомления при изменении статуса
    if (body.status && body.status !== currentRequest.status) {
      try {
        // Получаем язык пользователя
        const user = await prisma.botUser.findUnique({
          where: { userId: currentRequest.userId },
          select: { language: true },
        }).catch(() => null)
        const lang = user?.language || 'ru'

        // Получаем username админа
        const adminUsername = await getAdminUsername()

        let notificationMessage: string | null = ''

        if (['completed', 'approved', 'auto_completed', 'autodeposit_success'].includes(body.status)) {
          // Успешное пополнение или вывод
          const amount = updatedRequest.amount ? parseFloat(updatedRequest.amount.toString()) : 0
          const casino = updatedRequest.bookmaker || 'Неизвестно'
          const accountId = updatedRequest.accountId || ''

          if (currentRequest.requestType === 'deposit') {
            notificationMessage = formatDepositMessage(amount, casino, accountId, adminUsername, lang)
          } else {
            notificationMessage = formatWithdrawMessage(amount, casino, accountId, adminUsername, lang)
          }
          
          // Если есть сохраненное message_id, редактируем сообщение вместо отправки нового
          if (currentRequest.notificationMessageId) {
            try {
              const { editNotificationMessage } = await import('@/lib/send-notification')
              const editResult = await editNotificationMessage(
                currentRequest.userId,
                currentRequest.notificationMessageId,
                notificationMessage
              )
              if (editResult.success) {
                console.log(`✅ Notification message edited for request ${currentRequest.id}`)
                notificationMessage = null // Не отправляем новое сообщение
              } else {
                console.warn(`⚠️ Failed to edit notification, will send new message: ${editResult.error}`)
                // Если редактирование не удалось, отправляем новое сообщение
              }
            } catch (editError) {
              console.error('Error editing notification:', editError)
              // Если редактирование не удалось, отправляем новое сообщение
            }
          }
          
          // Сообщение в оператор-боте
          sendOperatorMessage(
            updatedRequest.userId,
            [
              `✅ Оператор подтвердил вашу заявку #${updatedRequest.id}.`,
              `💰 Сумма: ${updatedRequest.amount?.toString() || '0'}`,
              `🟢 Статус: Успешно`,
              `🗓 Создано: ${formatDateTime(updatedRequest.createdAt)}`,
              `⏱ Подтверждено: ${formatDateTime(new Date())}`,
            ].join('\n')
          )
        } else if (['rejected', 'declined'].includes(body.status)) {
          // Отклонение заявки
          notificationMessage = formatRejectMessage(currentRequest.requestType, adminUsername, lang)
          sendOperatorMessage(
            updatedRequest.userId,
            [
              `❌ Оператор отклонил вашу заявку #${updatedRequest.id}.`,
              `💰 Сумма: ${updatedRequest.amount?.toString() || '0'}`,
              `🔴 Статус: Отклонено`,
              `🗓 Создано: ${formatDateTime(updatedRequest.createdAt)}`,
              `⏱ Отклонено: ${formatDateTime(new Date())}`,
            ].join('\n')
          )
        } else if (body.status === 'pending' && updatedRequest.statusDetail === 'pending_check') {
          // Статус "на проверке" (если выставляется через PATCH)
          sendOperatorMessage(
            updatedRequest.userId,
            [
              `📨 Оператор отправил вашу заявку #${updatedRequest.id} на проверку.`,
              `💰 Сумма: ${updatedRequest.amount?.toString() || '0'}`,
              `🟡 Статус: На проверке`,
              `🗓 Создано: ${formatDateTime(updatedRequest.createdAt)}`,
              `⏳ Отправлено на проверку: ${formatDateTime(new Date())}`,
            ].join('\n')
          )
        }

        if (notificationMessage) {
          // Отправляем уведомление асинхронно (не блокируем ответ)
          sendNotificationToUser(currentRequest.userId, notificationMessage).catch((error) => {
            console.error('Failed to send notification:', error)
          })
        }
      } catch (error) {
        // Игнорируем ошибки отправки уведомлений, чтобы не блокировать обновление заявки
        console.error('Error sending notification:', error)
      }
    }

    return NextResponse.json(
      createApiResponse({
        ...updatedRequest,
        userId: updatedRequest.userId.toString(), // Преобразуем BigInt в строку
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

