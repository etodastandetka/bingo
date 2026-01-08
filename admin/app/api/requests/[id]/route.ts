import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'
import { sendNotificationToUser, formatDepositMessage, formatWithdrawMessage, formatRejectMessage, getAdminUsername, sendMainMenuToUser } from '@/lib/send-notification'
import { formatDateTimeBishkek } from '@/lib/date-utils'

// Отключаем кеширование для актуальных данных
export const dynamic = 'force-dynamic'

// Увеличиваем таймаут для больших изображений
export const maxDuration = 60

const formatDateTime = formatDateTimeBishkek

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
      // Явно указываем, что нужно загрузить photoFileUrl
      // Это важно для больших base64 строк
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

    // Логируем размер photoFileUrl для диагностики
    const photoSize = requestData.photoFileUrl ? requestData.photoFileUrl.length : 0
    if (photoSize > 0) {
      console.log(`📸 [Request ${id}] Photo size: ${photoSize} bytes (${(photoSize / 1024).toFixed(2)} KB)`)
    }

    return NextResponse.json(
      createApiResponse({
        ...requestData,
        userId: requestData.userId.toString(), // Преобразуем BigInt в строку
        amount: requestData.amount ? requestData.amount.toString() : null,
        // Если photoFileUrl очень большой, возвращаем null и предлагаем загрузить через отдельный endpoint
        // Это предотвращает обрезание ответа Next.js
        photoFileUrl: photoSize > 1000000 ? null : requestData.photoFileUrl, // Фото чека (base64 или URL) - если > 1MB, загружаем через отдельный endpoint
        withdrawalCode: requestData.withdrawalCode, // Код вывода
        userNote: userNote, // Заметка пользователя
        processedBy: requestData.processedBy, // Кто обработал заявку (автопополнение или админ)
        createdAt: requestData.createdAt.toISOString(),
        updatedAt: requestData.updatedAt.toISOString(),
        processedAt: requestData.processedAt ? requestData.processedAt.toISOString() : null,
        casinoError: requestData.casinoError,
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

    // Получаем текущую заявку для сравнения статуса (включая botType)
    const currentRequest = await prisma.request.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        requestType: true,
        status: true,
        statusDetail: true,
        amount: true,
        bookmaker: true,
        accountId: true,
        bank: true,
        botType: true, // ВАЖНО: включаем botType
        processedBy: true,
        processedAt: true,
        createdAt: true,
        updatedAt: true,
      },
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

    // Если подтверждаем депозит и нет привязанного платежа - создаем поступление
    if (body.status && ['completed', 'approved'].includes(body.status) && 
        currentRequest.requestType === 'deposit' && 
        currentRequest.amount) {
      // Проверяем, есть ли уже привязанные платежи к этой заявке
      const existingPayments = await prisma.incomingPayment.findMany({
        where: {
          requestId: id,
          isProcessed: true,
        },
      })

      // Если нет привязанных платежей - создаем новый
      if (existingPayments.length === 0) {
        try {
          const paymentAmount = parseFloat(currentRequest.amount.toString())
          const newPayment = await prisma.incomingPayment.create({
            data: {
              amount: paymentAmount,
              bank: currentRequest.bank || null,
              paymentDate: new Date(),
              notificationText: `Создано автоматически при подтверждении заявки #${id}`,
              requestId: id,
              isProcessed: true,
            },
          })
          console.log(`✅ Created incoming payment ${newPayment.id} for request ${id} (amount: ${paymentAmount})`)
        } catch (error: any) {
          console.error(`❌ Failed to create incoming payment for request ${id}:`, error)
          // Не прерываем выполнение, если не удалось создать платеж
        }
      }
    }

    // Отправляем уведомления при изменении статуса (асинхронно, не блокируем ответ)
    if (body.status && body.status !== currentRequest.status) {
      // Запускаем отправку уведомлений в фоне, не ждем завершения
      ;(async () => {
        try {
          // Получаем язык пользователя
          const user = await prisma.botUser.findUnique({
            where: { userId: currentRequest.userId },
            select: { language: true },
          }).catch(() => null)
          const lang = user?.language || 'ru'

          // Получаем username админа
          const adminUsername = await getAdminUsername()

        let notificationMessage = ''
        
        // Вычисляем значения для использования в уведомлениях
        const amount = updatedRequest.amount ? parseFloat(updatedRequest.amount.toString()) : 0
        const casino = updatedRequest.bookmaker || 'Неизвестно'
        const accountId = updatedRequest.accountId || ''

        // Проверяем, была ли заявка на проверке (операторская)
        const isOperatorRequest = currentRequest.statusDetail === 'pending_check' || updatedRequest.statusDetail === 'pending_check'

        if (['completed', 'approved', 'auto_completed', 'autodeposit_success'].includes(body.status)) {
          // Успешное пополнение или вывод

          if (currentRequest.requestType === 'deposit') {
            // Для пополнения: если автопополнение - всегда 1s, иначе вычисляем реальное время
            let processingTime: string | null = null
            
            // Проверяем, было ли это автопополнение
            const isAutodeposit = updatedRequest.processedBy === 'автопополнение' || updatedRequest.processedBy === 'autodeposit'
            
            if (isAutodeposit) {
              // Для автопополнения всегда используем 1s
              processingTime = '1s'
            } else {
              // Для ручного подтверждения админом вычисляем реальное время
              if (updatedRequest.createdAt && updatedRequest.processedAt) {
                const createdAt = new Date(updatedRequest.createdAt)
                const processedAt = new Date(updatedRequest.processedAt)
                const diffMs = processedAt.getTime() - createdAt.getTime()
                
                if (diffMs > 0) {
                  const diffSeconds = Math.floor(diffMs / 1000)
                  const diffMinutes = Math.floor(diffSeconds / 60)
                  const diffHours = Math.floor(diffMinutes / 60)
                  
                  if (diffHours > 0) {
                    processingTime = `${diffHours} Hour${diffHours > 1 ? 's' : ''}`
                  } else if (diffMinutes > 0) {
                    const remainingSeconds = diffSeconds % 60
                    if (remainingSeconds > 0) {
                      processingTime = `${diffMinutes} Minute${diffMinutes > 1 ? 's' : ''} ${remainingSeconds}s`
                    } else {
                      processingTime = `${diffMinutes} Minute${diffMinutes > 1 ? 's' : ''}`
                    }
                  } else {
                    processingTime = `${diffSeconds}s`
                  }
                }
              }
              
              // Если время не вычислено (fallback) - используем 1s
              if (!processingTime) {
                processingTime = '1s'
              }
            }
            
            notificationMessage = formatDepositMessage(amount, casino, accountId, adminUsername, lang, processingTime)
          } else {
            // Для вывода используем новый формат с временем обработки и банком
            // Вычисляем время обработки
            let processingTime: string | null = null
            if (updatedRequest.createdAt && updatedRequest.processedAt) {
              const createdAt = new Date(updatedRequest.createdAt)
              const processedAt = new Date(updatedRequest.processedAt)
              const diffMs = processedAt.getTime() - createdAt.getTime()
              
              if (diffMs > 0) {
                const diffSeconds = Math.floor(diffMs / 1000)
                const diffMinutes = Math.floor(diffSeconds / 60)
                const diffHours = Math.floor(diffMinutes / 60)
                
                if (diffHours > 0) {
                  processingTime = `${diffHours} Hour${diffHours > 1 ? 's' : ''}`
                } else if (diffMinutes > 0) {
                  const remainingSeconds = diffSeconds % 60
                  if (remainingSeconds > 0) {
                    processingTime = `${diffMinutes} Minute${diffMinutes > 1 ? 's' : ''} ${remainingSeconds}s`
                  } else {
                    processingTime = `${diffMinutes} Minute${diffMinutes > 1 ? 's' : ''}`
                  }
                } else {
                  processingTime = `${diffSeconds}s`
                }
              }
            }
            
            // Если автопополнение или время не вычислено - используем 1s
            if (!processingTime || updatedRequest.processedBy === 'автопополнение' || updatedRequest.processedBy === 'autodeposit') {
              processingTime = '1s'
            }
            
            notificationMessage = formatWithdrawMessage(
              amount, 
              casino, 
              accountId, 
              adminUsername, 
              lang,
              processingTime,
              updatedRequest.bank
            )
          }

          // Если это операторская заявка (была на проверке) - отправляем в оператор-бот и в основной бот БЕЗ кнопки
          if (isOperatorRequest) {
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
            
            // Для операторских заявок отправляем сообщение в правильный бот БЕЗ инлайн кнопки
            // ВАЖНО: Используем ТОЛЬКО botType из заявки, НЕ определяем из bookmaker
            // Если заявка создана в основном боте, но bookmaker = "1xbet", уведомление должно идти в основной бот
            let botType = (updatedRequest as any).botType || (currentRequest as any).botType || 'main'
            
            console.log(`[Operator Request] Using botType from request: ${botType} (not from bookmaker ${updatedRequest.bookmaker})`)
            
            if (notificationMessage) {
              // Отправляем сообщение БЕЗ инлайн кнопки "Главное меню"
              sendNotificationToUser(currentRequest.userId, notificationMessage, updatedRequest.bookmaker, null, botType)
                .catch((error) => {
                  console.error('Failed to send notification for operator request:', error)
                })
            }
          }
          // Автопополнение теперь работает через Email Watcher
          // Не нужно останавливать watcher, так как он больше не используется для отдельных заявок
          
          // Для обычных заявок (не операторских) notificationMessage отправится в правильный бот ниже
          // Бот определяется на основе updatedRequest.bookmaker
        } else if (['rejected', 'declined'].includes(body.status)) {
          // Автопополнение теперь работает через Email Watcher
          // Не нужно останавливать watcher, так как он больше не используется для отдельных заявок
          
          // Отклонение заявки - уведомление отправится в правильный бот на основе bookmaker
          notificationMessage = formatRejectMessage(currentRequest.requestType, adminUsername, lang)
          
          // Если это операторская заявка (была на проверке) - отправляем только в оператор-бот
          if (isOperatorRequest) {
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
          }
          // Для обычных заявок (не операторских) notificationMessage отправится в основной бот ниже
        } else if (body.status === 'pending' && updatedRequest.statusDetail === 'pending_check') {
          // Статус "на проверке" (если выставляется через PATCH) - отправляем через оператор-бот БЕЗ инлайн кнопки
          try {
            const amount = updatedRequest.amount?.toString() || '0'
            const accountId = updatedRequest.accountId || '—'
            
            const notificationMessage = [
              `Оператор отправил на проверку вашу заявку`,
              `Сумма: ${amount} KGS`,
              `ID: ${accountId}`,
              ``,
              `Время проверки до 3х часов`,
            ].join('\n')
            
            // При отправке на проверку используем оператор-бот (botType = 'operator') БЕЗ инлайн кнопки
            await sendNotificationToUser(
              updatedRequest.userId,
              notificationMessage,
              updatedRequest.bookmaker,
              null, // requestId = null, без редактирования сообщений
              'operator' // Всегда используем оператор-бот при отправке на проверку
            )
            console.log(`✅ Notification sent to user ${updatedRequest.userId.toString()} about request ${updatedRequest.id} sent to review via operator bot (without inline button)`)
          } catch (error: any) {
            console.error('❌ Failed to send review notification:', error)
            console.error('Error details:', error.message, error.stack)
            // Не прерываем выполнение, если уведомление не отправилось
          }
        }

        // Отправляем уведомление в правильный бот только если это не операторская заявка
        // и есть сообщение для отправки
        // ВАЖНО: Бот определяется ТОЛЬКО на основе botType из заявки, НЕ из bookmaker
        // Если заявка создана в основном боте, но bookmaker = "1xbet", уведомление должно идти в основной бот
        if (notificationMessage && !isOperatorRequest) {
          // Получаем botType из заявки для правильной отправки уведомлений
          // Сначала проверяем updatedRequest, затем currentRequest
          // Если botType не найден, используем 'main' (основной бот) по умолчанию
          let botType = (updatedRequest as any).botType || (currentRequest as any).botType || 'main'
          
          console.log(`[Request Update] Using botType from request: ${botType} (bookmaker: ${updatedRequest.bookmaker})`)
          
          // Для отклоненных заявок отправляем новое сообщение с кнопкой "Главное меню" (НЕ удаляем старое сообщение)
          if (['rejected', 'declined'].includes(body.status)) {
            const { sendMessageWithMainMenuButton } = await import('@/lib/send-notification')
            
            // Отправляем сообщение об отклонении с инлайн кнопкой "Главное меню"
            // Используем botType из заявки для определения правильного бота
            // НЕ удаляем старое сообщение "Ваша заявка отправлена" - оно должно остаться
            sendMessageWithMainMenuButton(currentRequest.userId, notificationMessage, updatedRequest.bookmaker, botType)
              .catch((error) => {
                console.error('Failed to send rejection notification:', error)
              })
          } else if (currentRequest.requestType === 'withdraw') {
            // Для вывода отправляем финальное сообщение С инлайн кнопкой "Главное меню"
            // Используем botType из заявки для определения правильного бота
            const { sendMessageWithMainMenuButton } = await import('@/lib/send-notification')
            sendMessageWithMainMenuButton(currentRequest.userId, notificationMessage, updatedRequest.bookmaker, botType)
              .catch((error) => {
                console.error('Failed to send withdrawal notification:', error)
              })
          } else {
            // Для пополнения отправляем сообщение с инлайн кнопкой "Главное меню"
            // Используем botType из заявки для определения правильного бота
            const { sendMessageWithMainMenuButton } = await import('@/lib/send-notification')
            sendMessageWithMainMenuButton(currentRequest.userId, notificationMessage, updatedRequest.bookmaker, botType)
              .catch((error) => {
                console.error('Failed to send deposit notification with main menu button:', error)
              })
          }
        }
        } catch (error) {
          // Игнорируем ошибки отправки уведомлений, чтобы не блокировать обновление заявки
          console.error('Error sending notification:', error)
        }
      })() // Запускаем асинхронно, не ждем
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

