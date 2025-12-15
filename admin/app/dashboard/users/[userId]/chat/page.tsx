'use client'
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface ChatMessage {
  id: number
  userId: string
  messageText: string | null
  messageType: string
  direction: string
  createdAt: string
  mediaUrl?: string | null
}

interface UserInfo {
  userId: string
  username: string | null
  firstName: string | null
  lastName: string | null
  photoUrl: string | null
}

export default function ChatPage() {
  const params = useParams()
  const router = useRouter()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [user, setUser] = useState<UserInfo | null>(null)
  const [newMessage, setNewMessage] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (params.userId) {
      fetchChatData()
      // Обновляем чат каждые 5 секунд
      const interval = setInterval(() => {
        fetchChatData()
      }, 5000)
      return () => clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.userId])

  useEffect(() => {
    // Используем setTimeout для корректного скролла после рендера
    setTimeout(() => {
      scrollToBottom()
    }, 100)
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const fetchChatData = async () => {
    try {
      const [chatRes, userRes, photoRes] = await Promise.all([
        fetch(`/api/users/${params.userId}/chat?botType=main`),
        fetch(`/api/users/${params.userId}`),
        fetch(`/api/users/${params.userId}/profile-photo`)
      ])

      const chatData = await chatRes.json()
      const userData = await userRes.json()
      const photoData = await photoRes.json()

      if (chatData.success && chatData.data.messages) {
        // Разворачиваем, чтобы старые были сверху
        const reversedMessages = [...chatData.data.messages].reverse()
        setMessages(reversedMessages)
      }

      if (userData.success && userData.data) {
        const userInfo = userData.data
        setUser({
          userId: userInfo.userId || params.userId?.toString() || '',
          username: userInfo.username,
          firstName: userInfo.firstName,
          lastName: userInfo.lastName,
          photoUrl: photoData.success && photoData.data?.photoUrl ? photoData.data.photoUrl : null,
        })
      }
    } catch (error) {
      console.error('Failed to fetch chat data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Проверяем тип файла (фото или видео)
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      setSelectedFile(file)
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
    } else {
      alert('Пожалуйста, выберите фото или видео')
    }
  }

  const removeFile = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
    setSelectedFile(null)
    setPreviewUrl(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const sendMessage = async () => {
    if ((!newMessage.trim() && !selectedFile) || sending) return

    setSending(true)
    try {
      const formData = new FormData()
      if (newMessage.trim()) {
        formData.append('message', newMessage)
      }
      if (selectedFile) {
        formData.append('file', selectedFile)
        formData.append('fileType', selectedFile.type)
      }

      const response = await fetch(`/api/users/${params.userId}/send-message`, {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (data.success) {
        setNewMessage('')
        removeFile()
        // Обновляем чат
        await fetchChatData()
      } else {
        alert(data.error || 'Ошибка при отправке сообщения')
      }
    } catch (error) {
      console.error('Failed to send message:', error)
      alert('Ошибка при отправке сообщения')
    } finally {
      setSending(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    } else if (date.toDateString() === yesterday.toDateString()) {
      return `Вчера ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
    } else {
      return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="text-center text-gray-400 py-12">Пользователь не найден</div>
    )
  }

  const displayName = user.firstName || user.username || `ID: ${user.userId}`

  return (
    <div className="flex flex-col h-full max-h-full">
      {/* Хедер */}
      <div className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <Link
          href={`/dashboard/users/${user.userId}`}
          className="flex items-center space-x-3 flex-1 ml-4"
        >
          {user.photoUrl ? (
            <img
              src={user.photoUrl}
              alt={displayName}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-bold">{displayName.charAt(0).toUpperCase()}</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{displayName}</p>
            {user.username && (
              <p className="text-xs text-gray-400 truncate">@{user.username}</p>
            )}
            <p className="text-xs text-blue-500">Чат основного бота</p>
          </div>
        </Link>
        <button className="p-2 hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
        </button>
      </div>

      {/* Сообщения */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-blue-950 to-blue-800 min-h-0">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <p>Нет сообщений</p>
            <p className="text-sm mt-2">Начните общение</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.direction === 'out' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${
                  message.direction === 'out'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-700 text-white'
                }`}
              >
                {message.mediaUrl && (
                  <div className="mb-2 rounded-lg overflow-hidden">
                    {message.messageType === 'photo' ? (
                      <img 
                        src={message.mediaUrl} 
                        alt="Photo" 
                        className="w-full max-h-64 object-cover rounded-lg"
                      />
                    ) : message.messageType === 'video' ? (
                      <video 
                        src={message.mediaUrl} 
                        controls 
                        className="w-full max-h-64 rounded-lg"
                      />
                    ) : null}
                  </div>
                )}
                {message.messageText && (
                  <p className="text-sm whitespace-pre-wrap break-words">{message.messageText}</p>
                )}
                <p className={`text-xs mt-1 ${message.direction === 'out' ? 'text-gray-800' : 'text-gray-400'}`}>
                  {formatDate(message.createdAt)}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Поле ввода */}
      <div className="p-4 bg-gray-800 border-t border-gray-700 flex-shrink-0">
        {/* Preview выбранного файла */}
        {previewUrl && selectedFile && (
          <div className="mb-2 relative">
            {selectedFile.type.startsWith('image/') ? (
              <div className="relative">
                <img 
                  src={previewUrl} 
                  alt="Preview" 
                  className="w-full max-h-32 object-cover rounded-lg"
                />
                <button
                  onClick={removeFile}
                  className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : selectedFile.type.startsWith('video/') ? (
              <div className="relative">
                <video 
                  src={previewUrl} 
                  controls 
                  className="w-full max-h-32 rounded-lg"
                />
                <button
                  onClick={removeFile}
                  className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : null}
          </div>
        )}
        <div className="flex items-center space-x-2">
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*,video/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Введите сообщение..."
            className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={sending}
          />
          <button
            onClick={sendMessage}
            disabled={sending || (!newMessage.trim() && !selectedFile)}
            className="p-2 bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

