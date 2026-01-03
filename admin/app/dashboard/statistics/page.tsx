'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { DatePicker } from '@/components/DatePicker'

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
  const [selectedDateRange, setSelectedDateRange] = useState<{ from: string; to: string } | string | null>(null)

  // Инициализируем selectedDateRange из URL параметров
  useEffect(() => {
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const date = searchParams.get('date')
    
    if (startDate && endDate) {
      setSelectedDateRange({ from: startDate, to: endDate })
    } else if (date) {
      setSelectedDateRange(date)
    } else {
      setSelectedDateRange(null)
    }
  }, [searchParams])

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

  const handleDateRangeChange = (value: { from: string; to: string } | string | null) => {
    setSelectedDateRange(value)
    
    if (value && typeof value === 'object' && value.from && value.to) {
      const params = new URLSearchParams()
      params.append('startDate', value.from)
      params.append('endDate', value.to)
      router.push(`/dashboard/statistics?${params.toString()}`)
    } else if (value && typeof value === 'string') {
      const params = new URLSearchParams()
      params.append('date', value)
      router.push(`/dashboard/statistics?${params.toString()}`)
    } else {
      router.push('/dashboard/statistics')
    }
  }

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

      {/* Date Range Picker */}
      <div className="mb-4">
        <DatePicker 
          value={selectedDateRange || undefined} 
          onChange={handleDateRangeChange} 
          range={true}
          placeholder="Выберите период"
        />
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
