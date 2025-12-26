'use client'

import { useEffect, useState, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

interface CasinoStats {
  depositsSum: number
  depositsCount: number
  withdrawalsSum: number
  withdrawalsCount: number
  profit: number
}

interface StatisticsData {
  totalDeposits: number
  totalDepositsCount: number
  totalWithdrawals: number
  totalWithdrawalsCount: number
  totalProfit: number
  totalLimit: number
  totalLimitUSD: number
  casinoStats: Record<string, CasinoStats>
  isDateRange?: boolean
  startDate?: string
  endDate?: string
  date?: string
  isClosed?: boolean
  isToday?: boolean
}

const CASINO_NAMES: Record<string, string> = {
  '1xbet': '1xbet',
  'melbet': 'Melbet',
  '1win': '1WIN',
  'mostbet': 'Mostbet',
  'winwin': 'Winwin',
  '888starz': '888starz',
  '1xcasino': '1xCasino',
  'betwinner': 'BetWinner',
  'wowbet': 'WowBet',
}

export default function StatisticsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [stats, setStats] = useState<StatisticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const dateRangeInputRef = useRef<HTMLInputElement | null>(null)

  const fetchStats = async () => {
    setLoading(true)
    try {
      const date = searchParams.get('date')
      const startDate = searchParams.get('startDate')
      const endDate = searchParams.get('endDate')

      let url = '/api/shifts/stats?'
      if (startDate && endDate) {
        url += `startDate=${startDate}&endDate=${endDate}`
      } else if (date) {
        url += `date=${date}`
      }

      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()

      if (data.success && data.data) {
        setStats(data.data)
      } else {
        console.error('API returned error:', data.error || 'Unknown error')
        setStats(null)
      }
    } catch (error) {
      console.error('Failed to fetch statistics:', error)
      setStats(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  useEffect(() => {
    // Auto-refresh every 30 seconds if today is selected
    const date = searchParams.get('date')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    
    // Only auto-refresh if no date range and no specific date (defaults to today)
    if (!date && !startDate && !endDate) {
      const interval = setInterval(() => {
        fetchStats()
      }, 30000)

      return () => clearInterval(interval)
    }
  }, [searchParams])

  useEffect(() => {
    // Initialize flatpickr for date range selection
    if (typeof window === 'undefined' || !dateRangeInputRef.current) return

    let fpInstance: any = null

    const loadFlatpickr = async () => {
      if ((window as any).flatpickr) {
        initFlatpickr()
        return
      }

      // Load CSS
      const existingLink = document.querySelector('link[href*="flatpickr"]')
      if (!existingLink) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css'
        document.head.appendChild(link)
      }

      // Load JS
      const existingScript = document.querySelector('script[src*="flatpickr"]')
      if (!existingScript) {
        const script = document.createElement('script')
        script.src = 'https://cdn.jsdelivr.net/npm/flatpickr'
        script.onload = initFlatpickr
        document.body.appendChild(script)
      } else {
        initFlatpickr()
      }
    }

    const initFlatpickr = () => {
      if (!(window as any).flatpickr || !dateRangeInputRef.current) return

      // Remove old instance if exists
      if (fpInstance) {
        fpInstance.destroy()
        fpInstance = null
      }

      const start = searchParams.get('startDate') || ''
      const end = searchParams.get('endDate') || ''
      const initialDates = start && end ? [start, end] : []

      fpInstance = (window as any).flatpickr(dateRangeInputRef.current, {
        mode: 'range',
        dateFormat: 'Y-m-d',
        defaultDate: initialDates,
        locale: {
          rangeSeparator: ' — ',
        },
        onChange: (selectedDates: Date[]) => {
          if (selectedDates.length === 2) {
            const startDate = selectedDates[0].toISOString().split('T')[0]
            const endDate = selectedDates[1].toISOString().split('T')[0]
            const params = new URLSearchParams()
            params.append('startDate', startDate)
            params.append('endDate', endDate)
            router.push(`/dashboard/statistics?${params.toString()}`)
          } else if (selectedDates.length === 0) {
            router.push('/dashboard/statistics')
          }
        },
        theme: 'dark',
      })
    }

    loadFlatpickr()

    return () => {
      if (fpInstance) {
        fpInstance.destroy()
        fpInstance = null
      }
    }
  }, [dateRangeInputRef, searchParams, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (!stats) {
    return <div className="text-center text-gray-400 py-12">Не удалось загрузить данные</div>
  }

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num)
  }

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num)
  }

  return (
    <div className="py-4">
      <div className="flex items-center justify-between mb-4">
        <div className="w-10"></div>
        <div className="flex-1 text-center">
          <h1 className="text-xl font-bold text-white">Статистика</h1>
          <p className="text-xs text-gray-300 mt-1">Статистика по сменам</p>
        </div>
        <div className="w-10"></div>
      </div>

      {/* Date Range Picker */}
      <div className="mb-4">
        <input
          ref={dateRangeInputRef}
          type="text"
          placeholder="Выберите дату или диапазон дат"
          className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Shift Status Badge (only for single date) */}
      {!stats.isDateRange && (
        <div className="mb-4 flex justify-center">
          <div
            className={`px-4 py-2 rounded-lg font-semibold ${
              stats.isClosed
                ? 'bg-green-500 text-white'
                : stats.isToday
                ? 'bg-blue-500 text-white'
                : 'bg-gray-600 text-gray-200'
            }`}
          >
            {stats.isClosed ? 'Смена закрыта' : stats.isToday ? 'Смена открыта (сегодня)' : 'Смена не закрыта'}
          </div>
        </div>
      )}

      {/* General Statistics Cards */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Всего пополнений */}
        <div className="bg-gray-800 bg-opacity-50 rounded-xl p-4 border border-gray-700 backdrop-blur-sm">
          <div className="text-sm text-gray-400 mb-1">Всего пополнений</div>
          <div className="text-2xl font-bold text-white">{formatNumber(stats.totalDepositsCount)}</div>
        </div>

        {/* Всего выводов */}
        <div className="bg-gray-800 bg-opacity-50 rounded-xl p-4 border border-gray-700 backdrop-blur-sm">
          <div className="text-sm text-gray-400 mb-1">Всего выводов</div>
          <div className="text-2xl font-bold text-white">{formatNumber(stats.totalWithdrawalsCount)}</div>
        </div>

        {/* Сумма пополнений */}
        <div className="bg-gray-800 bg-opacity-50 rounded-xl p-4 border border-gray-700 backdrop-blur-sm">
          <div className="text-sm text-gray-400 mb-1">Сумма пополнений</div>
          <div className="text-2xl font-bold text-white">{formatCurrency(stats.totalDeposits)}</div>
        </div>

        {/* Сумма выводов */}
        <div className="bg-gray-800 bg-opacity-50 rounded-xl p-4 border border-gray-700 backdrop-blur-sm">
          <div className="text-sm text-gray-400 mb-1">Сумма выводов</div>
          <div className="text-2xl font-bold text-white">{formatCurrency(stats.totalWithdrawals)}</div>
        </div>
      </div>

      {/* Общий лимит */}
      <div className="bg-gray-800 bg-opacity-50 rounded-xl p-4 mb-4 border border-gray-700 backdrop-blur-sm">
        <div className="text-sm text-gray-400 mb-1">Общий лимит</div>
        <div className="text-2xl font-bold text-white">
          {formatCurrency(stats.totalLimit)}c / {formatCurrency(stats.totalLimitUSD)}$
        </div>
      </div>

      {/* Приблизительный доход */}
      <div className="bg-gray-800 bg-opacity-50 rounded-xl p-4 mb-4 border border-gray-700 backdrop-blur-sm">
        <div className="text-sm text-gray-400 mb-1">Приблизительный доход</div>
        <div className="text-2xl font-bold text-green-500">{formatCurrency(stats.totalProfit)}</div>
      </div>

      {/* Casino Statistics */}
      <div className="bg-gray-800 bg-opacity-50 rounded-xl p-4 border border-gray-700 backdrop-blur-sm">
        <div className="text-base font-bold text-white mb-3">Статистика по казино</div>
        {Object.keys(stats.casinoStats).length > 0 ? (
          <div className="space-y-3">
            {Object.entries(stats.casinoStats)
              .sort(([a], [b]) => {
                const nameA = CASINO_NAMES[a.toLowerCase()] || a
                const nameB = CASINO_NAMES[b.toLowerCase()] || b
                return nameA.localeCompare(nameB, 'ru')
              })
              .map(([bookmaker, casinoStats]) => {
                const casinoName = CASINO_NAMES[bookmaker.toLowerCase()] || bookmaker
                const normalizedBookmaker = bookmaker.toLowerCase()
                const isExcluded = normalizedBookmaker.includes('1win') || normalizedBookmaker.includes('mostbet')

                return (
                  <div
                    key={bookmaker}
                    className="bg-gray-900 bg-opacity-50 rounded-lg p-3 border border-gray-700"
                  >
                    <div className="font-semibold text-white mb-2">{casinoName}</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-400">Пополнения: </span>
                        <span className="text-white font-semibold">
                          {formatCurrency(casinoStats.depositsSum)} ({formatNumber(casinoStats.depositsCount)})
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">Выводы: </span>
                        <span className="text-white font-semibold">
                          {formatCurrency(casinoStats.withdrawalsSum)} ({formatNumber(casinoStats.withdrawalsCount)})
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-gray-400">Прибыль: </span>
                        <span className={`font-semibold ${isExcluded ? 'text-gray-500' : 'text-green-500'}`}>
                          {formatCurrency(casinoStats.profit)}
                          {isExcluded && ' (не учитывается)'}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        ) : (
          <div className="text-gray-400 text-sm">Нет данных по казино</div>
        )}
      </div>
    </div>
  )
}

