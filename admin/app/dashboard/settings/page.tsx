'use client'

import { useEffect, useState } from 'react'

interface Settings {
  pause: boolean
  maintenance_message: string
  deposits_enabled: boolean
  withdrawals_enabled: boolean
  enabled_deposit_banks: string[]
  enabled_withdrawal_banks: string[]
  require_receipt_photo: boolean
  casinos: {
    '1xbet': boolean
    '1win': boolean
    melbet: boolean
    mostbet: boolean
    winwin: boolean
    '888starz': boolean
    '1xcasino': boolean
    betwinner: boolean
    wowbet: boolean
  }
  channel?: string
  require_channel_subscription?: boolean
}

const DEPOSIT_BANKS = [
  { id: 'mbank', name: 'MBank' },
  { id: 'demir', name: 'DemirBank' },
  { id: 'balance', name: 'Balance.kg' },
  { id: 'omoney', name: 'О банк' },
  { id: 'megapay', name: 'MegaPay' },
  { id: 'bakai', name: 'Bakai' },
]

const WITHDRAWAL_BANKS = [
  { id: 'kompanion', name: 'Компаньон' },
  { id: 'odengi', name: 'О банк' },
  { id: 'bakai', name: 'Bakai' },
  { id: 'balance', name: 'Balance.kg' },
  { id: 'megapay', name: 'MegaPay' },
  { id: 'mbank', name: 'MBank' },
]

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings')
      const data = await response.json()

      if (data.success && data.data) {
        // Убеждаемся что channel есть (значение по умолчанию)
        const settingsData = {
          ...data.data,
          channel: (data.data.channel && typeof data.data.channel === 'string') ? data.data.channel : '@bingokg_news'
        }
        setSettings(settingsData)
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    if (!settings) return

    setSaving(true)
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })

      const data = await response.json()
      if (data.success) {
        alert('Настройки сохранены')
      } else {
        alert(data.error || 'Ошибка при сохранении')
      }
    } catch (error) {
      console.error('Failed to save settings:', error)
      alert('Ошибка при сохранении настроек')
    } finally {
      setSaving(false)
    }
  }

  const updateSetting = (key: keyof Settings, value: any) => {
    if (!settings) return
    setSettings({ ...settings, [key]: value })
  }

  const toggleBank = (bankId: string, type: 'deposit' | 'withdrawal') => {
    if (!settings) return

    const key = type === 'deposit' ? 'enabled_deposit_banks' : 'enabled_withdrawal_banks'
    const banks = [...settings[key]]
    const index = banks.indexOf(bankId)

    if (index > -1) {
      banks.splice(index, 1)
    } else {
      banks.push(bankId)
    }

    setSettings({ ...settings, [key]: banks })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (!settings) {
    return <div className="text-center text-gray-400 py-12">Не удалось загрузить настройки</div>
  }

  return (
    <div className="py-4">
      <div className="flex items-center justify-between mb-4">
        <div className="w-10"></div>
        <div className="flex-1 text-center">
          <h1 className="text-xl font-bold text-white">Настройки</h1>
          <p className="text-xs text-gray-300 mt-1">Управление ботом</p>
        </div>
        <div className="w-10"></div>
      </div>

      {/* Основные настройки */}
      <div className="bg-gray-800 bg-opacity-50 rounded-xl p-4 mb-4 border border-gray-700 backdrop-blur-sm">
        <h2 className="text-base font-bold text-white mb-4">Основные настройки</h2>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Пауза бота</p>
              <p className="text-xs text-gray-400">Временно отключить бота</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.pause}
                onChange={(e) => updateSetting('pause', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Сообщение обслуживания
            </label>
            <textarea
              value={settings.maintenance_message}
              onChange={(e) => updateSetting('maintenance_message', e.target.value)}
              className="w-full bg-gray-900 text-white border border-gray-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Введите сообщение..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Канал для подписки
            </label>
            <input
              type="text"
              value={settings.channel || '@bingokg_news'}
              onChange={(e) => updateSetting('channel', e.target.value)}
              className="w-full bg-gray-900 text-white border border-gray-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="@bingokg_news"
            />
            <p className="text-xs text-gray-400 mt-1">Укажите username канала (например: @bingokg_news)</p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Требовать подписку на канал</p>
              <p className="text-xs text-gray-400">Проверять подписку пользователя на канал перед использованием бота</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.require_channel_subscription !== false}
                onChange={(e) => updateSetting('require_channel_subscription', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Настройка чека на заявке */}
      <div className="bg-gray-800 bg-opacity-50 rounded-xl p-4 mb-4 border border-gray-700 backdrop-blur-sm">
        <h2 className="text-base font-bold text-white mb-4">Чек на заявке</h2>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Требовать фото чека</p>
              <p className="text-xs text-gray-400">Запрашивать фото чека при создании заявки на пополнение</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.require_receipt_photo}
                onChange={(e) => updateSetting('require_receipt_photo', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Настройки пополнений */}
      <div className="bg-gray-800 bg-opacity-50 rounded-xl p-4 mb-4 border border-gray-700 backdrop-blur-sm">
        <h2 className="text-base font-bold text-white mb-4">Настройки пополнений</h2>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Включить пополнения</p>
              <p className="text-xs text-gray-400">Разрешить пополнения</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.deposits_enabled}
                onChange={(e) => updateSetting('deposits_enabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
            </label>
          </div>

          <div>
            <p className="text-sm font-medium text-white mb-3">
              Доступные банки ({settings.enabled_deposit_banks.length} из {DEPOSIT_BANKS.length})
            </p>
            <div className="grid grid-cols-2 gap-2">
              {DEPOSIT_BANKS.map((bank) => (
                <label
                  key={bank.id}
                  className="flex items-center justify-between p-3 bg-gray-900 rounded-lg border border-gray-700 cursor-pointer hover:bg-gray-800"
                >
                  <span className="text-sm text-white">{bank.name}</span>
                  <input
                    type="checkbox"
                    checked={settings.enabled_deposit_banks.includes(bank.id)}
                    onChange={() => toggleBank(bank.id, 'deposit')}
                    className="w-4 h-4 text-blue-500 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Настройки выводов */}
      <div className="bg-gray-800 bg-opacity-50 rounded-xl p-4 mb-4 border border-gray-700 backdrop-blur-sm">
        <h2 className="text-base font-bold text-white mb-4">Настройки выводов</h2>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Включить выводы</p>
              <p className="text-xs text-gray-400">Разрешить выводы</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.withdrawals_enabled}
                onChange={(e) => updateSetting('withdrawals_enabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
            </label>
          </div>

          <div>
            <p className="text-sm font-medium text-white mb-3">
              Доступные банки ({settings.enabled_withdrawal_banks.length} из {WITHDRAWAL_BANKS.length})
            </p>
            <div className="grid grid-cols-2 gap-2">
              {WITHDRAWAL_BANKS.map((bank) => (
                <label
                  key={bank.id}
                  className="flex items-center justify-between p-3 bg-gray-900 rounded-lg border border-gray-700 cursor-pointer hover:bg-gray-800"
                >
                  <span className="text-sm text-white">{bank.name}</span>
                  <input
                    type="checkbox"
                    checked={settings.enabled_withdrawal_banks.includes(bank.id)}
                    onChange={() => toggleBank(bank.id, 'withdrawal')}
                    className="w-4 h-4 text-blue-500 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Настройки казино */}
      <div className="bg-gray-800 bg-opacity-50 rounded-xl p-4 mb-4 border border-gray-700 backdrop-blur-sm">
        <h2 className="text-base font-bold text-white mb-4">Настройки казино</h2>
        
        <div className="space-y-3">
          {(['1xbet', '1win', 'melbet', 'mostbet', 'winwin', '888starz', '1xcasino', 'betwinner', 'wowbet'] as const).map((casino) => (
            <div key={casino} className="flex items-center justify-between">
              <span className="text-sm font-medium text-white uppercase">{casino}</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.casinos[casino] || false}
                  onChange={(e) => updateSetting('casinos', { ...settings.casinos, [casino]: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Кнопка сохранения */}
      <button
        onClick={saveSettings}
        disabled={saving}
        className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3 rounded-xl hover:from-blue-700 hover:to-blue-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? 'Сохранение...' : 'Сохранить настройки'}
      </button>
    </div>
  )
}

