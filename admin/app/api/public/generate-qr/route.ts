import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createHash } from 'crypto'

// Публичный эндпоинт для генерации QR кода (без авторизации)
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
    const body = await request.json()
    
    const amount = parseFloat(String(body.amount || 0))
    const playerId = body.playerId || ''
    const bank = body.bank || 'demirbank'
    
    // Валидация
    if (isNaN(amount) || amount <= 0) {
      const errorResponse = NextResponse.json(
        { success: false, error: 'Invalid amount' },
        { status: 400 }
      )
      errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return errorResponse
    }
    
    // Получаем активный реквизит
    let requisite = null
    try {
      const activeRequisite = await prisma.botRequisite.findFirst({
        where: { isActive: true }
      })
      if (activeRequisite) {
        requisite = activeRequisite.value
        if (requisite) {
          console.log(`✅ Using active requisite: ${activeRequisite.name || `#${activeRequisite.id}`} - ${requisite.slice(0, 4)}****${requisite.slice(-4)}`)
        }
      } else {
        console.error('❌ No active requisite found in database')
      }
    } catch (error) {
      console.error('Error fetching requisite:', error)
    }
    
    // Если не нашли реквизит, возвращаем ошибку
    if (!requisite) {
      const errorResponse = NextResponse.json(
        { success: false, error: 'No active wallet configured. Please select an active wallet in admin panel.' },
        { status: 400 }
      )
      errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return errorResponse
    }
    
    // Конвертируем сумму в тыйны (1 сом = 100 тыйнов) согласно спецификации
    const amountTyins = Math.round(amount * 100)
    const amountStr = amountTyins.toString()
    // Длина суммы может быть до 13 символов согласно спецификации
    const amountLen = amountStr.length.toString().padStart(2, '0')
    
    console.log(`💰 Amount: ${amount} сом = ${amountTyins} тыйнов, length: ${amountLen}, value: ${amountStr}`)
    
    // Формируем TLV структуру
    const requisiteLen = requisite.length.toString().padStart(2, '0')
    
    // Формируем дополнительное поле для комментария (под-тег 35)
    // Согласно спецификации: формат строки с разделителем ":" - key:label:value:title:visible_state
    const commentValue = 'пополнение @bingokg_bot'
    let commentData: string
    try {
      // Формат согласно спецификации: key:label:value:title:visible_state
      commentData = `comment:Комментарий:${commentValue}:${commentValue}:11`
      
      // Проверяем длину комментария (должна быть <= 99 для 2-значного формата)
      if (commentData.length > 99) {
        console.warn(`⚠️ Comment data length (${commentData.length}) exceeds 99, truncating...`)
        // Обрезаем value и title, сохраняя структуру
        const maxValueLength = Math.floor((99 - 'comment:Комментарий::11'.length) / 2)
        const truncatedValue = commentValue.substring(0, maxValueLength)
        commentData = `comment:Комментарий:${truncatedValue}:${truncatedValue}:11`
      }
      
      console.log(`📝 Comment data: ${commentData}, length: ${commentData.length}`)
    } catch (error) {
      console.error('❌ Error creating comment data:', error)
      // Если ошибка при создании комментария, продолжаем без него
      commentData = ''
    }
    
    // Формируем merchantAccountValue с комментарием (если он есть)
    let merchantAccountValue = (
      `0015qr.demirbank.kg` +  // Под-тег 00: домен
      `01047001` +              // Под-тег 01: короткий тип (7001)
      `10${requisiteLen}${requisite}` +  // Под-тег 10: реквизит
      `120212130212`            // Под-теги 12, 13: дополнительные поля (12=12 запретить редактирование суммы, 13=12 запретить редактирование ID плательщика)
    )
    
    // Добавляем комментарий только если он успешно создан
    if (commentData && commentData.length > 0) {
      const commentDataLen = commentData.length.toString().padStart(2, '0')
      merchantAccountValue += `35${commentDataLen}${commentData}`  // Под-тег 35: комментарий к платежу
      console.log(`✅ Added comment field (35) with length ${commentDataLen}`)
    }
    
    // Форматируем длину merchantAccountValue (может быть 2 или 3 цифры)
    const merchantAccountLen = merchantAccountValue.length.toString().padStart(2, '0')
    
    console.log(`📊 merchantAccountValue length: ${merchantAccountValue.length}, formatted: ${merchantAccountLen}`)
    console.log(`📊 merchantAccountValue preview: ${merchantAccountValue.substring(0, 50)}...`)
    
    // Payload БЕЗ контрольной суммы и без 6304
    const payload = (
      `000201` +  // 00 - Payload Format Indicator
      `010211` +  // 01 - Point of Initiation Method (статический QR)
      `32${merchantAccountLen}${merchantAccountValue}` +  // 32 - Merchant Account
      `52044829` +  // 52 - Merchant Category Code
      `5303417` +   // 53 - Transaction Currency
      `54${amountLen}${amountStr}` +  // 54 - Amount
      `5909DEMIRBANK`  // 59 - Merchant Name
    )
    
    // Вычисляем SHA256 контрольную сумму от payload (БЕЗ 6304)
    const checksumFull = createHash('sha256').update(payload).digest('hex')
    // Берем последние 4 символа в нижнем регистре
    const checksum = checksumFull.slice(-4).toLowerCase()
    
    // Полный QR хеш: payload + '6304' + checksum
    const qrHash = payload + '6304' + checksum
    
    // Создаем ссылки для всех банков
    const bankLinks: Record<string, string> = {
      'DemirBank': `https://retail.demirbank.kg/#${qrHash}`,
      'O!Money': `https://api.dengi.o.kg/ru/qr/#${qrHash}`,
      'Balance.kg': `https://balance.kg/#${qrHash}`,
      'Bakai': `https://bakai24.app/#${qrHash}`,
      'MegaPay': `https://megapay.kg/get#${qrHash}`,
      'MBank': `https://app.mbank.kg/qr/#${qrHash}`,
      // Также добавляем варианты с нижним регистром для совместимости
      'demirbank': `https://retail.demirbank.kg/#${qrHash}`,
      'omoney': `https://api.dengi.o.kg/ru/qr/#${qrHash}`,
      'balance': `https://balance.kg/#${qrHash}`,
      'bakai': `https://bakai24.app/#${qrHash}`,
      'megapay': `https://megapay.kg/get#${qrHash}`,
      'mbank': `https://app.mbank.kg/qr/#${qrHash}`
    }
    
    // Получаем настройки депозитов для определения включенных банков
    let enabledBanks = ['demirbank', 'omoney', 'balance', 'bakai', 'megapay', 'mbank']
    try {
      const depositConfig = await prisma.botConfiguration.findFirst({
        where: { key: { in: ['deposits', 'deposit_settings'] } }
      })
      if (depositConfig) {
        const depositSettings = typeof depositConfig.value === 'string' 
          ? JSON.parse(depositConfig.value) 
          : depositConfig.value
        if (depositSettings?.banks && Array.isArray(depositSettings.banks)) {
          enabledBanks = depositSettings.banks
        }
      }
    } catch (error) {
      console.error('Error fetching deposit settings:', error)
    }
    
    // Определяем primary_url на основе переданного bank
    const primaryBankMap: Record<string, string> = {
      'demirbank': 'DemirBank',
      'omoney': 'O!Money',
      'balance': 'Balance.kg',
      'bakai': 'Bakai',
      'megapay': 'MegaPay',
      'mbank': 'MBank'
    }
    const primaryBank = primaryBankMap[bank.toLowerCase()] || 'DemirBank'
    const primaryUrl = bankLinks[primaryBank] || bankLinks['DemirBank']
    
    const response = NextResponse.json({
      success: true,
      qr_hash: qrHash,
      primary_url: primaryUrl,
      all_bank_urls: bankLinks,
      settings: {
        enabled_banks: enabledBanks,
        deposits_enabled: true
      }
    })
    response.headers.set('Access-Control-Allow-Origin', '*')
    return response
    
  } catch (error: any) {
    console.error('Generate QR API error:', error)
    const errorResponse = NextResponse.json(
      { success: false, error: error.message || 'Failed to generate QR code' },
      { status: 500 }
    )
    errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return errorResponse
  }
}

export const dynamic = 'force-dynamic'

