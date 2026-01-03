'use client'

import { useEffect, useState } from 'react'

interface PlatformLimit {
  key: string
  name: string
  limit: number
}

interface LimitsStats {
  platformLimits: PlatformLimit[]
}

export default function LimitsPage() {
  const [stats, setStats] = useState<LimitsStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
    // Автообновление каждые 30 секунд
    const interval = setInterval(() => {
      fetchStats()
    }, 30000)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/limits/stats')
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()

      if (data.success && data.data) {
        setStats({
          platformLimits: data.data.platformLimits || []
        })
      } else {
        console.error('API returned error:', data.error || 'Unknown error')
        setStats(null)
      }
    } catch (error) {
      console.error('Failed to fetch limits stats:', error)
      setStats(null)
    } finally {
      setLoading(false)
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

      {/* Лимиты платформ */}
      <div className="bg-gray-800 bg-opacity-50 rounded-xl p-4 border border-gray-700 backdrop-blur-sm">
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
    </div>
  )
}




