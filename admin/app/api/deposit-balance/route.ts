import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { depositCashdeskAPI, depositMostbetAPI, deposit1winAPI } from '@/lib/casino-deposit'
import { getCasinoConfig } from '@/lib/casino-config'

export const dynamic = 'force-dynamic'

// Функция для получения конфигурации API казино из настроек
// Функция для пополнения баланса через API казино
async function depositToCasino(
  bookmaker: string,
  accountId: string,
  amount: number
): Promise<{ success: boolean; message: string; data?: any }> {
  const normalizedBookmaker = bookmaker?.toLowerCase() || ''

  try {
    // 1xbet, Melbet, Winwin, 888starz, 1xCasino, BetWinner и WowBet используют Cashdesk API
    if (normalizedBookmaker.includes('1xbet') || normalizedBookmaker.includes('melbet') || normalizedBookmaker.includes('winwin') || normalizedBookmaker.includes('888starz') || normalizedBookmaker.includes('starz') || normalizedBookmaker.includes('1xcasino') || normalizedBookmaker.includes('xcasino') || normalizedBookmaker.includes('betwinner') || normalizedBookmaker.includes('wowbet')) {
      const config = await getCasinoConfig(bookmaker)
      
      if (!config) {
        return {
          success: false,
          message: `${bookmaker} API configuration not found in database`,
        }
      }

      return await depositCashdeskAPI(bookmaker, accountId, amount, config)
    }
    
    // Mostbet использует свой API
    if (normalizedBookmaker.includes('mostbet')) {
      const config = await getCasinoConfig(bookmaker)
      
      if (!config) {
        return {
          success: false,
          message: 'Mostbet API configuration not found in database',
        }
      }

      return await depositMostbetAPI(accountId, amount, config)
    }
    
    // 1win использует свой API
    if (normalizedBookmaker.includes('1win')) {
      const config = await getCasinoConfig(bookmaker)
      
      if (!config) {
        return {
          success: false,
          message: '1win API configuration not found in database',
        }
      }

      return await deposit1winAPI(accountId, amount, config)
    }

    return {
      success: false,
      message: `Unsupported bookmaker: ${bookmaker}`,
    }
  } catch (error: any) {
    console.error('Deposit balance error:', error)
    return {
      success: false,
      message: error.message || 'Failed to deposit balance',
    }
  }
}

// API для пополнения баланса игрока
export async function POST(request: NextRequest) {
  try {
    requireAuth(request)

    const body = await request.json()
    const { requestId, bookmaker, amount } = body

    if (!requestId || !bookmaker || !amount) {
      return NextResponse.json(
        createApiResponse(null, 'Missing required fields: requestId, bookmaker, amount'),
        { status: 400 }
      )
    }

    // Получаем заявку
    const requestData = await prisma.request.findUnique({
      where: { id: parseInt(requestId) },
      select: {
        id: true,
        status: true,
        processedBy: true,
        accountId: true,
        bookmaker: true,
        amount: true,
      },
    })

    if (!requestData) {
      return NextResponse.json(
        createApiResponse(null, 'Request not found'),
        { status: 404 }
      )
    }

    // Проверка на дубликаты: если заявка уже обработана, не выполняем повторное пополнение
    if (requestData.status === 'completed' || requestData.status === 'approved' || requestData.status === 'autodeposit_success') {
      // Если заявка уже обработана автопополнением, обновляем статус на approved без повторного пополнения
      if (requestData.status === 'autodeposit_success') {
        const updatedRequest = await prisma.request.update({
          where: { id: parseInt(requestId) },
          data: {
            status: 'approved',
            processedAt: new Date(),
          },
        })

        return NextResponse.json(
          createApiResponse({
            success: true,
            message: 'Заявка уже была обработана автопополнением. Статус обновлен.',
            request: {
              ...updatedRequest,
              amount: updatedRequest.amount ? updatedRequest.amount.toString() : null,
            },
          })
        )
      }
      
      return NextResponse.json(
        createApiResponse(null, `Заявка уже обработана (статус: ${requestData.status}). Повторное пополнение невозможно.`),
        { status: 400 }
      )
    }

    // ВАЖНО: Используем accountId из заявки (ID казино), а не из body запроса!
    // accountId из body может быть неправильным (например, Telegram ID)
    // accountId - это ID игрока в казино (например, ID счета 1xbet, Melbet и т.д.)
    const accountId = requestData.accountId ? String(requestData.accountId).trim() : null
    
    if (!accountId || accountId === '') {
      return NextResponse.json(
        createApiResponse(null, 'Request does not have accountId (casino player ID). Cannot deposit.'),
        { status: 400 }
      )
    }

    // Используем bookmaker из заявки (приоритет), иначе из body
    const bookmakerToUse = requestData.bookmaker || bookmaker
    
    if (!bookmakerToUse) {
      return NextResponse.json(
        createApiResponse(null, 'Request does not have bookmaker. Cannot deposit.'),
        { status: 400 }
      )
    }
    
    // Используем amount из заявки (приоритет), иначе из body
    const amountToUse = requestData.amount ? parseFloat(requestData.amount.toString()) : parseFloat(amount)
    
    if (!amountToUse || isNaN(amountToUse) || amountToUse <= 0) {
      return NextResponse.json(
        createApiResponse(null, 'Invalid amount. Cannot deposit.'),
        { status: 400 }
      )
    }
    
    // Пополняем баланс через API казино
    const depositResult = await depositToCasino(bookmakerToUse, accountId, amountToUse)

    if (!depositResult.success) {
      // ВАЖНО: Если депозит уже был проведен - это успешный результат, а не ошибка
      const errorMessage = depositResult.message || 'Failed to deposit balance'
      const isAlreadyProcessed = errorMessage.toLowerCase().includes('уже был проведен') || 
                                  errorMessage.toLowerCase().includes('already processed') ||
                                  errorMessage.toLowerCase().includes('повторить платеж')
      
      if (isAlreadyProcessed) {
        // Если депозит уже был проведен (например, автопополнением), обновляем статус на approved
        console.log(`✅ Deposit balance API - Deposit already processed for request ${requestId}, updating status to approved`)
        const updatedRequest = await prisma.request.update({
          where: { id: parseInt(requestId) },
          data: {
            status: 'approved',
            processedAt: new Date(),
            casinoError: null,
          },
        })

        return NextResponse.json(
          createApiResponse({
            success: true,
            message: 'Депозит уже был проведен. Статус обновлен.',
            request: {
              ...updatedRequest,
              amount: updatedRequest.amount ? updatedRequest.amount.toString() : null,
            },
          })
        )
      }
      
      // Для других ошибок обрабатываем как обычно - устанавливаем статус pending
      await prisma.request.update({
        where: { id: parseInt(requestId) },
        data: {
          status: 'pending',
          casinoError: errorMessage,
        },
      })
      
      return NextResponse.json(
        createApiResponse(null, errorMessage),
        { status: 500 }
      )
    }
    
    // Очищаем ошибку при успешном пополнении
    await prisma.request.update({
      where: { id: parseInt(requestId) },
      data: {
        casinoError: null,
      },
    })

    // Обновляем статус заявки на completed
    const updatedRequest = await prisma.request.update({
      where: { id: parseInt(requestId) },
      data: {
        status: 'completed',
        processedAt: new Date(),
      },
    })

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

