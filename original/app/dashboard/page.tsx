'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Request {
  id: number
  userId: string
  username: string | null
  firstName: string | null
  lastName: string | null
  bookmaker: string | null
  accountId: string | null
  bank: string | null
  amount: string | null
  requestType: string
  status: string
  status_detail: string | null
  createdAt: string
}

export default function DashboardPage() {
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'pending' | 'deferred'>('pending')

  useEffect(() => {
    fetchRequests()
    
    // Автоматическое обновление каждые 3 секунды
    const interval = setInterval(() => {
      fetchRequests(false) // Не показываем loading при автообновлении
    }, 3000)
    
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
  }, [activeTab])

  const fetchRequests = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true)
    }
    try {
      const params = new URLSearchParams()
      if (activeTab === 'pending') {
        // Показываем только ожидающие заявки
        params.append('status', 'pending')
      } else if (activeTab === 'deferred') {
        // Показываем только отложенные заявки
        params.append('status', 'deferred')
      }

      const response = await fetch(`/api/requests?${params.toString()}`)
      const data = await response.json()

      console.log('📋 Fetched requests data:', data)

      if (data.success) {
        const requestsList = data.data.requests || []
        
        console.log(`✅ Loaded ${requestsList.length} requests for tab: ${activeTab}`)
        setRequests(requestsList)
      } else {
        console.error('❌ Failed to fetch requests:', data.error || data)
        setRequests([])
      }
    } catch (error) {
      console.error('❌ Failed to fetch requests:', error)
      setRequests([])
    } finally {
      if (showLoading) {
        setLoading(false)
      }
    }
  }

  const getTypeLabel = (type: string) => {
    return type === 'deposit' ? 'Пополнение' : 'Вывод'
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
      default:
        return status
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
      case 'approved':
      case 'auto_completed':
      case 'autodeposit_success':
        return 'bg-blue-500 text-black border border-blue-400'
      case 'pending':
        return 'bg-yellow-500 text-black border border-yellow-400'
      case 'rejected':
      case 'declined':
        return 'bg-red-500 text-white border border-red-400'
      case 'deferred':
        return 'bg-orange-500 text-white border border-orange-400'
      case 'manual':
      case 'awaiting_manual':
        return 'bg-red-500 text-white border border-red-400'
      default:
        return 'bg-gray-700 text-gray-300 border border-gray-600'
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${day}.${month}.${year} • ${hours}:${minutes}`
  }

  const getBankImage = (bank: string | null) => {
    if (!bank) return null
    const normalized = bank.toLowerCase()
    
    // Маппинг банков на изображения
    if (normalized.includes('demirbank') || normalized.includes('demir')) {
      return '/images/demirbank.jpg'
    }
    if (normalized.includes('omoney') || normalized.includes('o!money')) {
      return '/images/omoney.jpg'
    }
    if (normalized.includes('balance')) {
      return '/images/balance.jpg'
    }
    if (normalized.includes('bakai')) {
      return '/images/bakai.jpg'
    }
    if (normalized.includes('megapay')) {
      return '/images/megapay.jpg'
    }
    if (normalized.includes('mbank')) {
      return '/images/mbank.png'
    }
    if (normalized.includes('optima')) {
      return '/images/optima.jpg'
    }
    if (normalized.includes('companion')) {
      return '/images/companion.png'
    }
    
    return null
  }

    const getTransactionType = (request: Request) => {
      // Если статус "Ожидает", показываем "-"
      if (request.status === 'pending' || request.status === 'processing') {
        return '-'
      }
      
      // Для выводов может быть profile-*
      if (request.requestType === 'withdraw') {
        return request.status_detail?.match(/profile-\d+/)?.[0] || 'profile-1'
      }
      
      // Для депозитов
      if (request.requestType === 'deposit') {
        // Авто пополнение - только если статус явно указывает на автопополнение
        if (request.status === 'autodeposit_success' || request.status === 'auto_completed' || request.status_detail?.includes('autodeposit')) {
          return 'Авто пополнение'
        }
        
        // Проверяем наличие profile-* в status_detail
        if (request.status_detail?.match(/profile-\d+/)) {
          return request.status_detail.match(/profile-(\d+)/)?.[0] || 'profile-1'
        }
        
        // Для всех остальных депозитов (включая отклоненные) показываем profile-1
        return 'profile-1'
      }
      
      return request.requestType === 'deposit' ? 'Пополнение' : 'Вывод'
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
        <button 
          onClick={() => fetchRequests()}
          className="p-2 bg-gray-800 rounded-lg"
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Табы */}
      <div className="flex space-x-2 mb-6">
        <button
          onClick={() => setActiveTab('pending')}
          className={`flex-1 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
            activeTab === 'pending'
              ? 'bg-blue-500 text-black shadow-lg'
              : 'bg-gray-800 text-gray-300'
          }`}
        >
          Ожидающие
        </button>
        <button
          onClick={() => setActiveTab('deferred')}
          className={`flex-1 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
            activeTab === 'deferred'
              ? 'bg-blue-500 text-black shadow-lg'
              : 'bg-gray-800 text-gray-300'
          }`}
        >
          Отложенные
        </button>
      </div>

      {/* Контент заявок */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-24 h-24 bg-blue-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <svg className="w-16 h-16 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-white text-lg font-medium">Нет заявок</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => {
            const isDeposit = request.requestType === 'deposit'
            const userName = request.username 
              ? `@${request.username}` 
              : request.firstName 
                ? `${request.firstName}${request.lastName ? ' ' + request.lastName : ''}` 
                : `ID: ${request.userId}`
            const transactionType = getTransactionType(request)
            const isDeferred = request.status === 'deferred'
            // Если отложено и "Авто пополнение", показываем минус
            const showMinus = isDeferred && transactionType === 'Авто пополнение'

            const isPending = request.status === 'pending'
            
            return (
              <Link
                key={request.id}
                href={`/dashboard/requests/${request.id}`}
                className="block bg-gray-800 bg-opacity-50 rounded-xl p-4 border border-gray-700 hover:border-blue-500 transition-colors backdrop-blur-sm"
              >
                  <div className="flex items-start justify-between">
                    {/* Левая часть: Иконка банка и информация о пользователе */}
                    <div className="flex items-start space-x-3 flex-1">
                      {/* Иконка банка */}
                      {getBankImage(request.bank) ? (
                        <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border border-gray-600 bg-gray-900">
                          <img
                            src={getBankImage(request.bank) || ''}
                            alt={request.bank || 'Bank'}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-12 h-12 bg-purple-500 rounded-lg flex items-center justify-center flex-shrink-0">
                          <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                            <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                      )}

                      {/* Информация о пользователе и транзакции */}
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-bold text-white mb-0.5">
                          {userName}
                        </p>
                        <p className="text-xs text-gray-400 mb-2">
                          {request.accountId ? `ID: ${request.accountId}` : request.bookmaker || '-'}
                        </p>
                        
                        {/* Тип транзакции */}
                        <span className="inline-block px-2 py-0.5 text-xs font-medium bg-blue-500 bg-opacity-20 text-blue-300 rounded-md mb-1 border border-blue-500 border-opacity-30">
                          {transactionType}
                        </span>
                      </div>
                    </div>

                    {/* Правая часть: Дата, сумма и статус */}
                    <div className="flex flex-col items-end space-y-2 ml-4">
                      {/* Дата и время */}
                      <p className="text-xs text-gray-400 whitespace-nowrap">
                        {formatDate(request.createdAt)}
                      </p>
                      
                      {/* Сумма */}
                      <p
                        className={`text-base font-bold ${
                          showMinus ? 'text-red-500' : (isDeposit ? 'text-blue-500' : 'text-red-500')
                        }`}
                      >
                        {showMinus ? '-' : (isDeposit ? '+' : '-')}
                        {request.amount ? parseFloat(request.amount).toLocaleString('ru-RU', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }).replace('.', ',') : '0,00'}
                      </p>
                      
                      {/* Статус */}
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap ${getStatusColor(request.status)}`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${
                          getStatusLabel(request.status) === 'Успешно' ? 'bg-blue-600' :
                          getStatusLabel(request.status) === 'Отклонено' ? 'bg-red-600' :
                          getStatusLabel(request.status) === 'Отложено' ? 'bg-orange-600' :
                          'bg-yellow-600'
                        }`}></div>
                        {getStatusLabel(request.status)}
                      </span>
                    </div>
                  </div>
                </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
