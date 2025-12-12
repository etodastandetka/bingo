'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Transaction {
  id: number
  user_id: string
  account_id: string
  user_display_name: string
  username?: string
  first_name?: string
  last_name?: string
  type: string
  amount: number
  status: string
  status_detail: string | null
  bookmaker: string
  bank: string
  created_at: string
  processed_by?: string | null
}

export default function HistoryPage() {
  const router = useRouter()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'all' | 'deposit' | 'withdraw'>('all')
  const [isFetching, setIsFetching] = useState(false)

  const fetchHistory = async () => {
    // Предотвращаем множественные запросы
    if (isFetching) {
      return
    }

    setIsFetching(true)
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (activeTab !== 'all') {
        params.append('type', activeTab === 'deposit' ? 'deposit' : 'withdraw')
      }

      // Добавляем таймаут для запроса
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 секунд

      const response = await fetch(`/api/transaction-history?${params.toString()}`, {
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()

      if (data.success) {
        setTransactions(data.data.transactions || [])
      } else {
        console.error('API returned error:', data.error)
        setTransactions([])
      }
    } catch (error: any) {
      console.error('Failed to fetch history:', error)
      if (error.name === 'AbortError') {
        console.error('Request timeout')
      }
      setTransactions([])
    } finally {
      setLoading(false)
      setIsFetching(false)
    }
  }

  useEffect(() => {
    fetchHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${day}.${month}.${year} • ${hours}:${minutes}`
  }

  const getStatusLabel = (status: string, statusDetail: string | null, processedBy?: string | null) => {
    // Если автопополнение - показываем "Успешно"
    if (processedBy === 'автопополнение' || processedBy === 'autodeposit') {
      return { label: 'Успешно', color: 'bg-green-500 text-white border border-green-400' }
    }
    
    // Маппинг статусов на русские метки (темная тема)
    if (status === 'completed' || status === 'auto_completed' || status === 'approved' || status === 'autodeposit_success') {
      return { label: 'Успешно', color: 'bg-green-500 text-white border border-green-400' }
    }
    if (status === 'rejected' || status === 'declined') {
      return { label: 'Отклонено', color: 'bg-red-500 text-white border border-red-400' }
    }
    if (status === 'pending' || status === 'processing') {
      return { label: 'Ожидает', color: 'bg-yellow-500 text-black border border-yellow-400' }
    }
    if (status === 'manual' || status === 'awaiting_manual' || statusDetail === 'manual') {
      return { label: 'Ручная', color: 'bg-red-500 text-white border border-red-400' }
    }
    if (status === 'deferred') {
      return { label: 'Отложено', color: 'bg-orange-500 text-white border border-orange-400' }
    }
    return { label: 'Неизвестно', color: 'bg-gray-700 text-gray-300 border border-gray-600' }
  }

  const getTransactionType = (tx: Transaction) => {
    // Если статус "Ожидает", показываем "-"
    if (tx.status === 'pending' || tx.status === 'processing') {
      return '-'
    }
    
    // Для выводов может быть profile-*
    if (tx.type === 'withdraw') {
      return tx.status_detail?.match(/profile-\d+/)?.[0] || 'profile-1'
    }
    
    // Для депозитов
    if (tx.type === 'deposit') {
      // Автопополнение - проверяем processedBy
      if (tx.processed_by === 'автопополнение' || tx.processed_by === 'autodeposit') {
        return 'автопополнение'
      }
      
      // Авто пополнение - если статус явно указывает на автопополнение
      if (tx.status === 'autodeposit_success' || tx.status === 'auto_completed' || tx.status_detail?.includes('autodeposit')) {
        return 'автопополнение'
      }
      
      // Проверяем наличие profile-* в status_detail
      if (tx.status_detail?.match(/profile-\d+/)) {
        return tx.status_detail.match(/profile-(\d+)/)?.[0] || 'profile-1'
      }
      
      // Для всех остальных депозитов (включая отклоненные) показываем profile-1
      return 'profile-1'
    }
    
    return tx.type === 'deposit' ? 'Пополнение' : 'Вывод'
  }

  const getBookmakerName = (bookmaker: string | null) => {
    if (!bookmaker) return ''
    const normalized = bookmaker.toLowerCase()
    if (normalized.includes('1xbet') || normalized.includes('xbet')) return '1xbet'
    if (normalized.includes('melbet')) return 'Melbet'
    if (normalized.includes('mostbet')) return 'Mostbet'
    if (normalized.includes('1win') || normalized.includes('onewin')) return '1win'
    if (normalized.includes('wowbet')) return 'WowBet'
    return bookmaker
  }

  const getDisplayName = (tx: Transaction) => {
    // Приоритет: firstName/lastName > username
    if (tx.first_name && tx.last_name) {
      return `${tx.first_name} ${tx.last_name}`
    } else if (tx.first_name) {
      return tx.first_name
    } else if (tx.last_name) {
      return tx.last_name
    } else if (tx.username) {
      return `@${tx.username}`
    }
    return tx.user_display_name || 'Неизвестный пользователь'
  }

  const getBankImage = (bank: string | null) => {
    // Дефолтная иконка банка, если банк не указан
    const defaultBank = '/images/mbank.png'
    
    if (!bank) return defaultBank
    
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
    
    // Если банк указан, но не распознан - возвращаем дефолтную иконку
    return defaultBank
  }

  if (loading && transactions.length === 0) {
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
          <h1 className="text-xl font-bold text-white">История</h1>
          <p className="text-xs text-gray-300 mt-1">Все транзакции</p>
        </div>
        <button
          onClick={() => fetchHistory()}
          className="p-2 bg-gray-800 rounded-lg"
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Табы фильтрации */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setActiveTab('all')}
          className={`flex-1 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
            activeTab === 'all'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-800 bg-opacity-50 text-gray-300 border border-gray-700'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            <span>Все</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('deposit')}
          className={`flex-1 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
            activeTab === 'deposit'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-800 bg-opacity-50 text-gray-300 border border-gray-700'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            <span>Пополнения</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('withdraw')}
          className={`flex-1 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
            activeTab === 'withdraw'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-800 bg-opacity-50 text-gray-300 border border-gray-700'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7 7V3" />
            </svg>
            <span>Выводы</span>
          </div>
        </button>
      </div>

      {/* Список транзакций */}
      {transactions.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>История транзакций пуста</p>
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map((tx) => {
            const isDeposit = tx.type === 'deposit'
            const statusInfo = getStatusLabel(tx.status, tx.status_detail, tx.processed_by)
            const transactionType = getTransactionType(tx)

            return (
              <Link
                key={tx.id}
                href={`/dashboard/requests/${tx.id}`}
                className="block bg-gray-800 bg-opacity-50 rounded-xl p-4 border border-gray-700 backdrop-blur-sm hover:border-blue-500 transition-colors"
              >
                <div className="flex items-start justify-between">
                  {/* Левая часть: Аватар и информация о пользователе */}
                  <div className="flex items-start space-x-3 flex-1">
                    {/* Иконка банка - всегда показываем иконку банка */}
                    <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border border-gray-600 bg-gray-900">
                      <img
                        src={getBankImage(tx.bank)}
                        alt={tx.bank || 'Bank'}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Информация о пользователе и транзакции */}
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-bold text-white mb-0.5">
                        {getDisplayName(tx)}
                      </p>
                      <p className="text-xs text-gray-400 mb-2">
                        ID: {tx.user_id}
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
                      {formatDate(tx.created_at)}
                    </p>
                    
                    {/* Сумма */}
                    <p
                      className={`text-base font-bold ${
                        isDeposit ? 'text-green-500' : 'text-red-500'
                      }`}
                    >
                      {isDeposit ? '+' : '-'}
                      {tx.amount.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                    
                    {/* Статус */}
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap ${statusInfo.color}`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        statusInfo.label === 'Успешно' ? 'bg-blue-600' :
                        statusInfo.label === 'Отклонено' ? 'bg-red-600' :
                        statusInfo.label === 'Отложено' ? 'bg-orange-600' :
                        'bg-yellow-600'
                      }`}></div>
                      {statusInfo.label}
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
