import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createApiResponse } from '@/lib/api-helpers'
import { matchAndProcessPayment } from '@/lib/auto-deposit'

// Функция для отправки уведомления пользователю в Telegram
async function sendTelegramNotification(userId: bigint, message: string) {
  try {
    const botToken = process.env.BOT_TOKEN
    if (!botToken) {
      console.warn('⚠️ BOT_TOKEN not configured, skipping Telegram notification')
      return
    }

    const sendMessageUrl = `https://api.telegram.org/bot${botToken}/sendMessage`
    const response = await fetch(sendMessageUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: userId.toString(),
        text: message,
        parse_mode: 'HTML',
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error('❌ Failed to send Telegram notification:', errorData)
      return
    }

    const data = await response.json()
    if (data.ok) {
      console.log(`✅ Telegram notification sent to user ${userId}`)
    }
  } catch (error) {
    console.error('❌ Error sending Telegram notification:', error)
  }
}

/**
 * API endpoint для сохранения входящих платежей из email watcher или Android приложения
 * POST /api/incoming-payment
 * Body: { amount, bank, paymentDate, notificationText }
 */

// CORS handler
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

    const { amount, bank, paymentDate, notificationText } = body

    if (!amount) {
      return NextResponse.json(
        createApiResponse(null, 'Amount is required'),
        { status: 400 }
      )
    }

    const paymentAmount = parseFloat(amount)
    const paymentDateObj = paymentDate ? new Date(paymentDate) : new Date()

    // ВАЖНО: Проверяем, не существует ли уже такой платеж (по сумме, дате и банку)
    // Это предотвращает дубликаты при повторной отправке запроса
    // Увеличиваем окно поиска до ±10 минут для более надежной проверки
    const existingPayment = await prisma.incomingPayment.findFirst({
      where: {
        amount: paymentAmount,
        bank: bank || null,
        paymentDate: {
          gte: new Date(paymentDateObj.getTime() - 10 * 60000), // ±10 минут
          lte: new Date(paymentDateObj.getTime() + 10 * 60000),
        },
      },
    })

    if (existingPayment) {
      console.log(`⚠️ Payment already exists: ID ${existingPayment.id}, amount: ${paymentAmount}, date: ${paymentDateObj.toISOString()}`)
      console.log(`   Returning existing payment instead of creating duplicate.`)
      
      // Возвращаем существующий платеж
      const response = NextResponse.json(
        createApiResponse(
          {
            id: existingPayment.id,
            amount: existingPayment.amount.toString(),
            bank: existingPayment.bank,
            paymentDate: existingPayment.paymentDate.toISOString(),
            isProcessed: existingPayment.isProcessed,
          },
          'Payment already exists (duplicate prevented)'
        )
      )
      response.headers.set('Access-Control-Allow-Origin', '*')
      return response
    }

    // Создаем запись о входящем платеже только если дубликата нет
    const incomingPayment = await prisma.incomingPayment.create({
      data: {
        amount: paymentAmount,
        bank: bank || null,
        paymentDate: paymentDateObj,
        notificationText: notificationText || null,
        isProcessed: false,
      },
    })

    console.log(`✅ IncomingPayment saved: ID ${incomingPayment.id}, Amount: ${amount} ${bank || ''}`)
    console.log(`🔍 [Incoming Payment] Starting auto-match for payment ${incomingPayment.id}, amount: ${amount}`)

    // Автопополнение теперь выполняется только через Request Watcher
    // Платеж сохранен, Request Watcher найдет его при следующей проверке (каждые 50ms)

    const response = NextResponse.json(
      createApiResponse(
        {
          id: incomingPayment.id,
          amount: incomingPayment.amount.toString(),
          bank: incomingPayment.bank,
          paymentDate: incomingPayment.paymentDate.toISOString(),
        },
        'Incoming payment saved'
      )
    )
    
    // Добавляем CORS заголовки
    response.headers.set('Access-Control-Allow-Origin', '*')
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    
    return response
  } catch (error: any) {
    console.error('❌ Error saving incoming payment:', error)
    const errorResponse = NextResponse.json(
      createApiResponse(null, `Error: ${error.message}`),
      { status: 500 }
    )
    errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return errorResponse
  }
}

