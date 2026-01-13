import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createApiResponse } from '@/lib/api-helpers'
import { Prisma } from '@prisma/client'
import { addLog } from '@/lib/logs'

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
    // Логируем сам факт получения запроса
    console.log('📥 Payment API - POST request received')
    addLog('info', '📥 Payment API - POST request received', { timestamp: new Date().toISOString() })
    
    const body = await request.json()
    console.log('📥 Payment API - Request body received:', { 
      hasBody: !!body,
      keys: Object.keys(body || {}),
      telegram_user_id: body?.telegram_user_id,
      amount: body?.amount,
      type: body?.type
    })
    addLog('info', '📥 Payment API - Request body received', { 
      hasBody: !!body,
      keys: Object.keys(body || {}),
      telegram_user_id: body?.telegram_user_id,
      amount: body?.amount,
      type: body?.type
    })

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
      withdrawal_code, // код подтверждения вывода
      uncreated_request_id,
      bot_type, // тип бота (main, mostbet, 1xbet) - передается напрямую из бота
    } = body
    
    // Вспомогательная функция для обработки пустых строк
    const cleanString = (value: any): string | null => {
      if (value === null || value === undefined) return null
      const str = String(value).trim()
      return str === '' ? null : str
    }
    
    // Специальная функция для обработки base64 фото (не обрезаем содержимое, только убираем пробелы по краям)
    const cleanBase64 = (value: any): string | null => {
      if (value === null || value === undefined) return null
      const str = String(value)
      // Убираем только начальные и конечные пробелы/переносы строк
      const trimmed = str.trim()
      // Проверяем, что это не пустая строка и имеет минимальную длину для base64 (минимум 20 символов)
      if (trimmed === '' || trimmed.length < 20) return null
      // Если уже есть префикс data:image, возвращаем как есть
      if (trimmed.startsWith('data:image')) return trimmed
      // Если это чистый base64, добавляем префикс для изображения (определяем тип по первым символам)
      // По умолчанию используем jpeg, но можно определить по содержимому
      return `data:image/jpeg;base64,${trimmed}`
    }

    // Определяем user_id (пробуем разные варианты)
    // Приоритет: telegram_user_id > userId > user_id > playerId
    const finalUserId = telegram_user_id || userId || user_id || playerId
    // ВАЖНО: account_id - это ID казино, НЕ Telegram ID!
    // Не используем user_id/userId/playerId как fallback, так как это Telegram ID, а не ID казино
    const finalAccountId = account_id ? String(account_id).trim() : null
    // Обрабатываем номер телефона так же, как accountId
    const finalPhone = phone ? String(phone).trim() : null

    // Валидация типа - должен быть 'deposit' или 'withdraw'
    const validType = (type === 'deposit' || type === 'withdraw') ? type : 'deposit'
    
    if (!type || (type !== 'deposit' && type !== 'withdraw')) {
      console.warn('⚠️ Payment API: Invalid or missing type, using "deposit" as default', { receivedType: type })
    }
    
    const logData = {
      telegram_user_id,
      userId,
      user_id,
      playerId,
      finalUserId,
      type,
      validType,
      amount,
      amount_type: typeof amount,
      bookmaker,
      bank,
      account_id,
      has_receipt_photo: !!receipt_photo,
      has_withdrawal_code: !!withdrawal_code,
      withdrawal_code_length: withdrawal_code ? String(withdrawal_code).length : 0
    }
    
    console.log('📝 Payment API - Creating request:', logData)
    addLog('info', '📝 Payment API - Creating request', logData)
    
    // Валидация обязательных полей
    if (!finalUserId) {
      const errorData = { 
        userId, 
        user_id, 
        telegram_user_id, 
        playerId
      }
      console.error('❌ Payment API: Missing userId', errorData)
      addLog('error', '❌ Payment API: Missing userId', errorData)
      
      const errorResponse = NextResponse.json(
        createApiResponse(null, 'Missing required field: userId (telegram_user_id)'),
        { 
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
          }
        }
      )
      return errorResponse
    }

    // Проверяем amount - для deposit должен быть > 0, для withdraw может быть >= 0 (если сумма еще не проверена)
    const amountStr = amount?.toString().trim() || ''
    const amountNum = amountStr ? parseFloat(amountStr) : 0
    
    // Для deposit amount должен быть > 0
    // Для withdraw amount может быть 0 или > 0 (если сумма еще не проверена, она может быть 0)
    if (validType === 'deposit') {
      if (!amount || amount === null || amount === undefined || amount === '' || amountNum <= 0 || isNaN(amountNum)) {
        console.error('❌ Payment API: Missing or invalid amount for deposit', { 
          amount, 
          amountStr, 
          amountNum,
          type: typeof amount 
        })
        const errorResponse = NextResponse.json(
          createApiResponse(null, 'Missing or invalid amount: must be a positive number'),
          { 
            status: 400,
            headers: {
              'Access-Control-Allow-Origin': '*',
            }
          }
        )
        return errorResponse
      }
    } else if (validType === 'withdraw') {
      // Для withdraw проверяем, что amount это валидное число (может быть 0 или > 0)
      if (amount === null || amount === undefined || amount === '' || isNaN(amountNum)) {
        console.error('❌ Payment API: Missing or invalid amount for withdraw', { 
          amount, 
          amountStr, 
          amountNum,
          type: typeof amount 
        })
        const errorResponse = NextResponse.json(
          createApiResponse(null, 'Missing or invalid amount: must be a valid number'),
          { 
            status: 400,
            headers: {
              'Access-Control-Allow-Origin': '*',
            }
          }
        )
        return errorResponse
      }
      // Для withdraw amount может быть 0 (если сумма еще не проверена)
      // Используем 0 как значение по умолчанию
      if (amountNum < 0) {
        console.error('❌ Payment API: Negative amount for withdraw', { amountNum })
        const errorResponse = NextResponse.json(
          createApiResponse(null, 'Amount cannot be negative'),
          { 
            status: 400,
            headers: {
              'Access-Control-Allow-Origin': '*',
            }
          }
        )
        return errorResponse
      }
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

    // Проверка блокировки пользователя по userId (Telegram ID)
    const user = await prisma.botUser.findUnique({
      where: { userId: userIdBigInt },
      select: { isActive: true },
    })

    // Если пользователь существует и заблокирован - отклоняем запрос
    if (user && user.isActive === false) {
      console.log('❌ Payment API: User is blocked', userIdBigInt.toString())
      const errorResponse = NextResponse.json(
        createApiResponse(null, 'Вы заблокированы'),
        { 
          status: 403,
          headers: {
            'Access-Control-Allow-Origin': '*',
          }
        }
      )
      return errorResponse
    }

    // Проверка блокировки по accountId (ID казино)
    // Если этот accountId использовал заблокированный пользователь - блокируем всех
    if (finalAccountId) {
      // Находим всех пользователей, которые использовали этот accountId
      const requestsWithAccountId = await prisma.request.findMany({
        where: {
          accountId: finalAccountId.toString(),
        },
        select: {
          userId: true,
        },
        distinct: ['userId'],
      })

      // Проверяем каждого пользователя на блокировку
      for (const req of requestsWithAccountId) {
        const accountUser = await prisma.botUser.findUnique({
          where: { userId: req.userId },
          select: { isActive: true },
        })

        // Если пользователь существует и заблокирован - блокируем всех, кто пытается использовать этот accountId
        if (accountUser && accountUser.isActive === false) {
          console.log('❌ Payment API: Account ID is blocked due to blocked owner', {
            accountId: finalAccountId,
            ownerUserId: req.userId.toString(),
            attemptingUserId: userIdBigInt.toString(),
          })
          
          // АВТОМАТИЧЕСКАЯ БЛОКИРОВКА: блокируем текущего пользователя, который пытается использовать заблокированный accountId
          try {
            // Получаем данные пользователя из запроса для создания записи
            const currentUserData = await prisma.request.findFirst({
              where: { userId: userIdBigInt },
              orderBy: { createdAt: 'desc' },
              select: {
                username: true,
                firstName: true,
                lastName: true,
              },
            })
            
            await prisma.botUser.upsert({
              where: { userId: userIdBigInt },
              update: {
                isActive: false,
              },
              create: {
                userId: userIdBigInt,
                username: currentUserData?.username || null,
                firstName: currentUserData?.firstName || null,
                lastName: currentUserData?.lastName || null,
                language: 'ru',
                isActive: false,
              },
            })
            console.log(`🔒 Auto-blocked user ${userIdBigInt.toString()} for using blocked accountId ${finalAccountId}`)
            addLog('warn', `🔒 Auto-blocked user ${userIdBigInt.toString()} for using blocked accountId ${finalAccountId}`, {
              userId: userIdBigInt.toString(),
              accountId: finalAccountId,
              blockedByAccountId: req.userId.toString(),
            })
          } catch (error) {
            console.error('Error auto-blocking user:', error)
          }
          
          const errorResponse = NextResponse.json(
            createApiResponse(null, 'Аккаунт заблокирован'),
            { 
              status: 403,
              headers: {
                'Access-Control-Allow-Origin': '*',
              }
            }
          )
          return errorResponse
        }
      }
    }

    // Преобразуем amount в Decimal (Prisma требует Decimal для этого поля)
    // amountNum уже проверен выше, используем его
    let amountDecimal = new Prisma.Decimal(amountNum)

    // Обрабатываем фото чека
    const processedPhoto = cleanBase64(receipt_photo)
    
    // Детальное логирование фото для отладки
    if (receipt_photo !== undefined) {
      console.log('📸 Payment API - Photo processing:', {
        receipt_photo_type: typeof receipt_photo,
        receipt_photo_is_null: receipt_photo === null,
        receipt_photo_is_undefined: receipt_photo === undefined,
        receipt_photo_length: receipt_photo ? String(receipt_photo).length : 0,
        receipt_photo_preview: receipt_photo ? String(receipt_photo).substring(0, 100) : 'N/A',
        processed_photo_result: processedPhoto ? 'VALID' : 'NULL/INVALID',
        processed_photo_length: processedPhoto ? processedPhoto.length : 0,
        photo_will_be_saved: !!processedPhoto
      })
      
      if (!processedPhoto && receipt_photo) {
        console.warn('⚠️ Payment API - Photo was provided but not processed!', {
          receipt_photo_length: String(receipt_photo).length,
          receipt_photo_starts_with: String(receipt_photo).substring(0, 50),
          reason: String(receipt_photo).length < 20 ? 'TOO_SHORT' : 'UNKNOWN'
        })
      }
    }
    
    console.log('💾 Payment API - Saving to database:', {
      userId: userIdBigInt.toString(),
      username: telegram_username,
      firstName: telegram_first_name,
      lastName: telegram_last_name,
      type: validType,
      amount: amountDecimal.toString(),
      amount_type: typeof amountDecimal,
      bookmaker,
      bank,
      accountId: finalAccountId?.toString(),
      has_receipt_photo: !!receipt_photo,
      receipt_photo_length: receipt_photo ? receipt_photo.length : 0,
      processed_photo_length: processedPhoto ? processedPhoto.length : 0,
      photo_has_prefix: processedPhoto ? processedPhoto.startsWith('data:image') : false,
      photo_will_be_saved: !!processedPhoto
    })

    try {
      // Синхронизируем пользователя в BotUser при создании заявки
      const { ensureUserExists } = await import('@/lib/sync-user')
      
      const cleanUsername = cleanString(telegram_username)
      const cleanFirstName = cleanString(telegram_first_name)
      const cleanLastName = cleanString(telegram_last_name)

      await ensureUserExists(userIdBigInt, {
        username: cleanUsername,
        firstName: cleanFirstName,
        lastName: cleanLastName,
      })

      // Определяем botType: сначала используем переданный bot_type, если нет - определяем по букмекеру или из последнего сообщения
      let finalBotType: string | null = null
      
      if (bot_type) {
        // Используем переданный bot_type напрямую из бота (наиболее надежный способ)
        finalBotType = bot_type
      } else if (bookmaker) {
        // Fallback: определяем botType по букмекеру
        const bookmakerLower = bookmaker.toLowerCase()
        if (bookmakerLower.includes('mostbet')) {
          finalBotType = 'mostbet'
        } else if (bookmakerLower.includes('1xbet') || bookmakerLower.includes('xbet') || bookmakerLower.includes('1xcasino')) {
          finalBotType = '1xbet'
        } else {
          // Если букмекер не совпадает, определяем из последнего сообщения пользователя
          const { getBotTypeByUserLastMessage } = await import('@/lib/send-notification')
          const requestCreatedAt = new Date()
          finalBotType = await getBotTypeByUserLastMessage(userIdBigInt, requestCreatedAt)
        }
      } else {
        // Fallback: определяем botType из последнего сообщения пользователя
        const { getBotTypeByUserLastMessage } = await import('@/lib/send-notification')
        const requestCreatedAt = new Date()
        finalBotType = await getBotTypeByUserLastMessage(userIdBigInt, requestCreatedAt)
      }

      // Проверка активных заявок на пополнение для этого пользователя
      if (validType === 'deposit') {
        // ВАЖНО: Сначала автоматически отклоняем истекшие заявки (старше 5 минут без фото)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
        const expiredRequests = await prisma.request.findMany({
          where: {
            userId: userIdBigInt,
            requestType: 'deposit',
            status: {
              in: ['pending', 'pending_check']
            },
            createdAt: {
              lt: fiveMinutesAgo // Старше 5 минут
            },
            photoFileUrl: null, // Без фото чека
          },
          select: {
            id: true,
          },
        })

        // Автоматически отклоняем истекшие заявки
        if (expiredRequests.length > 0) {
          await prisma.request.updateMany({
            where: {
              id: {
                in: expiredRequests.map(r => r.id)
              }
            },
            data: {
              status: 'rejected',
              statusDetail: 'Таймер истек',
              processedAt: new Date(),
              updatedAt: new Date(),
            } as any,
          })
          console.log(`⏰ Payment API - Auto-rejected ${expiredRequests.length} expired deposit request(s) for user ${userIdBigInt}`)
        }

        const activeDepositRequest = await prisma.request.findFirst({
          where: {
            userId: userIdBigInt,
            requestType: 'deposit',
            status: {
              in: ['pending', 'pending_check']
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        })

        if (activeDepositRequest) {
          const timeAgo = Math.floor((Date.now() - activeDepositRequest.createdAt.getTime()) / 1000 / 60) // минуты назад
          console.log('⚠️ Payment API - Active deposit request exists, blocking new request:', {
            activeRequestId: activeDepositRequest.id,
            userId: userIdBigInt.toString(),
            createdAt: activeDepositRequest.createdAt,
            status: activeDepositRequest.status,
            timeAgoMinutes: timeAgo
          })
          
          const errorMessage = `У вас уже есть активная заявка на пополнение (ID: #${activeDepositRequest.id}, создана ${timeAgo} мин. назад). Пожалуйста, дождитесь обработки первой заявки перед созданием новой.`
          
          const errorResponse = NextResponse.json(
            createApiResponse(
              null,
              errorMessage
            ),
            { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
              }
            }
          )
          return errorResponse
        }
      }

      // Проверка на дубликаты суммы (включая копейки) для депозитов
      // Копейки блокируются на 10 минут после создания заявки
      // В течение этого времени другие пользователи не получат те же копейки
      if (validType === 'deposit' && amountDecimal) {
        const originalAmount = parseFloat(amountDecimal.toString())
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000) // 10 минут назад
        
        // Функция для проверки, занята ли сумма (включая копейки) в последние 10 минут
        const isAmountBlocked = async (amountToCheck: Prisma.Decimal): Promise<boolean> => {
          const blockedRequest = await prisma.request.findFirst({
            where: {
              amount: amountToCheck,
              requestType: 'deposit',
              createdAt: {
                gte: tenMinutesAgo, // За последние 10 минут
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
          })
          return !!blockedRequest
        }
        
        // Проверяем, заблокирована ли текущая сумма
        const isBlocked = await isAmountBlocked(amountDecimal)
        
        if (isBlocked) {
          console.log('⚠️ Payment API - Amount with cents is blocked (created in last 10 minutes), adjusting cents:', {
            originalAmount: amountDecimal.toString(),
          })
          
          // Автоматически изменяем копейки: добавляем 0.01
          // Пробуем найти уникальную сумму, которая не была использована в последние 10 минут
          let adjustedAmount = originalAmount + 0.01
          let attempts = 0
          let foundUnique = false
          
          // Пробуем до 99 раз (все возможные копейки от 0 до 99)
          while (attempts < 99 && !foundUnique) {
            // Ограничиваем копейки до 99
            if (adjustedAmount > Math.floor(originalAmount) + 0.99) {
              adjustedAmount = Math.floor(originalAmount) + 0.01
            }
            
            const adjustedDecimal = new Prisma.Decimal(adjustedAmount.toFixed(2))
            const isAdjustedBlocked = await isAmountBlocked(adjustedDecimal)
            
            if (!isAdjustedBlocked) {
              // Нашли уникальную сумму
              amountDecimal = adjustedDecimal
              foundUnique = true
              console.log('✅ Payment API - Adjusted amount to avoid duplicate (10min block):', {
                originalAmount: originalAmount.toFixed(2),
                adjustedAmount: adjustedAmount.toFixed(2),
                attempts: attempts + 1,
              })
              break
            }
            
            // Если и эта сумма занята, пробуем следующую
            adjustedAmount += 0.01
            attempts++
          }
          
          if (!foundUnique) {
            // Если не удалось найти уникальную сумму, используем случайную копейку
            // Генерируем случайное число от 0 до 99 для копеек
            const randomCents = Math.floor(Math.random() * 100)
            adjustedAmount = Math.floor(originalAmount) + randomCents / 100
            amountDecimal = new Prisma.Decimal(adjustedAmount.toFixed(2))
            console.warn('⚠️ Payment API - Could not find unique amount after 99 attempts, using random cents:', adjustedAmount.toFixed(2))
          }
        }
      }

      // Проверка на дубликаты: ищем существующую заявку с теми же параметрами
      if (validType === 'deposit' && finalAccountId) {
        // Для deposit проверяем по userId, accountId, amount, bookmaker
        const existingRequest = await prisma.request.findFirst({
          where: {
            userId: userIdBigInt,
            accountId: finalAccountId.toString(),
            amount: amountDecimal,
            requestType: 'deposit',
            status: 'pending',
            bookmaker: cleanString(bookmaker),
          },
          orderBy: {
            createdAt: 'desc',
          },
        })

        if (existingRequest) {
          console.log('⚠️ Payment API - Duplicate deposit request detected, returning existing:', {
            existingId: existingRequest.id,
            userId: userIdBigInt.toString(),
            accountId: finalAccountId.toString(),
            amount: amountDecimal.toString(),
          })
          
          // Возвращаем существующую заявку вместо создания новой
          const existingData = {
            id: existingRequest.id,
            userId: existingRequest.userId.toString(),
            type: existingRequest.requestType,
            status: existingRequest.status,
            amount: existingRequest.amount?.toString(),
            bookmaker: existingRequest.bookmaker,
            accountId: existingRequest.accountId,
            has_photo: !!existingRequest.photoFileUrl,
            createdAt: existingRequest.createdAt
          }

          const duplicateResponse = NextResponse.json(
            createApiResponse(existingData, undefined, 'Request already exists'),
            {
              status: 200,
              headers: {
                'Access-Control-Allow-Origin': '*',
              }
            }
          )
          return duplicateResponse
        }
      } else if (validType === 'withdraw' && finalAccountId) {
        // Для withdraw проверяем по userId, accountId, bookmaker, withdrawalCode (если есть)
        // withdrawalCode уникален для каждой заявки на вывод
        const withdrawWhere: any = {
          userId: userIdBigInt,
          accountId: finalAccountId.toString(),
          requestType: 'withdraw',
          status: 'pending',
          bookmaker: cleanString(bookmaker),
        }
        
        // Если есть код вывода, проверяем и по нему (код уникален)
        if (cleanString(withdrawal_code)) {
          withdrawWhere.withdrawalCode = cleanString(withdrawal_code)
        }
        
        const existingRequest = await prisma.request.findFirst({
          where: withdrawWhere,
          orderBy: {
            createdAt: 'desc',
          },
        })

        if (existingRequest) {
          console.log('⚠️ Payment API - Duplicate withdraw request detected, returning existing:', {
            existingId: existingRequest.id,
            userId: userIdBigInt.toString(),
            accountId: finalAccountId.toString(),
            bookmaker: cleanString(bookmaker),
            withdrawalCode: cleanString(withdrawal_code),
          })
          
          // Возвращаем существующую заявку вместо создания новой
          const existingData = {
            id: existingRequest.id,
            userId: existingRequest.userId.toString(),
            type: existingRequest.requestType,
            status: existingRequest.status,
            amount: existingRequest.amount?.toString(),
            bookmaker: existingRequest.bookmaker,
            accountId: existingRequest.accountId,
            has_photo: !!existingRequest.photoFileUrl,
            createdAt: existingRequest.createdAt
          }

          const duplicateResponse = NextResponse.json(
            createApiResponse(existingData, undefined, 'Request already exists'),
            {
              status: 200,
              headers: {
                'Access-Control-Allow-Origin': '*',
              }
            }
          )
          return duplicateResponse
        }
      }

      const newRequest = await prisma.request.create({
        data: {
          userId: userIdBigInt,
          username: cleanUsername,
          firstName: cleanFirstName,
          lastName: cleanLastName,
          bookmaker: cleanString(bookmaker),
          accountId: finalAccountId ? cleanString(finalAccountId.toString()) : null,
          amount: amountDecimal,
          requestType: validType, // Используем валидированный тип
          bank: cleanString(bank),
          phone: finalPhone ? cleanString(finalPhone) : null,
          status: 'pending',
          photoFileUrl: processedPhoto, // Сохраняем base64 фото чека (с префиксом data:image если нужно)
          withdrawalCode: cleanString(withdrawal_code), // Сохраняем код подтверждения вывода
          botType: finalBotType || 'main', // Сохраняем botType для определения, из какого бота была создана заявка
        },
      })

      // Убрали обработку uncreated_request_id, так как теперь создаем заявку сразу при показе QR кода
      // Если в будущем понадобится - можно вернуть

      const successData = {
        id: newRequest.id,
        userId: newRequest.userId.toString(),
        type: newRequest.requestType,
        status: newRequest.status,
        amount: newRequest.amount?.toString(),
        bookmaker: newRequest.bookmaker,
        accountId: newRequest.accountId,
        has_photo: !!newRequest.photoFileUrl,
        createdAt: newRequest.createdAt
      }
      
      console.log('✅ Payment API - Request created successfully:', successData)
      addLog('success', `✅ Заявка создана успешно (ID: ${newRequest.id})`, successData)
      
      // Проверяем, что заявка видна в запросе pending
      const pendingCheck = await prisma.request.findFirst({
        where: {
          id: newRequest.id,
          status: 'pending'
        }
      })
      const pendingCheckData = {
        found: !!pendingCheck,
        id: pendingCheck?.id,
        status: pendingCheck?.status
      }
      console.log('🔍 Payment API - Pending check:', pendingCheckData)
      addLog('info', `🔍 Проверка заявки pending (ID: ${newRequest.id})`, pendingCheckData)
      
      // Проверяем, сколько всего заявок pending в БД
      const totalPending = await prisma.request.count({
        where: { status: 'pending' }
      })
      const totalAll = await prisma.request.count({})
      
      console.log('📊 Payment API - Database stats:', {
        totalPending,
        totalAll,
        newRequestId: newRequest.id,
        newRequestStatus: newRequest.status
      })
      addLog('info', '📊 Статистика БД после создания заявки', {
        totalPending,
        totalAll,
        newRequestId: newRequest.id,
        newRequestStatus: newRequest.status
      })

      // Проверяем, что заявка действительно создана в БД
      const verifyRequest = await prisma.request.findUnique({
        where: { id: newRequest.id }
      })
      
      if (!verifyRequest) {
        console.error('❌ Payment API - Request was not found after creation!', { id: newRequest.id })
        throw new Error('Failed to verify request creation')
      }
      
      console.log('✅ Payment API - Request verified in database:', {
        id: verifyRequest.id,
        requestType: verifyRequest.requestType,
        status: verifyRequest.status,
        createdAt: verifyRequest.createdAt
      })
      
      // ВАЖНО: Проверяем, что статус действительно 'pending'
      if (verifyRequest.status !== 'pending') {
        const errorData = {
          expected: 'pending',
          actual: verifyRequest.status,
          id: verifyRequest.id
        }
        console.error('❌ Payment API - CRITICAL: Request created with wrong status!', errorData)
        addLog('error', `❌ Заявка создана с неправильным статусом! (ID: ${verifyRequest.id})`, errorData)
        
        // Исправляем статус на 'pending'
        await prisma.request.update({
          where: { id: verifyRequest.id },
          data: { status: 'pending' }
        })
        console.log('✅ Payment API - Status corrected to pending')
        addLog('success', `✅ Статус заявки исправлен на 'pending' (ID: ${verifyRequest.id})`)
      }

      // ФОНОВОЕ АВТОПОПОЛНЕНИЕ: Проверяем наличие платежа для ВСЕХ заявок (с чеком и без)
      // Заявки без чека не показываются в дашборде, но автопополнение работает для них в фоне
      if (validType === 'deposit' && amountDecimal) {
        const requestAmount = parseFloat(amountDecimal.toString())
        const hasReceipt = !!processedPhoto
        console.log(`🔍 Payment API - Checking for existing payments for request ${newRequest.id} (${hasReceipt ? 'with' : 'without'} receipt photo), amount: ${requestAmount}`)
        
        // Функция для проверки и обработки платежей (вызывается сразу и через задержку)
        const checkPayment = async (attempt: number, delay: number = 0) => {
          if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay))
          }
          
          try {
            const { checkAndProcessExistingPayment } = await import('@/lib/auto-deposit')
            const result = await checkAndProcessExistingPayment(newRequest.id, requestAmount)
            if (result) {
              console.log(`✅ Payment API - Auto-deposit check completed for request ${newRequest.id} (attempt ${attempt}, ${hasReceipt ? 'with receipt' : 'without receipt'})`)
              return true
            } else {
              console.log(`ℹ️ Payment API - No matching payments found for request ${newRequest.id} (attempt ${attempt}, ${hasReceipt ? 'with receipt' : 'without receipt'})`)
              return false
            }
          } catch (autoDepositError: any) {
            console.warn(`⚠️ Payment API - Auto-deposit check failed (attempt ${attempt}):`, autoDepositError.message)
            return false
          }
        }
        
        // Запускаем проверку в фоне (не блокируем ответ) - все заявки обрабатываются параллельно
        checkPayment(1, 0).catch(err => {
          console.warn(`⚠️ Payment API - Background payment check failed:`, err)
        })
        
        // Повторная проверка через 3 секунды (платеж может прийти с задержкой)
        // Для заявок без чека это особенно важно - платеж может прийти позже
        checkPayment(2, 3000).catch(err => {
          console.warn(`⚠️ Payment API - Background payment check (retry) failed:`, err)
        })
      }

      const response = NextResponse.json(
        createApiResponse({
          id: newRequest.id,
          transactionId: newRequest.id,
          message: 'Заявка успешно создана',
        })
      )
      response.headers.set('Access-Control-Allow-Origin', '*')
      return response
    } catch (dbError: any) {
      const errorData = {
        error: dbError.message,
        code: dbError.code,
        meta: dbError.meta,
        stack: dbError.stack
      }
      console.error('❌ Payment API - Database error:', errorData)
      addLog('error', '❌ Payment API - Database error', errorData)
      
      const errorResponse = NextResponse.json(
        createApiResponse(null, `Ошибка базы данных: ${dbError.message}`),
        { 
          status: 500,
          headers: {
            'Access-Control-Allow-Origin': '*',
          }
        }
      )
      return errorResponse
    }
  } catch (error: any) {
    const errorData = {
      error: error.message,
      stack: error.stack,
      name: error.name
    }
    console.error('❌ Payment API - Unexpected error:', errorData)
    addLog('error', '❌ Payment API - Unexpected error', errorData)
    
    const errorResponse = NextResponse.json(
      createApiResponse(null, error.message || 'Failed to create request'),
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
        }
      }
    )
    return errorResponse
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      id, 
      status, 
      status_detail,
      receipt_photo,
      telegram_user_id,
      amount,
      bookmaker,
      account_id,
      bank,
      phone,
      telegram_username,
      telegram_first_name,
      telegram_last_name,
      type, // requestType для обновления
      requestType
    } = body

    if (!id) {
      const response = NextResponse.json(
        createApiResponse(null, 'Missing required field: id'),
        { status: 400 }
      )
      response.headers.set('Access-Control-Allow-Origin', '*')
      return response
    }

    // Вспомогательная функция для обработки пустых строк
    const cleanString = (value: any): string | null => {
      if (value === null || value === undefined) return null
      const str = String(value).trim()
      return str === '' ? null : str
    }
    
    // Специальная функция для обработки base64 фото (не обрезаем содержимое, только убираем пробелы по краям)
    const cleanBase64 = (value: any): string | null => {
      if (value === null || value === undefined) return null
      const str = String(value)
      // Убираем только начальные и конечные пробелы/переносы строк
      const trimmed = str.trim()
      // Проверяем, что это не пустая строка и имеет минимальную длину для base64 (минимум 20 символов)
      if (trimmed === '' || trimmed.length < 20) return null
      // Если уже есть префикс data:image, возвращаем как есть
      if (trimmed.startsWith('data:image')) return trimmed
      // Если это чистый base64, добавляем префикс для изображения (определяем тип по первым символам)
      // По умолчанию используем jpeg, но можно определить по содержимому
      return `data:image/jpeg;base64,${trimmed}`
    }

    // ОПТИМИЗИРОВАННАЯ ПРОВЕРКА: Загружаем все нужные поля сразу для защиты от двойного зачисления
    const existingRequest = await prisma.request.findUnique({
      where: { id: parseInt(id) },
      select: { 
        createdAt: true, 
        status: true,
        photoFileUrl: true, // Для проверки, был ли чек уже добавлен
        processedBy: true, // Для проверки, была ли заявка уже обработана
        incomingPayments: {
          where: { isProcessed: true },
          select: { id: true },
          take: 1, // Нужен только факт наличия
        },
        requestType: true,
        amount: true,
      },
    })
    
    if (!existingRequest) {
      const response = NextResponse.json(
        createApiResponse(null, 'Request not found'),
        { status: 404 }
      )
      response.headers.set('Access-Control-Allow-Origin', '*')
      return response
    }
    
    // Проверяем, не прошло ли 5 минут с момента создания
    const createdAt = existingRequest.createdAt.getTime()
    const now = Date.now()
    const fiveMinutes = 5 * 60 * 1000 // 5 минут в миллисекундах
    const timeElapsed = now - createdAt
    
    if (timeElapsed > fiveMinutes) {
      console.log('❌ Payment API: Request expired on update', {
        requestId: id,
        createdAt: new Date(createdAt).toISOString(),
        timeElapsed: Math.floor(timeElapsed / 1000) + ' секунд',
        status: existingRequest.status
      })
      const response = NextResponse.json(
        createApiResponse(null, 'Время на оплату истекло. Заявка не может быть обновлена.'),
        { status: 400 }
      )
      response.headers.set('Access-Control-Allow-Origin', '*')
      return response
    }

    const updateData: any = {}

    // Обновляем статус, если передан
    if (status) {
      updateData.status = status
      
      if (status_detail) {
        updateData.statusDetail = status_detail
      }

      if (['completed', 'rejected', 'approved'].includes(status)) {
        updateData.processedAt = new Date()
      }
    }

    // Обновляем фото чека, если передано (используем cleanBase64 для сохранения целостности base64)
    if (receipt_photo !== undefined) {
      updateData.photoFileUrl = cleanBase64(receipt_photo)
    }

    // Обновляем другие поля, если переданы
    if (amount !== undefined) {
      const amountNum = typeof amount === 'number' ? amount : parseFloat(amount?.toString() || '0')
      if (!isNaN(amountNum) && amountNum > 0) {
        updateData.amount = new Prisma.Decimal(amountNum)
      }
    }

    if (bookmaker !== undefined) {
      updateData.bookmaker = cleanString(bookmaker)
    }

    if (account_id !== undefined) {
      updateData.accountId = cleanString(account_id?.toString())
    }

    if (bank !== undefined) {
      updateData.bank = cleanString(bank)
    }

    if (phone !== undefined) {
      updateData.phone = cleanString(phone)
    }

    if (telegram_username !== undefined) {
      updateData.username = cleanString(telegram_username)
    }

    if (telegram_first_name !== undefined) {
      updateData.firstName = cleanString(telegram_first_name)
    }

    if (telegram_last_name !== undefined) {
      updateData.lastName = cleanString(telegram_last_name)
    }

    // Обновляем requestType, если передан (с валидацией)
    const requestTypeToUpdate = type || requestType
    if (requestTypeToUpdate !== undefined) {
      const validRequestType = (requestTypeToUpdate === 'deposit' || requestTypeToUpdate === 'withdraw') 
        ? requestTypeToUpdate 
        : null
      if (validRequestType) {
        updateData.requestType = validRequestType
      } else {
        console.warn('⚠️ Payment API PUT: Invalid requestType, ignoring', { receivedType: requestTypeToUpdate })
      }
    }

    // Обновляем userId, если передан telegram_user_id
    if (telegram_user_id !== undefined && telegram_user_id !== null && telegram_user_id !== '') {
      let userIdBigInt: bigint
      try {
        const userIdStr = String(telegram_user_id).trim()
        if (userIdStr !== '') {
          userIdBigInt = BigInt(userIdStr)
          updateData.userId = userIdBigInt
        }
      } catch (error) {
        console.error('❌ Payment API PUT: Invalid userId format', telegram_user_id, error)
      }
    }

    console.log('📝 Payment API PUT - Updating request:', {
      id,
      updateData: Object.keys(updateData),
      has_receipt: !!updateData.photoFileUrl
    })

    const updatedRequest = await prisma.request.update({
      where: { id: parseInt(id) },
      data: updateData,
    })

    // ЗАЩИТА ОТ ДВОЙНОГО ЗАЧИСЛЕНИЯ + ОПТИМИЗАЦИЯ:
    // Автопополнение вызывается ТОЛЬКО если:
    // 1. Чек добавляется ВПЕРВЫЕ (раньше его не было)
    // 2. Заявка все еще pending
    // 3. Заявка еще не обработана автопополнением
    // 4. Нет уже обработанных платежей
    const isFirstReceipt = receipt_photo !== undefined && !existingRequest.photoFileUrl
    const isPendingDeposit = updatedRequest.requestType === 'deposit' && updatedRequest.status === 'pending' && updatedRequest.amount
    const isNotProcessed = existingRequest.processedBy !== 'автопополнение'
    const hasNoProcessedPayments = !existingRequest.incomingPayments?.length

    if (isFirstReceipt && isPendingDeposit && isNotProcessed && hasNoProcessedPayments && updatedRequest.amount) {
      const requestAmount = parseFloat(updatedRequest.amount.toString())
      console.log(`🔍 Payment API PUT - First receipt added, checking payments for request ${updatedRequest.id}, amount: ${requestAmount}`)
      
      // ОПТИМИЗИРОВАННАЯ ФУНКЦИЯ: Проверяет платеж и возвращает true если нашел, чтобы пропустить повторную проверку
      let processingStarted = false
      
      const checkPayment = async (attempt: number, delay: number = 0): Promise<boolean> => {
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay))
        }
        
        // Проверяем, не началась ли уже обработка другим вызовом
        if (processingStarted) {
          console.log(`⚠️ Payment API PUT - Request ${updatedRequest.id} already being processed, skipping attempt ${attempt}`)
          return true
        }
        
        try {
          // Быстрая проверка: заявка еще pending и не обработана?
          const quickCheck = await prisma.request.findUnique({
            where: { id: updatedRequest.id },
            select: { status: true, processedBy: true },
          })
          
          if (quickCheck?.status !== 'pending' || quickCheck?.processedBy === 'автопополнение') {
            console.log(`⚠️ Payment API PUT - Request ${updatedRequest.id} already processed, skipping attempt ${attempt}`)
            processingStarted = true
            return true
          }
          
          processingStarted = true // Помечаем, что обработка началась
          
          const { checkAndProcessExistingPayment } = await import('@/lib/auto-deposit')
          const result = await checkAndProcessExistingPayment(updatedRequest.id, requestAmount)
          
          if (result) {
            console.log(`✅ Payment API PUT - Auto-deposit completed for request ${updatedRequest.id} (attempt ${attempt})`)
            return true
          } else {
            processingStarted = false // Если не нашли, сбрасываем флаг для повторной попытки
            console.log(`ℹ️ Payment API PUT - No matching payments found for request ${updatedRequest.id} (attempt ${attempt})`)
            return false
          }
        } catch (autoDepositError: any) {
          processingStarted = false // При ошибке сбрасываем флаг
          console.warn(`⚠️ Payment API PUT - Auto-deposit check failed (attempt ${attempt}):`, autoDepositError.message)
          return false
        }
      }
      
      // Запускаем первую проверку сразу (не блокируем ответ)
      checkPayment(1, 0).then(found => {
        // Если платеж не найден сразу - запускаем повторную проверку через 3 секунды
        if (!found) {
          checkPayment(2, 3000).catch(() => {})
        }
      }).catch(() => {
        // При ошибке все равно запускаем повторную проверку
        checkPayment(2, 3000).catch(() => {})
      })
    } else if (receipt_photo !== undefined && existingRequest.photoFileUrl) {
      console.log(`⚠️ Payment API PUT - Receipt already exists for request ${updatedRequest.id}, skipping autodeposit`)
    }

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

