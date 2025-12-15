'use client'
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Chat {
  userId: string
  username: string | null
  firstName: string | null
  lastName: string | null
  photoUrl: string | null
  lastMessage: string | null
  lastMessageDirection: string | null
  lastMessageTime: string | null
  unreadCount: number
  totalMessages: number
  isClosed: boolean
}

export default function OperatorChatsPage() {
  const router = useRouter()
  const [chats, setChats] = useState<Chat[]>([])
  const [loading, setLoading] = useState(true)
  const [totalUnread, setTotalUnread] = useState(0)
  const [activeTab, setActiveTab] = useState<'open' | 'closed'>('open')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [isFetching, setIsFetching] = useState(false)
  const [isInitialLoad, setIsInitialLoad] = useState(true)

  const fetchChats = async (showLoading = false) => {
    // Защита от множественных одновременных запросов
    if (isFetching) {
      return
    }

    setIsFetching(true)
    // Показываем loading только при первой загрузке
    if (showLoading && isInitialLoad) {
      setLoading(true)
    }

    try {
      const params = new URLSearchParams({
        status: activeTab,
        ...(debouncedSearchQuery.trim() && { search: debouncedSearchQuery.trim() }),
      })
      // Добавляем timestamp для предотвращения кеширования
      params.append('_t', Date.now().toString())

      const response = await fetch(`/api/operator-chats?${params}`)
      const data = await response.json()

      if (data.success) {
        setChats(data.data.chats || [])
        setTotalUnread(data.data.totalUnread || 0)
      } else {
        console.error('❌ API returned error:', data.error)
      }
    } catch (error) {
      console.error('Failed to fetch chats:', error)
    } finally {
      if (showLoading && isInitialLoad) {
        setLoading(false)
        setIsInitialLoad(false)
      }
      setIsFetching(false)
    }
  }

  // Debounce для поиска (задержка 500ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 500)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    // При первой загрузке показываем loading, при переключении вкладок - только обновляем данные
    const isFirstLoad = isInitialLoad
    fetchChats(isFirstLoad)
    
    // Обновляем список каждые 10 секунд
    const interval = setInterval(() => {
      fetchChats(false) // Не показываем loading при автообновлении
    }, 10000)
    
    // Обновление при фокусе страницы
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchChats(false)
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, debouncedSearchQuery])

  const formatDate = (dateString: string | null) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return ''
    
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Вчера'
    } else {
      const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
      const day = date.getDate()
      const month = months[date.getMonth()]
      const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
      return `${day} ${month} ${time}`
    }
  }

  const getDisplayName = (chat: Chat) => {
    // Приоритет: имя и фамилия вместе
    const fullName = `${chat.firstName || ''} ${chat.lastName || ''}`.trim()
    if (fullName) {
      return fullName
    }
    // Если нет полного имени, пробуем только имя
    if (chat.firstName) {
      return chat.firstName
    }
    // Если нет имени, пробуем фамилию
    if (chat.lastName) {
      return chat.lastName
    }
    // Если есть username, показываем его
    if (chat.username) {
      return `@${chat.username}`
    }
    // В крайнем случае показываем ID
    return `ID: ${chat.userId}`
  }

  const handleCloseChat = async (e: React.MouseEvent, userId: string) => {
    e.preventDefault()
    e.stopPropagation()
    
    try {
      const response = await fetch('/api/operator-chats', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, isClosed: true }),
      })
      
      const data = await response.json()
      if (data.success) {
        fetchChats()
      }
    } catch (error) {
      console.error('Failed to close chat:', error)
    }
  }

  const handleOpenChat = async (e: React.MouseEvent, userId: string) => {
    e.preventDefault()
    e.stopPropagation()
    
    try {
      const response = await fetch('/api/operator-chats', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, isClosed: false }),
      })
      
      const data = await response.json()
      if (data.success) {
        fetchChats()
      }
    } catch (error) {
      console.error('Failed to open chat:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Хедер с вкладками */}
      <div className="flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-800 rounded-xl transition-colors"
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 text-center">
            <h1 className="text-xl font-bold text-white">Чаты</h1>
            {totalUnread > 0 && activeTab === 'open' && (
              <p className="text-xs text-gray-400 mt-1">{totalUnread} непрочитанных</p>
            )}
          </div>
          <div className="w-10"></div>
        </div>

        {/* Вкладки Открытые/Закрытые */}
        <div className="mb-4">
          <div className="flex bg-gray-800/50 rounded-xl p-1 backdrop-blur-sm w-full">
            <button
              onClick={() => setActiveTab('open')}
              className={`flex-1 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 ${
                activeTab === 'open'
                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Открытые
            </button>
            <button
              onClick={() => setActiveTab('closed')}
              className={`flex-1 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 ${
                activeTab === 'closed'
                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Закрытые
            </button>
          </div>
        </div>

        {/* Поиск */}
        <div className="mb-4">
          <div className="relative">
            <svg
              className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск контактов..."
              className="w-full bg-gray-800/70 backdrop-blur-sm text-white rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-gray-800 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Список чатов */}
      <div className="flex-1 overflow-y-auto -mx-4 px-4">
        {chats.length === 0 ? (
          <div className="text-center text-gray-400 py-16">
            <div className="w-20 h-20 mx-auto mb-4 bg-gray-800/50 rounded-full flex items-center justify-center">
              <svg
                className="w-10 h-10 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <p className="text-lg font-semibold text-white mb-1">Нет чатов</p>
            <p className="text-sm text-gray-500">
              {activeTab === 'open' 
                ? 'Пока нет открытых чатов' 
                : 'Пока нет закрытых чатов'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {chats.map((chat) => (
              <Link
                key={chat.userId}
                href={`/dashboard/users/${chat.userId}/operator-chat`}
                className="block bg-gray-800/30 backdrop-blur-sm rounded-xl p-4 hover:bg-gray-800/50 transition-all duration-200 border border-gray-800/50 hover:border-gray-700"
              >
                <div className="flex items-start space-x-3">
                  {/* Аватар с обновлением при изменении */}
                  <div className="relative flex-shrink-0">
                    {chat.photoUrl ? (
                      <img
                        key={`${chat.userId}-${chat.photoUrl}`}
                        src={`${chat.photoUrl}?t=${Date.now()}`}
                        alt={getDisplayName(chat)}
                        className="w-14 h-14 rounded-full object-cover border-2 border-gray-700"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center border-2 border-gray-700 shadow-lg">
                        <span className="text-white text-lg font-bold">
                          {getDisplayName(chat).charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    {/* Индикатор онлайн (можно добавить позже) */}
                    {chat.unreadCount > 0 && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full border-2 border-gray-900 flex items-center justify-center">
                        <span className="text-white text-[10px] font-bold">
                          {chat.unreadCount > 9 ? '9+' : chat.unreadCount}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Информация о чате */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center space-x-2 flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-white truncate">
                          {getDisplayName(chat)}
                        </h3>
                      </div>
                      {chat.lastMessageTime && (
                        <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                          {formatDate(chat.lastMessageTime)}
                        </span>
                      )}
                    </div>
                    {chat.lastMessage && (
                      <p className="text-sm text-gray-400 truncate">
                        <span className={chat.lastMessageDirection === 'out' ? 'text-blue-400' : ''}>
                          {chat.lastMessageDirection === 'out' ? 'Вы: ' : ''}
                        </span>
                        {chat.lastMessage}
                      </p>
                    )}
                    {chat.totalMessages > 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        {chat.totalMessages} {chat.totalMessages === 1 ? 'сообщение' : chat.totalMessages < 5 ? 'сообщения' : 'сообщений'}
                      </p>
                    )}
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

