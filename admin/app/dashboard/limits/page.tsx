'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

interface PlatformLimit {
  key: string
  name: string
  limit: number
}

interface LimitsStats {
  platformLimits: PlatformLimit[]
  totalDepositsCount: number
  totalDepositsSum: number
  totalWithdrawalsCount: number
  totalWithdrawalsSum: number
  approximateIncome: number
  chart: {
    labels: string[]
    deposits: number[]
    withdrawals: number[]
  }
}

export default function LimitsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [stats, setStats] = useState<LimitsStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState('')

  useEffect(() => {
    fetchStats()
  }, [searchParams])

  const fetchStats = async () => {
    setLoading(true)
    try {
      const start = searchParams.get('start') || ''
      const end = searchParams.get('end') || ''

      const params = new URLSearchParams()
      if (start) params.append('start', start)
      if (end) params.append('end', end)

      const response = await fetch(`/api/limits/stats?${params.toString()}`)
      const data = await response.json()

      if (data.success) {
        setStats(data.data)
        
        // Устанавливаем значение дат для инпута
        if (start || end) {
          setDateRange(`${start || ''} — ${end || ''}`)
        } else {
          setDateRange('')
        }
      }
    } catch (error) {
      console.error('Failed to fetch limits stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePeriodSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const parts = dateRange.split(/\s*[—\-–toдо]+\s*/i).filter(Boolean)
    const start = parts[0]?.trim() || ''
    const end = parts[1]?.trim() || ''

    const params = new URLSearchParams()
    if (start) params.append('start', start)
    if (end) params.append('end', end)

    router.push(`/dashboard/limits?${params.toString()}`)
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
      const canvas = document.getElementById('operations-chart') as HTMLCanvasElement
      if (!canvas || !(window as any).Chart) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Удаляем старый график если есть
      const existingChart = (canvas as any).chart
      if (existingChart) {
        existingChart.destroy()
      }

      // Создаем градиенты для столбцов
      const gradientDeposits = ctx.createLinearGradient(0, 0, 0, 400)
      gradientDeposits.addColorStop(0, 'rgba(37, 99, 235, 1)')
      gradientDeposits.addColorStop(0.7, 'rgba(37, 99, 235, 0.8)')
      gradientDeposits.addColorStop(1, 'rgba(37, 99, 235, 0.4)')

      const gradientWithdrawals = ctx.createLinearGradient(0, 0, 0, 400)
      gradientWithdrawals.addColorStop(0, 'rgba(251, 191, 36, 1)')
      gradientWithdrawals.addColorStop(0.7, 'rgba(251, 191, 36, 0.8)')
      gradientWithdrawals.addColorStop(1, 'rgba(251, 191, 36, 0.4)')

      const chart = new (window as any).Chart(ctx, {
        type: 'bar',
        data: {
          labels: stats.chart.labels,
          datasets: [
            {
              label: 'Пополнения',
              data: stats.chart.deposits,
              backgroundColor: gradientDeposits,
              borderColor: '#2563eb',
              borderWidth: 2,
              borderRadius: 8,
              borderSkipped: false,
              maxBarThickness: 40,
            },
            {
              label: 'Выводы',
              data: stats.chart.withdrawals,
              backgroundColor: gradientWithdrawals,
              borderColor: '#fbbf24',
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
                  return `${context.dataset.label}: ${context.parsed.y} операций`
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
                stepSize: 1,
                callback: function(value: any) {
                  return Number(value).toFixed(0)
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
  }, [stats, loading])

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

  return (
    <div className="py-4">
      <div className="flex items-center justify-between mb-4">
        <div className="w-10"></div>
        <div className="flex-1 text-center">
          <h1 className="text-xl font-bold text-white">Лимиты</h1>
          <p className="text-xs text-gray-300 mt-1">Лимиты и балансы платформ</p>
        </div>
        <div className="w-10"></div>
      </div>

      {/* Период */}
      <div className="bg-gray-800 bg-opacity-50 rounded-xl p-4 mb-4 border border-gray-700 backdrop-blur-sm">
        <div className="text-base font-bold text-white mb-3">Период (от — до)</div>
        <form onSubmit={handlePeriodSubmit} className="flex gap-2">
          <input
            type="text"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            placeholder="ГГГГ-ММ-ДД — ГГГГ-ММ-ДД"
            className="flex-1 bg-gray-900 text-white border border-gray-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2 rounded-xl hover:from-blue-700 hover:to-blue-800 font-medium text-sm whitespace-nowrap"
          >
            Применить
          </button>
        </form>
        <p className="text-xs text-gray-400 mt-2">Оставьте пустым, чтобы показать все время</p>
      </div>

      {/* Лимиты платформ */}
      <div className="bg-gray-800 bg-opacity-50 rounded-xl p-4 mb-4 border border-gray-700 backdrop-blur-sm">
        <div className="text-base font-bold text-white mb-3">Лимиты платформ</div>
        {stats.platformLimits.length > 0 ? (
          <div className="space-y-2">
            {stats.platformLimits.map((platform) => (
              <div key={platform.key} className="flex items-center justify-between py-2">
                <span className="text-white">{platform.name}</span>
                <span className="text-blue-500 font-bold">
                  {platform.limit.toFixed(2)} с
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-gray-400 text-sm">Нет данных по лимитам</div>
        )}
      </div>

      {/* Общая статистика */}
      <div className="bg-gray-800 bg-opacity-50 rounded-xl p-4 mb-4 border border-gray-700 backdrop-blur-sm">
        <div className="text-base font-bold text-white mb-3">Общая статистика</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-900 bg-opacity-50 rounded-xl p-3 border border-gray-700">
            <div className="text-xs text-gray-400 mb-1">Всего пополнений</div>
            <div className="text-blue-500 font-bold text-lg">
              {stats.totalDepositsSum.toFixed(2)} с
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {stats.totalDepositsCount} операций
            </div>
          </div>
          <div className="bg-gray-900 bg-opacity-50 rounded-xl p-3 border border-gray-700">
            <div className="text-xs text-gray-400 mb-1">Всего выводов</div>
            <div className="text-red-500 font-bold text-lg">
              {stats.totalWithdrawalsSum.toFixed(2)} с
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {stats.totalWithdrawalsCount} операций
            </div>
          </div>
          <div className="bg-gray-900 bg-opacity-50 rounded-xl p-3 border border-gray-700">
            <div className="text-xs text-gray-400 mb-1">Сумма пополнений</div>
            <div className="text-blue-500 font-bold text-lg">
              {stats.totalDepositsSum.toFixed(2)} с
            </div>
          </div>
          <div className="bg-gray-900 bg-opacity-50 rounded-xl p-3 border border-gray-700">
            <div className="text-xs text-gray-400 mb-1">Сумма выводов</div>
            <div className="text-red-500 font-bold text-lg">
              {stats.totalWithdrawalsSum.toFixed(2)} с
            </div>
          </div>
        </div>
      </div>

      {/* Приблизительный доход */}
      <div className="bg-gradient-to-r from-blue-500/20 to-blue-600/20 rounded-xl p-4 mb-4 border border-blue-500/30 backdrop-blur-sm">
        <div className="text-base font-bold text-white mb-2">Приблизительный доход</div>
        <div className="text-blue-500 font-bold text-2xl mb-1">
          {stats.approximateIncome.toFixed(2)} с
        </div>
        <div className="text-xs text-gray-400">8% от пополнений + 2% от выводов</div>
      </div>

      {/* График */}
      <div className="bg-gray-800 bg-opacity-50 rounded-xl p-4 border border-gray-700 backdrop-blur-sm">
        <div className="text-base font-bold text-white mb-3">График операций</div>
        <div className="h-[250px]">
          <canvas id="operations-chart"></canvas>
        </div>
      </div>
    </div>
  )
}




