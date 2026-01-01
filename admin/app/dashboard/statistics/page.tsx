'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
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

// Все возможные казино для отображения
const ALL_CASINOS = [
  '1xbet',
  'melbet',
  '1win',
  'mostbet',
  'winwin',
  '888starz',
  '1xcasino',
  'betwinner',
  'wowbet',
]

export default function StatisticsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [stats, setStats] = useState<StatisticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCalendar, setShowCalendar] = useState(false)
  const [selectedDates, setSelectedDates] = useState<Date[]>([])
  const calendarRef = useRef<HTMLDivElement | null>(null)
  const calendarContainerRef = useRef<HTMLDivElement | null>(null)
  const fpInstanceRef = useRef<any>(null)

  const fetchStats = useCallback(async () => {
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
  }, [searchParams])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

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
  }, [searchParams, fetchStats])

  useEffect(() => {
    // Initialize flatpickr when calendar is shown
    if (!showCalendar || !calendarContainerRef.current) return

    const loadFlatpickr = async () => {
      // Load CSS
      const existingLink = document.querySelector('link[href*="flatpickr"]')
      if (!existingLink) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css'
        document.head.appendChild(link)
      }

      // Load JS
      if (!(window as any).flatpickr) {
        const script = document.createElement('script')
        script.src = 'https://cdn.jsdelivr.net/npm/flatpickr'
        script.onload = initFlatpickr
        document.body.appendChild(script)
      } else {
        initFlatpickr()
      }
    }

    const initFlatpickr = () => {
      if (!(window as any).flatpickr || !calendarContainerRef.current) return

      // Destroy old instance
      if (fpInstanceRef.current) {
        fpInstanceRef.current.destroy()
        fpInstanceRef.current = null
      }

      const start = searchParams.get('startDate') || ''
      const end = searchParams.get('endDate') || ''
      const initialDates = start && end ? [start, end] : []
      if (initialDates.length > 0) {
        setSelectedDates(initialDates.map((d) => new Date(d)))
      }

      // Create temporary input for flatpickr
      const tempInput = document.createElement('input')
      tempInput.type = 'text'
      tempInput.style.display = 'none'
      calendarContainerRef.current.appendChild(tempInput)

      fpInstanceRef.current = (window as any).flatpickr(tempInput, {
        mode: 'range',
        dateFormat: 'Y-m-d',
        defaultDate: initialDates,
        locale: {
          rangeSeparator: ' — ',
        },
        inline: true,
        appendTo: calendarContainerRef.current,
        onChange: (dates: Date[]) => {
          setSelectedDates(dates)
        },
        theme: 'dark',
      })
    }

    loadFlatpickr()

    return () => {
      if (fpInstanceRef.current) {
        fpInstanceRef.current.destroy()
        fpInstanceRef.current = null
      }
    }
  }, [showCalendar, searchParams])

  const handleApplyDateRange = () => {
    if (selectedDates.length === 2) {
      const startDate = selectedDates[0].toISOString().split('T')[0]
      const endDate = selectedDates[1].toISOString().split('T')[0]
      const params = new URLSearchParams()
      params.append('startDate', startDate)
      params.append('endDate', endDate)
      router.push(`/dashboard/statistics?${params.toString()}`)
      setShowCalendar(false)
    } else if (selectedDates.length === 1) {
      const date = selectedDates[0].toISOString().split('T')[0]
      const params = new URLSearchParams()
      params.append('date', date)
      router.push(`/dashboard/statistics?${params.toString()}`)
      setShowCalendar(false)
    } else {
      router.push('/dashboard/statistics')
      setShowCalendar(false)
    }
  }

  const handleClearDateRange = () => {
    setSelectedDates([])
    if (fpInstanceRef.current) {
      fpInstanceRef.current.clear()
    }
    router.push('/dashboard/statistics')
    setShowCalendar(false)
  }

  // Close calendar when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setShowCalendar(false)
      }
    }

    if (showCalendar) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showCalendar])

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

  // Get all casinos with stats (including zeros for missing ones)
  const allCasinosWithStats = ALL_CASINOS.map((casinoKey) => {
    const normalizedKey = casinoKey.toLowerCase()
    // Find matching casino in stats
    const matchingKey = Object.keys(stats.casinoStats).find(
      (key) => key.toLowerCase() === normalizedKey
    )
    
    return {
      key: casinoKey,
      name: CASINO_NAMES[casinoKey] || casinoKey,
      stats: matchingKey
        ? stats.casinoStats[matchingKey]
        : {
            depositsSum: 0,
            depositsCount: 0,
            withdrawalsSum: 0,
            withdrawalsCount: 0,
            profit: 0,
          },
    }
  })

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

      {/* Date Range Picker with Calendar */}
      <div className="mb-4 relative" ref={calendarRef}>
        <div
          onClick={() => setShowCalendar(!showCalendar)}
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white cursor-pointer flex items-center justify-between hover:border-blue-500 transition-colors"
        >
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-gray-300">
              {stats.isDateRange && stats.startDate && stats.endDate
                ? `${stats.startDate} — ${stats.endDate}`
                : stats.date
                ? stats.date
                : 'Выберите период'}
            </span>
          </div>
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${showCalendar ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {/* Calendar Dropdown */}
        {showCalendar && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm text-gray-400">Выберите период</span>
              </div>
              {/* Calendar container */}
              <div ref={calendarContainerRef} className="mb-3"></div>
              {selectedDates.length > 0 && (
                <div className="text-xs text-gray-500 mb-3 text-center">
                  Период выбран
                </div>
              )}
              <div className="flex gap-2 pt-3 border-t border-gray-700">
                <button
                  onClick={handleApplyDateRange}
                  className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  Применить
                </button>
                <button
                  onClick={handleClearDateRange}
                  className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  Сбросить
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

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
        <div className="text-base font-bold text-white mb-4">Статистика по казино</div>
        <div className="space-y-3">
          {allCasinosWithStats.map(({ key, name, stats: casinoStats }) => {
            const normalizedKey = key.toLowerCase()
            const isExcluded = normalizedKey.includes('1win') || normalizedKey.includes('mostbet')

            return (
              <div
                key={key}
                className="bg-gray-900 bg-opacity-50 rounded-lg p-4 border border-gray-700"
              >
                <div className="font-semibold text-white mb-3 text-lg">{name}</div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-sm">Пополнения:</span>
                    <span className="text-white font-semibold">
                      {formatCurrency(casinoStats.depositsSum)} ({formatNumber(casinoStats.depositsCount)})
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-sm">Выводы:</span>
                    <span className="text-white font-semibold">
                      {formatCurrency(casinoStats.withdrawalsSum)} ({formatNumber(casinoStats.withdrawalsCount)})
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-gray-700">
                    <span className="text-gray-400 text-sm">Прибыль:</span>
                    <span className={`font-semibold text-lg ${isExcluded ? 'text-gray-500' : 'text-green-500'}`}>
                      {formatCurrency(casinoStats.profit)}
                      {isExcluded && <span className="text-xs ml-1">(не учитывается)</span>}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
