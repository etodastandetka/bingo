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
    
    // Формируем merchantAccountValue (ID 32)
    // Структура: под-тег 00 (домен) + под-тег 01 (тип) + под-тег 10 (реквизит) + под-теги 12, 13 (настройки редактирования)
    const merchantAccountValue = (
      `0015qr.demirbank.kg` +  // Под-тег 00: домен (длина 15)
      `01047001` +              // Под-тег 01: короткий тип 7001 (длина 04)
      `10${requisiteLen}${requisite}` +  // Под-тег 10: реквизит (длина = requisiteLen)
      `120212130212`            // Под-теги 12, 13: 12=12 (запретить редактирование суммы), 13=12 (запретить редактирование ID плательщика)
    )
    
    // Проверяем длину merchantAccountValue
    // Если длина > 99, нужно использовать 3-значный формат, но по спецификации максимум 99
    if (merchantAccountValue.length > 99) {
      console.error(`❌ merchantAccountValue length (${merchantAccountValue.length}) exceeds 99!`)
      throw new Error(`Merchant account value too long: ${merchantAccountValue.length} characters`)
    }
    
    // Форматируем длину merchantAccountValue (2 цифры)
    const merchantAccountLen = merchantAccountValue.length.toString().padStart(2, '0')
    
    console.log(`📊 merchantAccountValue:`)
    console.log(`  Length: ${merchantAccountValue.length}, formatted: ${merchantAccountLen}`)
    console.log(`  Value: ${merchantAccountValue}`)
    console.log(`  Requisite: ${requisite} (length: ${requisiteLen})`)
    
    // Формируем payload БЕЗ контрольной суммы и без 6304
    // Временно убираем комментарий, чтобы проверить базовую структуру
    const payload = (
      `000201` +  // 00 - Payload Format Indicator (версия 01)
      `010211` +  // 01 - Point of Initiation Method (11 = статический QR)
      `32${merchantAccountLen}${merchantAccountValue}` +  // 32 - Merchant Account
      `52044829` +  // 52 - Merchant Category Code (4829)
      `5303417` +   // 53 - Transaction Currency (417 = KGS)
      `54${amountLen}${amountStr}` +  // 54 - Amount (в тыйнах)
      `5909DEMIRBANK`  // 59 - Merchant Name (DEMIRBANK, длина 9)
    )
    
    console.log(`📦 Payload structure (before checksum):`)
    console.log(`  00 (Version): 01`)
    console.log(`  01 (Type): 11 (static)`)
    console.log(`  32 (Merchant Account): length=${merchantAccountLen}, value=${merchantAccountValue}`)
    console.log(`  52 (MCC): 4829`)
    console.log(`  53 (Currency): 417 (KGS)`)
    console.log(`  54 (Amount): length=${amountLen}, value=${amountStr} (${amount} сом = ${amountTyins} тыйнов)`)
    console.log(`  59 (Merchant Name): DEMIRBANK`)
    console.log(`📦 Full payload (before checksum): ${payload}`)
    
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

