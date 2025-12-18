import { NextRequest, NextResponse } from 'next/server'
import { createApiResponse } from '@/lib/api-helpers'
import { checkWithdrawAmountCashdesk, checkWithdrawAmountMostbet, checkWithdrawAmount1win } from '@/lib/casino-withdraw'
import { getCasinoConfig } from '@/lib/deposit-balance'

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export async function POST(request: NextRequest) {
  try {
    // Публичный endpoint - не требует аутентификации

    const body = await request.json()
    const { bookmaker, userId, code } = body

    // ВАЖНО: Проверяем код ПЕРВЫМ, чтобы не выполнять проверку если код не введен
    // Это предотвращает автоматическую проверку при загрузке страницы
    
    // Проверяем наличие кода (включая пустые строки и специальные значения)
    if (!code || code === '' || code.trim() === '' || 
        code === 'Проверка наличия вывода...' || 
        code === 'Checking for withdrawal...' ||
        code.toLowerCase().includes('проверка') ||
        code.toLowerCase().includes('checking')) {
      return NextResponse.json(
        createApiResponse(null, 'Код вывода не введен. Пожалуйста, введите код вывода с сайта букмекера перед проверкой.'),
        { status: 400 }
      )
    }

    // Улучшенная валидация остальных полей
    if (!bookmaker || !userId) {
      const missingFields: string[] = []
      if (!bookmaker) missingFields.push('букмекер')
      if (!userId) missingFields.push('ID пользователя')
      
      return NextResponse.json(
        createApiResponse(null, `Отсутствуют обязательные поля: ${missingFields.join(', ')}`),
        { status: 400 }
      )
    }

    // Получаем конфигурацию казино
    const config = await getCasinoConfig(bookmaker)
    
    if (!config) {
      return NextResponse.json(
        createApiResponse(null, `API configuration not found for ${bookmaker}`),
        { status: 404 }
      )
    }

    const normalizedBookmaker = bookmaker.toLowerCase()
    let result: { success: boolean; amount?: number; message: string; transactionId?: number }

    // Cashdesk API (1xbet, Melbet, Winwin, 888starz, 1xcasino, betwinner, wowbet)
    if (normalizedBookmaker.includes('1xbet') || 
        normalizedBookmaker.includes('melbet') || 
        normalizedBookmaker.includes('winwin') || 
        normalizedBookmaker.includes('888starz') || 
        normalizedBookmaker.includes('starz') || 
        normalizedBookmaker.includes('1xcasino') || 
        normalizedBookmaker.includes('xcasino') || 
        normalizedBookmaker.includes('betwinner') || 
        normalizedBookmaker.includes('wowbet')) {
      result = await checkWithdrawAmountCashdesk(bookmaker, userId, code, config)
    }
    // Mostbet
    else if (normalizedBookmaker.includes('mostbet')) {
      result = await checkWithdrawAmountMostbet(userId, code, config)
    }
    // 1win
    else if (normalizedBookmaker.includes('1win')) {
      result = await checkWithdrawAmount1win(userId, code, config)
    }
    else {
      return NextResponse.json(
        createApiResponse(null, `Unsupported bookmaker: ${bookmaker}`),
        { status: 400 }
      )
    }

    if (result.success) {
      return NextResponse.json(
        createApiResponse({
          amount: result.amount,
          transactionId: result.transactionId,
          message: result.message || 'Сумма вывода успешно получена',
        }, result.message || 'Сумма вывода успешно получена'),
        { status: 200 }
      )
    }

    // Улучшаем сообщение об ошибке для пользователя
    let errorMessage = result.message || 'Не удалось проверить сумму вывода'
    
    // Если сообщение уже на русском и содержит полезную информацию, оставляем как есть
    // Иначе добавляем контекст
    if (!errorMessage.includes('нет активной заявки') && 
        !errorMessage.includes('Неверный код') &&
        !errorMessage.includes('создайте новую заявку')) {
      // Добавляем более понятное сообщение
      errorMessage = `${errorMessage}. Убедитесь, что вы создали заявку на вывод в казино ${bookmaker}.`
    }

    return NextResponse.json(
      createApiResponse(null, errorMessage),
      { status: 400 }
    )
  } catch (error: any) {
    console.error('Check withdraw amount API error:', error)
    const errorMessage = error.message || 'Произошла ошибка при проверке суммы вывода. Пожалуйста, попробуйте позже.'
    return NextResponse.json(
      createApiResponse(null, errorMessage),
      { status: 500 }
    )
  }
}

