'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

interface StatisticsData {
  totalUsers: number
  totalRequests: number
  pendingRequests: number
  completedRequests: number
  deposits: {
    total: string
    count: number
  }
  withdrawals: {
    total: string
    count: number
  }
  referrals: {
    total: number
    earnings: string
  }
  chart: {
    labels: string[]
    depositsCount: number[]
    depositsSum: number[]
    withdrawalsCount: number[]
    withdrawalsSum: number[]
  }
}

export default function StatisticsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [stats, setStats] = useState<StatisticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateRangeInput, setDateRangeInput] = useState<HTMLInputElement | null>(null)
  const [chartType, setChartType] = useState<'count' | 'sum'>('sum')

  useEffect(() => {
    fetchStats()
    // Мы намеренно не добавляем fetchStats в зависимости, чтобы не пересоздавать эффект
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  useEffect(() => {
    // Инициализация flatpickr для выбора диапазона дат
    if (typeof window === 'undefined' || !dateRangeInput) return

    let fpInstance: any = null

    const loadFlatpickr = async () => {
      if ((window as any).flatpickr) {
        initFlatpickr()
        return
      }

      // Загружаем CSS
      const existingLink = document.querySelector('link[href*="flatpickr"]')
      if (!existingLink) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css'
        document.head.appendChild(link)
      }

      // Загружаем JS
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
      if (!(window as any).flatpickr || !dateRangeInput) return

      // Удаляем старый экземпляр если есть
      if (fpInstance) {
        fpInstance.destroy()
        fpInstance = null
      }

      const start = searchParams.get('startDate') || ''
      const end = searchParams.get('endDate') || ''
      const initialDates = start && end ? [start, end] : []

      fpInstance = (window as any).flatpickr(dateRangeInput, {
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
  }, [dateRangeInput, searchParams, router])

  const fetchStats = async () => {
    setLoading(true)
    try {
      const start = searchParams.get('startDate') || ''
      const end = searchParams.get('endDate') || ''

      const params = new URLSearchParams()
      if (start) params.append('startDate', start)
      if (end) params.append('endDate', end)

      const response = await fetch(`/api/statistics?${params.toString()}`)
      
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

  const handleClearDates = () => {
    if (dateRangeInput && (window as any).flatpickr) {
      const fp = (window as any).flatpickr(dateRangeInput)
      if (fp) {
        fp.clear()
      }
    }
    router.push('/dashboard/statistics')
  }

  useEffect(() => {
    // Инициализация графика
    if (!stats || loading) return

    // Динамически загружаем Chart.js
    const loadChart = async () => {
      if (typeof window === 'undefined') return

      // Проверяем, не загружен ли уже Chart.js
      if ((window as any).Chart) {
        renderChart()
        return
      }

      // Загружаем Chart.js
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js'
      script.onload = renderChart
      document.body.appendChild(script)
    }

    const renderChart = () => {
      const canvas = document.getElementById('statistics-chart') as HTMLCanvasElement
      if (!canvas || !(window as any).Chart) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Удаляем старый график если есть
      const existingChart = (canvas as any).chart
      if (existingChart) {
        existingChart.destroy()
      }

      // Выбираем данные в зависимости от типа графика
      const depositsData = chartType === 'count' ? stats.chart.depositsCount : stats.chart.depositsSum
      const withdrawalsData = chartType === 'count' ? stats.chart.withdrawalsCount : stats.chart.withdrawalsSum
      const yAxisLabel = chartType === 'count' ? 'Количество операций' : 'Сумма (с)'

      // Создаем градиенты для столбцов
      const gradientDeposits = ctx.createLinearGradient(0, 0, 0, 400)
      gradientDeposits.addColorStop(0, 'rgba(37, 99, 235, 1)')
      gradientDeposits.addColorStop(0.7, 'rgba(37, 99, 235, 0.8)')
      gradientDeposits.addColorStop(1, 'rgba(37, 99, 235, 0.4)')

      const gradientWithdrawals = ctx.createLinearGradient(0, 0, 0, 400)
      gradientWithdrawals.addColorStop(0, 'rgba(239, 68, 68, 1)')
      gradientWithdrawals.addColorStop(0.7, 'rgba(239, 68, 68, 0.8)')
      gradientWithdrawals.addColorStop(1, 'rgba(239, 68, 68, 0.4)')

      const chart = new (window as any).Chart(ctx, {
        type: 'bar',
        data: {
          labels: stats.chart.labels,
          datasets: [
            {
              label: 'Пополнения',
              data: depositsData,
              backgroundColor: gradientDeposits,
              borderColor: '#2563eb',
              borderWidth: 2,
              borderRadius: 8,
              borderSkipped: false,
              maxBarThickness: 40,
            },
            {
              label: 'Выводы',
              data: withdrawalsData,
              backgroundColor: gradientWithdrawals,
              borderColor: '#ef4444',
              borderWidth: 2,
              borderRadius: 8,
              borderSkipped: false,
              maxBarThickness: 40,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
            intersect: false,
          },
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: {
                color: '#ffffff',
                font: {
                  size: 12,
                  weight: '600',
                },
                usePointStyle: true,
                pointStyle: 'circle',
                padding: 15,
                boxWidth: 10,
                boxHeight: 10,
              },
            },
            tooltip: {
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              titleColor: '#ffffff',
              bodyColor: '#ffffff',
              borderColor: 'rgba(255, 255, 255, 0.2)',
              borderWidth: 1,
              padding: 14,
              cornerRadius: 10,
              displayColors: true,
              titleFont: {
                size: 14,
                weight: 'bold',
              },
              bodyFont: {
                size: 13,
              },
              boxPadding: 8,
              callbacks: {
                label: function(context: any) {
                  if (chartType === 'count') {
                    return `${context.dataset.label}: ${context.parsed.y} операций`
                  } else {
                    return `${context.dataset.label}: ${context.parsed.y.toFixed(2)} с`
                  }
                }
              }
            },
          },
          scales: {
            x: {
              stacked: false,
              ticks: {
                color: '#9ca3af',
                font: {
                  size: 11,
                  weight: '500',
                },
                padding: 10,
              },
              grid: {
                display: false,
              },
              border: {
                color: 'rgba(156, 163, 175, 0.3)',
                width: 1,
              },
            },
            y: {
              stacked: false,
              beginAtZero: true,
              ticks: {
                color: '#9ca3af',
                font: {
                  size: 11,
                },
                padding: 10,
                callback: function(value: any) {
                  if (chartType === 'count') {
                    return Number(value).toFixed(0)
                  } else {
                    return Number(value).toFixed(0) + ' с'
                  }
                },
              },
              grid: {
                color: 'rgba(156, 163, 175, 0.15)',
                drawBorder: false,
                lineWidth: 1,
              },
              border: {
                color: 'rgba(156, 163, 175, 0.3)',
                width: 1,
              },
            },
          },
        },
      })

      ;(canvas as any).chart = chart
    }

    loadChart()
  }, [stats, loading, chartType])

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

  const depositsTotal = parseFloat(stats.deposits.total || '0')
  const withdrawalsTotal = parseFloat(stats.withdrawals.total || '0')

  return (
    <div className="py-4">
      <div className="flex items-center justify-between mb-4">
        <div className="w-10"></div>
        <div className="flex-1 text-center">
          <h1 className="text-xl font-bold text-white">Общая статистика</h1>
          <p className="text-xs text-gray-300 mt-1">Полный отчет по операциям</p>
        </div>
        <div className="w-10"></div>
      </div>

      {/* Период */}
      <div className="bg-gray-800 bg-opacity-50 rounded-xl p-4 mb-4 border border-gray-700 backdrop-blur-sm">
        <div className="text-base font-bold text-white mb-3">Период (от — до)</div>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              ref={(el) => setDateRangeInput(el)}
              type="text"
              placeholder="Выберите период"
              className="w-full bg-gray-900 text-white border border-gray-700 rounded-xl px-4 py-3 pl-12 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer transition-all"
              readOnly
            />
            <div className="absolute left-4 top-1/2 transform -translate-y-1/2 pointer-events-none">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          {(searchParams.get('startDate') || searchParams.get('endDate')) && (
            <button
              onClick={handleClearDates}
              className="bg-gray-700 text-white px-4 py-3 rounded-xl hover:bg-gray-600 font-medium text-sm whitespace-nowrap transition-all hover:scale-105 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Сбросить
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-2">Оставьте пустым, чтобы показать последние 30 дней</p>
      </div>

      {/* Общая статистика */}
      <div className="bg-gray-800 bg-opacity-50 rounded-xl p-4 mb-4 border border-gray-700 backdrop-blur-sm">
        <div className="text-base font-bold text-white mb-3">Общая статистика</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-900 bg-opacity-50 rounded-xl p-3 border border-gray-700">
            <div className="text-xs text-gray-400 mb-1">Всего пополнений</div>
            <div className="text-blue-500 font-bold text-lg">
              {depositsTotal.toFixed(2)} с
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {stats.deposits.count} операций
            </div>
          </div>
          <div className="bg-gray-900 bg-opacity-50 rounded-xl p-3 border border-gray-700">
            <div className="text-xs text-gray-400 mb-1">Всего выводов</div>
            <div className="text-red-500 font-bold text-lg">
              {withdrawalsTotal.toFixed(2)} с
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {stats.withdrawals.count} операций
            </div>
          </div>
        </div>
      </div>

      {/* Дополнительная статистика */}
      <div className="bg-gray-800 bg-opacity-50 rounded-xl p-4 mb-4 border border-gray-700 backdrop-blur-sm">
        <div className="text-base font-bold text-white mb-3">Дополнительная информация</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-900 bg-opacity-50 rounded-xl p-3 border border-gray-700">
            <div className="text-xs text-gray-400 mb-1">Всего пользователей</div>
            <div className="text-white font-bold text-lg">
              {stats.totalUsers}
            </div>
          </div>
          <div className="bg-gray-900 bg-opacity-50 rounded-xl p-3 border border-gray-700">
            <div className="text-xs text-gray-400 mb-1">Всего заявок</div>
            <div className="text-white font-bold text-lg">
              {stats.totalRequests}
            </div>
          </div>
          <div className="bg-gray-900 bg-opacity-50 rounded-xl p-3 border border-gray-700">
            <div className="text-xs text-gray-400 mb-1">Ожидающие</div>
            <div className="text-yellow-500 font-bold text-lg">
              {stats.pendingRequests}
            </div>
          </div>
          <div className="bg-gray-900 bg-opacity-50 rounded-xl p-3 border border-gray-700">
            <div className="text-xs text-gray-400 mb-1">Завершенные</div>
            <div className="text-green-500 font-bold text-lg">
              {stats.completedRequests}
            </div>
          </div>
        </div>
      </div>

      {/* График */}
      <div className="bg-gray-800 bg-opacity-50 rounded-xl p-4 border border-gray-700 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="text-base font-bold text-white">Полный отчет</div>
          <div className="flex gap-2">
            <button
              onClick={() => setChartType('sum')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                chartType === 'sum'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              По сумме
            </button>
            <button
              onClick={() => setChartType('count')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                chartType === 'count'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              По количеству
            </button>
          </div>
        </div>
        <div className="h-[350px]">
          <canvas id="statistics-chart"></canvas>
        </div>
      </div>
    </div>
  )
}
