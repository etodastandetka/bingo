'use client'

import { useState } from 'react'
import Link from 'next/link'

type SearchType = 'casino_id' | 'telegram_id' | 'name'

interface SearchResult {
  id: number
  userId: string
  username: string | null
  firstName: string | null
  lastName: string | null
  accountId: string | null
  requestType: 'deposit' | 'withdraw'
  amount: string
  status: string
  bookmaker: string | null
  createdAt: string
}

export default function SearchPage() {
  const [searchType, setSearchType] = useState<SearchType>('casino_id')
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [error, setError] = useState<string | null>(null)

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setError('Введите данные для поиска')
      return
    }

    setSearching(true)
    setError(null)
    setResults([])

    try {
      const params = new URLSearchParams()
      params.set('type', searchType)
      params.set('query', searchQuery.trim())

      const response = await fetch(`/api/search?${params.toString()}`)
      const data = await response.json()

      if (data.success) {
        setResults(data.data || [])
        if (data.data && data.data.length === 0) {
          setError('Ничего не найдено')
        }
      } else {
        setError(data.message || 'Ошибка при поиске')
      }
    } catch (err) {
      setError('Ошибка при выполнении поиска')
      console.error('Search error:', err)
    } finally {
      setSearching(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const getSearchPlaceholder = () => {
    switch (searchType) {
      case 'casino_id':
        return 'Введите ID казино'
      case 'telegram_id':
        return 'Введите ID телеграм'
      case 'name':
        return 'Введите имя пользователя'
      default:
        return 'Введите данные для поиска'
    }
  }

  const getDisplayName = (result: SearchResult) => {
    if (result.firstName || result.lastName) {
      return `${result.firstName || ''} ${result.lastName || ''}`.trim()
    }
    return result.username || `ID: ${result.userId}`
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Ожидает'
      case 'completed':
      case 'approved':
        return 'Успешно'
      case 'rejected':
      case 'declined':
        return 'Отклонено'
      case 'deferred':
        return 'Отложено'
      case 'processing':
        return 'Обработка'
      default:
        return status
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
      case 'approved':
        return 'bg-blue-500 text-white'
      case 'pending':
      case 'processing':
        return 'bg-yellow-500 text-black'
      case 'rejected':
      case 'declined':
        return 'bg-red-500 text-white'
      case 'deferred':
        return 'bg-orange-500 text-white'
      default:
        return 'bg-gray-700 text-gray-300'
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return '—'
    const day = date.getDate().toString().padStart(2, '0')
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const year = date.getFullYear()
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    return `${day}.${month}.${year} • ${hours}:${minutes}`
  }

  const formatAmount = (amount: string) => {
    const num = parseFloat(amount)
    if (isNaN(num)) return amount
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">Поиск</h1>
          <p className="text-sm text-gray-400">Найдите нужную информацию</p>
        </div>

        {/* Search Card */}
        <div className="bg-gray-800 rounded-2xl p-6 mb-6 border border-gray-700">
          {/* Search Type Tabs */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => {
                setSearchType('casino_id')
                setSearchQuery('')
                setResults([])
                setError(null)
              }}
              className={`flex-1 flex flex-col items-center justify-center py-3 px-4 rounded-xl transition-colors ${
                searchType === 'casino_id'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
              </svg>
              <span className="text-xs font-medium">ID Казино</span>
            </button>
            <button
              onClick={() => {
                setSearchType('telegram_id')
                setSearchQuery('')
                setResults([])
                setError(null)
              }}
              className={`flex-1 flex flex-col items-center justify-center py-3 px-4 rounded-xl transition-colors ${
                searchType === 'telegram_id'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-xs font-medium">ID Телеграм</span>
            </button>
            <button
              onClick={() => {
                setSearchType('name')
                setSearchQuery('')
                setResults([])
                setError(null)
              }}
              className={`flex-1 flex flex-col items-center justify-center py-3 px-4 rounded-xl transition-colors ${
                searchType === 'name'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-xs font-medium">Имя</span>
            </button>
          </div>

          {/* Search Input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              {searchType === 'casino_id' && '# ID Казино'}
              {searchType === 'telegram_id' && 'ID Телеграм'}
              {searchType === 'name' && 'Имя пользователя'}
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={getSearchPlaceholder()}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Search Button */}
          <button
            onClick={handleSearch}
            disabled={searching}
            className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-400 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span>{searching ? 'Поиск...' : 'Найти'}</span>
          </button>
        </div>

        {/* Search Tips */}
        <div className="bg-gray-800 rounded-2xl p-6 mb-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-blue-400 mb-3">Советы по поиску:</h3>
          <ul className="space-y-2 text-sm text-gray-300">
            <li>• Используйте точные данные для лучших результатов</li>
            <li>• ID должен содержать только цифры</li>
            <li>• Поиск по имени не чувствителен к регистру и поддерживает смайлы</li>
          </ul>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-900 bg-opacity-50 border border-red-500 rounded-lg p-4 mb-6">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-white mb-3">
              Найдено результатов: {results.length}
            </h2>
            {results.map((result) => (
              <Link
                key={result.id}
                href={`/dashboard/requests/${result.id}`}
                className="block bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-blue-500 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <p className="text-sm font-medium text-white">{getDisplayName(result)}</p>
                    </div>
                    <p className="text-xs text-gray-400 mb-1">
                      {result.accountId ? `ID Казино: ${result.accountId}` : `ID Телеграм: ${result.userId}`}
                    </p>
                    {result.bookmaker && (
                      <p className="text-xs text-gray-400 mb-1">Сайт: {result.bookmaker}</p>
                    )}
                    <span className="inline-block px-2 py-0.5 text-xs font-medium bg-blue-500 bg-opacity-20 text-blue-300 rounded-md border border-blue-500 border-opacity-30">
                      {result.requestType === 'deposit' ? 'Пополнение' : 'Вывод'}
                    </span>
                  </div>
                  <div className="flex flex-col items-end space-y-2">
                    <p className="text-xs text-gray-400 whitespace-nowrap">{formatDate(result.createdAt)}</p>
                    <p className={`text-lg font-bold ${
                      result.requestType === 'deposit' ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {result.requestType === 'deposit' ? '+' : '-'}{formatAmount(result.amount)}
                    </p>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap ${getStatusColor(result.status)}`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        getStatusLabel(result.status) === 'Успешно' ? 'bg-blue-600' :
                        getStatusLabel(result.status) === 'Отклонено' ? 'bg-red-600' :
                        getStatusLabel(result.status) === 'Отложено' ? 'bg-orange-600' :
                        'bg-yellow-600'
                      }`}></div>
                      {getStatusLabel(result.status)}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

