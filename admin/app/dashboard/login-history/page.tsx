'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface LoginHistoryEntry {
  id: number
  userId: number
  username: string
  ipAddress: string | null
  userAgent: string | null
  device: string | null
  createdAt: string
  user: {
    id: number
    username: string
    email: string | null
  }
}

export default function LoginHistoryPage() {
  const router = useRouter()
  const [history, setHistory] = useState<LoginHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    // Сначала пытаемся создать таблицу, если её нет
    createTableIfNeeded().then(() => {
      fetchHistory()
    })
  }, [])

  const createTableIfNeeded = async () => {
    try {
      await fetch('/api/auth/create-login-history-table', {
        method: 'POST',
      })
    } catch (error) {
      // Игнорируем ошибки создания таблицы
      console.log('Table creation check:', error)
    }
  }

  const fetchHistory = async () => {
    try {
      const response = await fetch('/api/auth/login-history')
      const data = await response.json()

      console.log('📋 Login history response:', data)

      if (data.success) {
        setHistory(data.data.history || [])
        console.log(`✅ Loaded ${data.data.history?.length || 0} login history entries`)
      } else {
        console.error('❌ Failed to fetch login history:', data.error)
      }
    } catch (error) {
      console.error('❌ Failed to fetch login history:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLongPress = (id: number) => {
    setSelectedId(id)
    setShowDeleteModal(true)
  }

  const handleDelete = async () => {
    if (!selectedId) return

    setDeleting(true)
    try {
      const response = await fetch('/api/auth/login-history', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: selectedId }),
      })

      const data = await response.json()

      if (data.success) {
        setHistory(history.filter(h => h.id !== selectedId))
        setShowDeleteModal(false)
        setSelectedId(null)
      } else {
        alert(data.error || 'Не удалось удалить запись')
      }
    } catch (error) {
      console.error('Failed to delete login history:', error)
      alert('Ошибка при удалении записи')
    } finally {
      setDeleting(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${day}.${month}.${year} • ${hours}:${minutes}:${seconds}`
  }

  const getDeviceIcon = (device: string | null) => {
    if (!device) return '💻'
    if (device === 'Mobile') return '📱'
    if (device === 'Tablet') return '📱'
    return '💻'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="py-4">
      {/* Хедер */}
      <div className="flex items-center justify-between mb-4">
        <div className="w-10"></div>
        <div className="flex-1 text-center">
          <h1 className="text-xl font-bold text-white">История входов</h1>
          <p className="text-xs text-gray-300 mt-1">Все входы в систему</p>
        </div>
        <div className="w-10"></div>
      </div>

      {/* Список истории */}
      {history.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-24 h-24 bg-blue-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <svg className="w-16 h-16 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <p className="text-white text-lg font-medium">Нет записей</p>
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((entry) => (
            <div
              key={entry.id}
              onTouchStart={(e) => {
                const touch = e.touches[0]
                const target = e.currentTarget
                const startTime = Date.now()
                const startY = touch.clientY

                const handleTouchEnd = () => {
                  const endTime = Date.now()
                  const endY = touch.clientY
                  if (endTime - startTime > 500 && Math.abs(endY - startY) < 10) {
                    handleLongPress(entry.id)
                  }
                  document.removeEventListener('touchend', handleTouchEnd)
                }

                document.addEventListener('touchend', handleTouchEnd)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                handleLongPress(entry.id)
              }}
              className="bg-gray-900 bg-opacity-70 rounded-xl p-4 border border-gray-800 hover:border-blue-500 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3 flex-1">
                  <div className="w-12 h-12 rounded-lg bg-blue-500 bg-opacity-20 flex items-center justify-center flex-shrink-0 border border-blue-500 border-opacity-30">
                    <span className="text-2xl">{getDeviceIcon(entry.device)}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-white mb-0.5">
                      {entry.username}
                    </p>
                    <p className="text-xs text-gray-400 mb-1">
                      {entry.ipAddress || 'IP неизвестен'}
                    </p>
                    {entry.device && (
                      <span className="inline-block px-2 py-0.5 text-xs font-medium bg-blue-500 bg-opacity-20 text-blue-300 rounded-md mb-1 border border-blue-500 border-opacity-30">
                        {entry.device}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end space-y-1 ml-4">
                  <p className="text-xs text-gray-400 whitespace-nowrap">
                    {formatDate(entry.createdAt)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Модальное окно удаления */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl p-6 max-w-md w-full border border-gray-800">
            <h3 className="text-xl font-bold text-white mb-4">Удалить запись?</h3>
            <p className="text-gray-300 mb-6">
              Вы уверены, что хотите удалить эту запись из истории входов? Это действие нельзя отменить.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false)
                  setSelectedId(null)
                }}
                className="flex-1 px-4 py-3 bg-gray-800 text-white rounded-xl font-medium hover:bg-gray-700 transition-colors"
                disabled={deleting}
              >
                Отмена
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

