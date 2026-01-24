'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface LimitLog {
  id: number
  casino: string
  requestId: number | null
  requestType: string
  amount: string
  limitBefore: string
  limitAfter: string
  userId: string | null
  accountId: string | null
  processedBy: string | null
  isMismatch: boolean
  mismatchReason: string | null
  createdAt: string
}

interface LimitsStats {
  limits: Array<{
    casino: string
    name: string
    currentLimit: number
    realLimit: number
    difference: number
    isMismatch: boolean
  }>
  mismatchesCount: number
  recentMismatches: LimitLog[]
}

export default function CasinoLimitsPage() {
  const router = useRouter()
  const [stats, setStats] = useState<LimitsStats | null>(null)
  const [logs, setLogs] = useState<LimitLog[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [selectedCasino, setSelectedCasino] = useState<string>('')
  const [showMismatchesOnly, setShowMismatchesOnly] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; logId: number } | null>(null)

  useEffect(() => {
    fetchStats()
    fetchLogs()
    // Автообновление каждые 30 секунд
    const interval = setInterval(() => {
      fetchStats()
      fetchLogs()
    }, 30000)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, selectedCasino, showMismatchesOnly])

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/casino-limits/stats')
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      const data = await response.json()
      if (data.success && data.data) {
        setStats(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch limits stats:', error)
    }
  }

  const fetchLogs = async () => {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
      })
      if (selectedCasino) params.append('casino', selectedCasino)
      if (showMismatchesOnly) params.append('mismatches', 'true')

      const response = await fetch(`/api/casino-limits/logs?${params}`)
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      const data = await response.json()
      if (data.success && data.data) {
        setLogs(data.data.logs || [])
        setTotalPages(data.data.pagination?.totalPages || 1)
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value: number | string) => {
    const num = typeof value === 'string' ? parseFloat(value) : value
    return new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num)
  }

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }

  const handleContextMenu = (e: React.MouseEvent, logId: number) => {
    // Только на ПК (не на мобильных устройствах)
    if (window.innerWidth > 768) {
      e.preventDefault()
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        logId,
      })
    }
  }

  const handleDeleteLog = async (logId: number) => {
    if (!confirm('Удалить эту запись о нестыковке?')) {
      return
    }

    try {
      const response = await fetch(`/api/casino-limits/logs/${logId}`, {
        method: 'DELETE',
      })

      if (!response.ok) throw new Error('Failed to delete log')

      // Обновляем список логов
      fetchLogs()
      fetchStats()
      setContextMenu(null)
    } catch (error) {
      console.error('Failed to delete log:', error)
      alert('Ошибка при удалении записи')
    }
  }

  // Закрываем контекстное меню при клике вне его
  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(null)
    }

    if (contextMenu) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [contextMenu])

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  const uniqueCasinos = stats?.limits.map(l => l.casino) || []

  return (
    <div className="py-4">
      <div className="flex items-center justify-between mb-4">
        <div className="w-10"></div>
        <div className="flex-1 text-center">
          <h1 className="text-xl font-bold text-white">Логи лимитов казино</h1>
          <p className="text-xs text-gray-300 mt-1">Отслеживание операций с лимитами</p>
        </div>
        <div className="w-10"></div>
      </div>

      {/* Статистика лимитов */}
      {stats && (
        <div className="bg-gray-800 bg-opacity-50 rounded-xl p-4 border border-gray-700 backdrop-blur-sm mb-4">
          <div className="text-base font-bold text-white mb-3">Текущие лимиты</div>
          <div className="space-y-2">
            {stats.limits.map((limit) => (
              <div
                key={limit.casino}
                className={`flex items-center justify-between py-2 px-3 rounded ${
                  limit.isMismatch ? 'bg-red-900 bg-opacity-30' : ''
                }`}
              >
                <div className="flex-1">
                  <span className="text-white">{limit.name}</span>
                  {limit.isMismatch && (
                    <span className="ml-2 text-red-400 text-xs">⚠️ Нестыковка!</span>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-blue-500 font-bold">
                    {formatCurrency(limit.currentLimit)} с
                  </div>
                  {limit.isMismatch && (
                    <div className="text-xs text-red-400">
                      API: {formatCurrency(limit.realLimit)} с
                      <br />
                      Разница: {formatCurrency(limit.difference)} с
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {stats.mismatchesCount > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-700">
              <div className="text-red-400 text-sm">
                ⚠️ Всего нестыковок: {stats.mismatchesCount}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Фильтры */}
      <div className="bg-gray-800 bg-opacity-50 rounded-xl p-4 border border-gray-700 backdrop-blur-sm mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={selectedCasino}
            onChange={(e) => {
              setSelectedCasino(e.target.value)
              setPage(1)
            }}
            className="bg-gray-700 text-white rounded-lg px-3 py-2 flex-1"
          >
            <option value="">Все казино</option>
            {uniqueCasinos.map((casino) => (
              <option key={casino} value={casino}>
                {casino}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-white cursor-pointer">
            <input
              type="checkbox"
              checked={showMismatchesOnly}
              onChange={(e) => {
                setShowMismatchesOnly(e.target.checked)
                setPage(1)
              }}
              className="w-4 h-4"
            />
            <span>Только нестыковки</span>
          </label>
        </div>
      </div>

      {/* Логи */}
      <div className="bg-gray-800 bg-opacity-50 rounded-xl p-4 border border-gray-700 backdrop-blur-sm">
        <div className="text-base font-bold text-white mb-3">Логи операций</div>
        {logs.length > 0 ? (
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                onContextMenu={(e) => handleContextMenu(e, log.id)}
                className={`p-3 rounded-lg cursor-context-menu ${
                  log.isMismatch
                    ? 'bg-red-900 bg-opacity-30 border border-red-500'
                    : 'bg-gray-700 bg-opacity-30'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold">{log.casino}</span>
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          log.requestType === 'deposit'
                            ? 'bg-green-600 text-white'
                            : 'bg-blue-600 text-white'
                        }`}
                      >
                        {log.requestType === 'deposit' ? 'Пополнение' : 'Вывод'}
                      </span>
                      {log.isMismatch && (
                        <span className="text-xs px-2 py-1 rounded bg-red-600 text-white">
                          ⚠️ Нестыковка
                        </span>
                      )}
                    </div>
                    {log.requestId && (
                      <button
                        onClick={() => router.push(`/dashboard/requests/${log.requestId}`)}
                        className="text-blue-400 text-xs hover:underline mt-1"
                      >
                        Заявка #{log.requestId}
                      </button>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">{formatDateTime(log.createdAt)}</div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-400">Сумма:</span>{' '}
                    <span className="text-white font-bold">{formatCurrency(log.amount)} с</span>
                  </div>
                  {log.accountId && (
                    <div>
                      <span className="text-gray-400">ID счета:</span>{' '}
                      <span className="text-white">{log.accountId}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-400">Лимит до:</span>{' '}
                    <span className="text-white">{formatCurrency(log.limitBefore)} с</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Лимит после:</span>{' '}
                    <span className="text-white">{formatCurrency(log.limitAfter)} с</span>
                  </div>
                </div>
                {log.isMismatch && log.mismatchReason && (
                  <div className="mt-2 p-2 bg-red-900 bg-opacity-50 rounded text-xs text-red-200">
                    {log.mismatchReason}
                  </div>
                )}
                {log.processedBy && (
                  <div className="mt-1 text-xs text-gray-400">
                    Обработано: {log.processedBy}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-gray-400 text-sm text-center py-8">Нет логов</div>
        )}

        {/* Пагинация */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 bg-gray-700 text-white rounded disabled:opacity-50"
            >
              Назад
            </button>
            <span className="text-white">
              Страница {page} из {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 bg-gray-700 text-white rounded disabled:opacity-50"
            >
              Вперед
            </button>
          </div>
        )}
      </div>

      {/* Контекстное меню для удаления (только на ПК) */}
      {contextMenu && (
        <div
          className="fixed bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-50"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => handleDeleteLog(contextMenu.logId)}
            className="w-full px-4 py-2 text-left text-white hover:bg-red-600 rounded-lg transition-colors"
          >
            🗑️ Удалить запись
          </button>
        </div>
      )}
    </div>
  )
}

