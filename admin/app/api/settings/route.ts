import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'

export async function GET(request: NextRequest) {
  try {
    requireAuth(request)

    // Получаем настройки из BotConfiguration
    const configs = await prisma.botConfiguration.findMany()
    const settingsMap: Record<string, any> = {}
    
    configs.forEach((config) => {
      let value: any = config.value
      // Пытаемся распарсить JSON, если это строка
      if (typeof value === 'string') {
        try {
          value = JSON.parse(value)
        } catch {
          // Если не JSON, оставляем как строку
        }
      }
      settingsMap[config.key] = value
    })

    // Получаем настройки депозитов
    const depositSettings = settingsMap.deposit_settings || settingsMap.deposits || {
      enabled: true,
      banks: ['mbank', 'bakai', 'balance', 'demir', 'omoney', 'megapay']
    }

    // Получаем настройки выводов
    const withdrawalSettings = settingsMap.withdrawal_settings || settingsMap.withdrawals || {
      enabled: true,
      banks: ['kompanion', 'odengi', 'bakai', 'balance', 'megapay', 'mbank']
    }

    // Получаем настройки казино
    const casinoSettings = settingsMap.casinos || {
      '1xbet': true,
      '1win': true,
      melbet: true,
      mostbet: true,
      winwin: true,
      '888starz': true,
      '1xcasino': true,
      betwinner: true,
      wowbet: true
    }

    // Получаем настройку подписки на канал
    const requireChannelSubscription = settingsMap.require_channel_subscription === 'true' || settingsMap.require_channel_subscription === true || settingsMap.require_channel_subscription === undefined

    const settings = {
      pause: settingsMap.pause === 'true' || settingsMap.pause === true,
      maintenance_message: settingsMap.maintenance_message || 'Технические работы. Попробуйте позже.',
      deposits_enabled: typeof depositSettings === 'object' ? depositSettings.enabled : depositSettings !== false,
      withdrawals_enabled: typeof withdrawalSettings === 'object' ? withdrawalSettings.enabled : withdrawalSettings !== false,
      enabled_deposit_banks: typeof depositSettings === 'object' ? depositSettings.banks : depositSettings || [],
      enabled_withdrawal_banks: typeof withdrawalSettings === 'object' ? withdrawalSettings.banks : withdrawalSettings || [],
      require_receipt_photo: settingsMap.require_receipt_photo === 'true' || settingsMap.require_receipt_photo === true,
      casinos: casinoSettings,
      channel: (typeof settingsMap.channel === 'string' ? settingsMap.channel : settingsMap.channel?.toString()) || '@bingokg_news',
      require_channel_subscription: requireChannelSubscription,
    }

    return NextResponse.json(createApiResponse(settings))
  } catch (error: any) {
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to fetch settings'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    requireAuth(request)

    const body = await request.json()

    // Сохраняем настройки в BotConfiguration
    const updateSetting = async (key: string, value: any, description: string) => {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value)
      
      await prisma.botConfiguration.upsert({
        where: { key },
        update: { value: stringValue, description },
        create: { key, value: stringValue, description },
      })
    }

    if (body.pause !== undefined) {
      await updateSetting('pause', body.pause.toString(), 'Пауза бота')
    }

    if (body.maintenance_message !== undefined) {
      await updateSetting('maintenance_message', body.maintenance_message, 'Сообщение о технических работах')
    }

    if (body.deposits_enabled !== undefined || body.enabled_deposit_banks !== undefined) {
      const depositSettings = {
        enabled: body.deposits_enabled !== undefined ? body.deposits_enabled : true,
        banks: body.enabled_deposit_banks || []
      }
      await updateSetting('deposits', depositSettings, 'Настройки депозитов')
    }

    if (body.withdrawals_enabled !== undefined || body.enabled_withdrawal_banks !== undefined) {
      const withdrawalSettings = {
        enabled: body.withdrawals_enabled !== undefined ? body.withdrawals_enabled : true,
        banks: body.enabled_withdrawal_banks || []
      }
      await updateSetting('withdrawals', withdrawalSettings, 'Настройки выводов')
    }

    if (body.require_receipt_photo !== undefined) {
      await updateSetting('require_receipt_photo', body.require_receipt_photo.toString(), 'Требовать фото чека при оплате')
    }

    if (body.casinos !== undefined) {
      await updateSetting('casinos', body.casinos, 'Настройки казино')
    }

    if (body.channel !== undefined && body.channel !== null) {
      // Убеждаемся что channel - строка
      const channelValue = typeof body.channel === 'string' ? body.channel.trim() : String(body.channel || '@bingokg_news')
      if (channelValue) {
        await updateSetting('channel', channelValue, 'Канал для подписки')
      }
    }

    if (body.require_channel_subscription !== undefined) {
      await updateSetting('require_channel_subscription', body.require_channel_subscription.toString(), 'Требовать подписку на канал')
    }

    return NextResponse.json(
      createApiResponse(null, undefined)
    )
  } catch (error: any) {
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to save settings'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

