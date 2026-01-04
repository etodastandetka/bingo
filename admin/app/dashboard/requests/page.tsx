'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Request {
  id: number
  userId: string
  username: string | null
  firstName: string | null
  bookmaker: string | null
  amount: string | null
  requestType: string
  status: string
  createdAt: string
}

export default function RequestsPage() {
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<{ type?: string; status?: string }>({})

  useEffect(() => {
    fetchRequests()
    
    // Автоматическое обновление каждые 10 секунд (увеличено для снижения нагрузки)
    const interval = setInterval(() => {
      fetchRequests(false) // Не показываем loading при автообновлении
    }, 10000)
    
    // Обновление при фокусе страницы
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchRequests(false)
      }
    }
    
    // Обновление при возврате фокуса
    const handleFocus = () => {
      fetchRequests(false)
    }
    
    // Синхронизация между вкладками через storage event
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'request_updated' && e.newValue) {
        const updatedRequestId = parseInt(e.newValue)
        console.log('🔄 Request updated in another tab:', updatedRequestId)
        fetchRequests(false)
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('storage', handleStorageChange)
    
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('storage', handleStorageChange)
    }
    // Мы намеренно не добавляем fetchRequests в зависимости,
    // чтобы не пересоздавать интервал и обработчики на каждый ререндер
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  const fetchRequests = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true)
    }
    try {
      const params = new URLSearchParams()
      if (filter.type) params.append('type', filter.type)
      if (filter.status) params.append('status', filter.status)

      const response = await fetch(`/api/requests?${params.toString()}`)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()

      if (data.success && data.data) {
        const newRequests = data.data.requests || []
        // Обновляем список заявок - новые заявки появятся автоматически
        setRequests(newRequests)
        console.log(`📋 Requests updated: ${newRequests.length} requests loaded`)
      } else {
        console.error('API returned error:', data.error || 'Unknown error')
        setRequests([])
      }
    } catch (error) {
      console.error('Failed to fetch requests:', error)
      setRequests([])
    } finally {
      if (showLoading) {
        setLoading(false)
      }
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
      case 'approved':
      case 'auto_completed':
      case 'autodeposit_success':
        return 'bg-blue-500 text-white'
      case 'pending':
        return 'bg-yellow-500 text-black'
      case 'rejected':
      case 'declined':
        return 'bg-red-500 text-white'
      case 'deferred':
        return 'bg-orange-500 text-white'
      case 'manual':
      case 'awaiting_manual':
        return 'bg-red-500 text-white'
      default:
        return 'bg-gray-700 text-gray-300'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Ожидает'
      case 'completed':
      case 'approved':
      case 'auto_completed':
      case 'autodeposit_success':
        return 'Успешно'
      case 'rejected':
      case 'declined':
        return 'Отклонено'
      case 'deferred':
        return 'Отложено'
      case 'manual':
      case 'awaiting_manual':
        return 'Ручная'
      case 'processing':
        return 'Обработка'
      default:
        return 'Неизвестно'
    }
  }

  const getTypeLabel = (type: string) => {
    return type === 'deposit' ? 'Пополнение' : 'Вывод'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="py-4">
      {/* Хедер с заголовком */}
      <div className="flex items-center justify-between mb-4">
        <div className="w-10"></div>
        <div className="flex-1 text-center">
          <h1 className="text-xl font-bold text-white">Заявки</h1>
          <p className="text-xs text-gray-300 mt-1">Актуальные транзакции</p>
        </div>
        <div className="w-10"></div>
      </div>

      <div className="mb-4 flex items-center space-x-2">
        <button
          onClick={() => setFilter({ ...filter, status: undefined })}
          className={`flex-1 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
            !filter.status
              ? 'bg-blue-500 text-white shadow-lg'
              : 'bg-gray-900 text-gray-300'
          }`}
        >
          Все
        </button>
        <button
          onClick={() => setFilter({ ...filter, status: 'pending' })}
          className={`flex-1 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
            filter.status === 'pending'
              ? 'bg-blue-500 text-white shadow-lg'
              : 'bg-gray-900 text-gray-300'
          }`}
        >
          Ожидающие
        </button>
        <button
          onClick={() => setFilter({ ...filter, status: 'left' })}
          className={`flex-1 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
            filter.status === 'left'
              ? 'bg-blue-500 text-white shadow-lg'
              : 'bg-gray-900 text-gray-300'
          }`}
        >
          Оставленные
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-20 h-20 bg-blue-500 rounded-2xl flex items-center justify-center mb-4">
            <svg className="w-12 h-12 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-white text-lg font-medium">Нет заявок</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <Link
              key={request.id}
              href={`/dashboard/requests/${request.id}`}
              className="block bg-gray-900 bg-opacity-70 rounded-xl p-4 border border-gray-800 hover:border-blue-500 transition-colors backdrop-blur-sm"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="text-sm font-medium text-white">
                      Заявка #{request.id}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                        request.status
                      )}`}
                    >
                      {getStatusLabel(request.status)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {getTypeLabel(request.requestType)}
                  </p>
                </div>
                <p className="text-base font-bold text-white">
                  {request.amount ? `${parseFloat(request.amount).toLocaleString()} KGS` : 'N/A'}
                </p>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-400 mt-2">
                <span>{(request as any).firstName ? `${(request as any).firstName}${(request as any).lastName ? ' ' + (request as any).lastName : ''}` : (request as any).username ? `@${(request as any).username}` : (request as any).userId}</span>
                {request.bookmaker && <span>{request.bookmaker}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

