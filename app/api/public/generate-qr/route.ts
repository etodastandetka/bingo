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
    let requisiteBank = null
    try {
      const activeRequisite = await prisma.botRequisite.findFirst({
        where: { isActive: true }
      })
      if (activeRequisite) {
        requisite = activeRequisite.value
        requisiteBank = activeRequisite.bank
        console.log(`✅ Using active requisite: ${activeRequisite.name || `#${activeRequisite.id}`} - Bank: ${requisiteBank || 'N/A'} - ${requisite.slice(0, 4)}****${requisite.slice(-4)}`)
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
    
    let qrHash: string
    
    // Если банк кошелька Bakai, используем base_hash напрямую с обновлением суммы
    if (requisiteBank === 'BAKAI') {
      // Проверяем, что base_hash содержит данные только для Bakai
      if (requisite.includes('qr.demirbank.kg') || requisite.includes('DEMIRBANK')) {
        const errorResponse = NextResponse.json(
          { success: false, error: 'Base_hash для Bakai содержит данные DemirBank. Проверьте настройки кошелька в админке.' },
          { status: 400 }
        )
        errorResponse.headers.set('Access-Control-Allow-Origin', '*')
        return errorResponse
      }
      
      // Проверяем, что base_hash содержит данные для Bakai
      if (!requisite.includes('qr.bakai.kg') && !requisite.includes('BAKAIAPP')) {
        const errorResponse = NextResponse.json(
          { success: false, error: 'Base_hash не содержит данные для Bakai. Проверьте настройки кошелька в админке.' },
          { status: 400 }
        )
        errorResponse.headers.set('Access-Control-Allow-Origin', '*')
        return errorResponse
      }
      
      // Конвертируем сумму в копейки
      const amountCents = Math.round(amount * 100)
      const amountStr = amountCents.toString()
      const amountLen = amountStr.length.toString().padStart(2, '0')
      
      // Находим последнее поле 54 перед полем 63 (контрольная сумма)
      const field54Pattern = /54(\d{2})(\d+)/g
      const field54Matches: Array<{ index: number; fullMatch: string }> = []
      let match54
      while ((match54 = field54Pattern.exec(requisite)) !== null) {
        field54Matches.push({
          index: match54.index,
          fullMatch: match54[0]
        })
      }
      
      if (field54Matches.length === 0) {
        const errorResponse = NextResponse.json(
          { success: false, error: 'Не найдено поле 54 в base_hash для Bakai' },
          { status: 400 }
        )
        errorResponse.headers.set('Access-Control-Allow-Origin', '*')
        return errorResponse
      }
      
      // Находим индекс последнего поля 63
      const last63Index = requisite.lastIndexOf('6304')
      if (last63Index === -1) {
        const errorResponse = NextResponse.json(
          { success: false, error: 'Не найдено поле 63 в base_hash для Bakai' },
          { status: 400 }
        )
        errorResponse.headers.set('Access-Control-Allow-Origin', '*')
        return errorResponse
      }
      
      // Находим последнее поле 54 перед полем 63
      const lastField54Before63 = field54Matches
        .filter(m => m.index < last63Index)
        .sort((a, b) => b.index - a.index)[0]
      
      if (!lastField54Before63) {
        const errorResponse = NextResponse.json(
          { success: false, error: 'Не найдено поле 54 перед полем 63 в base_hash для Bakai' },
          { status: 400 }
        )
        errorResponse.headers.set('Access-Control-Allow-Origin', '*')
        return errorResponse
      }
      
      // Заменяем последнее поле 54 на новое значение
      const oldField54 = lastField54Before63.fullMatch
      const newField54 = `54${amountLen}${amountStr}`
      
      // Заменяем последнее вхождение поля 54 (перед полем 63)
      let updatedHash = requisite.substring(0, lastField54Before63.index) + 
                       newField54 + 
                       requisite.substring(lastField54Before63.index + oldField54.length)
      
      // Извлекаем данные до последнего объекта 63 (ID "00" - "90", исключая ID 63)
      let dataBefore63 = updatedHash.substring(0, last63Index)
      
      // Согласно алгоритму:
      // 1. Все значения до объекта 63 преобразуются в строку (уже есть)
      // 2. Декодируем процентное кодирование (%20 -> пробел и т.д.)
      // 3. Строка переводится в массив байт с кодировкой UTF-8
      // 4. Вычисляется SHA256 хеш от массива байт
      // 5. Массив байт преобразуется в строку (hex)
      // 6. Удаляются все символы "-" если есть
      // 7. Берутся последние 4 символа
      
      // Декодируем процентное кодирование (%20 -> пробел и т.д.)
      try {
        dataBefore63 = decodeURIComponent(dataBefore63)
      } catch (e) {
        // Если декодирование не удалось, используем исходную строку
        console.warn('Could not decode URI component, using original string')
      }
      
      // Вычисляем SHA256 от данных до объекта 63
      // createHash('sha256').update() уже работает с UTF-8 байтами по умолчанию
      const checksumFull = createHash('sha256').update(dataBefore63, 'utf8').digest('hex')
      
      // Удаляем все символы "-" если есть (хотя в hex их обычно нет)
      const checksumCleaned = checksumFull.replace(/-/g, '')
      
      // Берем последние 4 символа в верхнем регистре
      const checksum = checksumCleaned.slice(-4).toUpperCase()
      
      // Заменяем последнее поле 63 (контрольная сумма)
      const newField63 = `6304${checksum}`
      qrHash = updatedHash.substring(0, last63Index) + newField63
    } else if (requisiteBank === 'DemirBank' || requisiteBank === 'demirbank' || requisiteBank === 'DEMIRBANK') {
      // Для DemirBank используем base_hash и меняем только реквизит, поле 54 и 63
      // В админке для DemirBank хранится base_hash, а активный реквизит (16 цифр) извлекается из него или берется отдельно
      
      let baseHash = requisite
      let activeRequisiteValue = ''
      
      // Если requisite является base_hash (содержит qr.demirbank.kg), извлекаем из него реквизит
      if (baseHash.includes('qr.demirbank.kg')) {
        // Ищем поле 10 (реквизит) в base_hash: формат "10" + длина(2 цифры) + реквизит(16 цифр)
        const requisiteMatch = baseHash.match(/10(\d{2})(\d{16})/)
        if (requisiteMatch) {
          activeRequisiteValue = requisiteMatch[2] // Извлекаем 16 цифр реквизита
        } else {
          // Если не нашли, используем дефолтный base_hash
          baseHash = '00020101021132590015qr.demirbank.kg01047001101611800003603864311202111302125204482953034175405500945909DEMIRBANK63047803'
          activeRequisiteValue = '1180000360386431' // Дефолтный реквизит
        }
      } else if (/^\d{16}$/.test(requisite)) {
        // Если реквизит - это просто 16 цифр, используем дефолтный base_hash
        activeRequisiteValue = requisite
        baseHash = '00020101021132590015qr.demirbank.kg01047001101611800003603864311202111302125204482953034175405500945909DEMIRBANK63047803'
      } else {
        const errorResponse = NextResponse.json(
          { success: false, error: 'Некорректный формат реквизита для DemirBank. Ожидается base_hash или 16 цифр.' },
          { status: 400 }
        )
        errorResponse.headers.set('Access-Control-Allow-Origin', '*')
        return errorResponse
      }
      
      // Проверяем, что активный реквизит - это 16 цифр
      if (!/^\d{16}$/.test(activeRequisiteValue)) {
        const errorResponse = NextResponse.json(
          { success: false, error: 'Реквизит для Demir Bank должен содержать 16 цифр' },
          { status: 400 }
        )
        errorResponse.headers.set('Access-Control-Allow-Origin', '*')
        return errorResponse
      }
      
      // Используем активный реквизит для замены в base_hash
      const requisiteToUse = activeRequisiteValue
      
      // Конвертируем сумму в копейки и форматируем (5 цифр)
      const amountCents = Math.round(amount * 100)
      const amountStr = amountCents.toString().padStart(5, '0')
      const amountLen = amountStr.length.toString().padStart(2, '0')
      
      // Находим позицию реквизита в base_hash (после "10" и длины)
      // Формат: 10 + длина(2 цифры) + реквизит(16 цифр)
      const requisiteMatch = baseHash.match(/10(\d{2})(\d{16})/)
      if (!requisiteMatch) {
        const errorResponse = NextResponse.json(
          { success: false, error: 'Не найдено поле реквизита в base_hash для DemirBank' },
          { status: 400 }
        )
        errorResponse.headers.set('Access-Control-Allow-Origin', '*')
        return errorResponse
      }
      
      const requisiteStartIndex = requisiteMatch.index!
      const requisiteLength = requisiteMatch[1]
      const oldRequisite = requisiteMatch[2]
      
      // Заменяем реквизит (16 цифр после "10" + длина)
      let updatedHash = baseHash.substring(0, requisiteStartIndex + 4) + 
                       requisiteToUse + 
                       baseHash.substring(requisiteStartIndex + 4 + 16)
      
      // Находим поле 54 (сумма) - последнее перед полем 63
      const field54Pattern = /54(\d{2})(\d+)/g
      const field54Matches: Array<{ index: number; fullMatch: string }> = []
      let match54
      while ((match54 = field54Pattern.exec(updatedHash)) !== null) {
        field54Matches.push({
          index: match54.index,
          fullMatch: match54[0]
        })
      }
      
      // Находим индекс последнего поля 63
      const last63Index = updatedHash.lastIndexOf('6304')
      if (last63Index === -1) {
        const errorResponse = NextResponse.json(
          { success: false, error: 'Не найдено поле 63 в base_hash для DemirBank' },
          { status: 400 }
        )
        errorResponse.headers.set('Access-Control-Allow-Origin', '*')
        return errorResponse
      }
      
      // Находим последнее поле 54 перед полем 63
      const lastField54Before63 = field54Matches
        .filter(m => m.index < last63Index)
        .sort((a, b) => b.index - a.index)[0]
      
      if (!lastField54Before63) {
        const errorResponse = NextResponse.json(
          { success: false, error: 'Не найдено поле 54 перед полем 63 в base_hash для DemirBank' },
          { status: 400 }
        )
        errorResponse.headers.set('Access-Control-Allow-Origin', '*')
        return errorResponse
      }
      
      // Заменяем поле 54
      const oldField54 = lastField54Before63.fullMatch
      const newField54 = `54${amountLen}${amountStr}`
      
      updatedHash = updatedHash.substring(0, lastField54Before63.index) + 
                   newField54 + 
                   updatedHash.substring(lastField54Before63.index + oldField54.length)
      
      // Пересчитываем контрольную сумму
      // Берем все до последнего поля 63
      let dataBefore63 = updatedHash.substring(0, last63Index)
      
      // Вычисляем SHA256 от данных до объекта 63
      const checksumFull = createHash('sha256').update(dataBefore63, 'utf8').digest('hex')
      const checksumCleaned = checksumFull.replace(/-/g, '')
      
      // Берем последние 4 символа в нижнем регистре (для DemirBank)
      const checksum = checksumCleaned.slice(-4).toLowerCase()
      
      // Заменяем поле 63
      const newField63 = `6304${checksum}`
      qrHash = updatedHash.substring(0, last63Index) + newField63
    } else {
      // Для других банков используем существующую логику (если нужно)
      // Проверяем, что реквизит - это 16 цифр
      if (!/^\d{16}$/.test(requisite)) {
        const errorResponse = NextResponse.json(
          { success: false, error: 'Реквизит должен содержать 16 цифр' },
          { status: 400 }
        )
        errorResponse.headers.set('Access-Control-Allow-Origin', '*')
        return errorResponse
      }
      
      // Конвертируем сумму в центы и форматируем
      const amountCents = Math.round(amount * 100)
      const amountStr = amountCents.toString().padStart(5, '0')
      const amountLen = amountStr.length.toString().padStart(2, '0')
      
      // Формируем TLV структуру
      const requisiteLen = requisite.length.toString().padStart(2, '0')
      
      const merchantAccountValue = (
        `0015qr.demirbank.kg` +  // Под-тег 00: домен
        `01047001` +              // Под-тег 01: короткий тип (7001)
        `10${requisiteLen}${requisite}` +  // Под-тег 10: реквизит
        `120211130212`            // Под-теги 12, 13: дополнительные поля
      )
      const merchantAccountLen = merchantAccountValue.length.toString().padStart(2, '0')
      
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
      qrHash = payload + '6304' + checksum
    }
    
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
    
    // Определяем primary_url - по умолчанию O!Money
    const primaryBankMap: Record<string, string> = {
      'demirbank': 'DemirBank',
      'omoney': 'O!Money',
      'balance': 'Balance.kg',
      'bakai': 'Bakai',
      'megapay': 'MegaPay',
      'mbank': 'MBank'
    }
    const primaryBank = primaryBankMap[bank.toLowerCase()] || 'O!Money'
    const primaryUrl = bankLinks[primaryBank] || bankLinks['O!Money']
    
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

