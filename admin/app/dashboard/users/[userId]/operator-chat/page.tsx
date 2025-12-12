'use client'

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

export default function OperatorChatPage() {
  const params = useParams()
  const router = useRouter()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [user, setUser] = useState<UserInfo | null>(null)
  const [newMessage, setNewMessage] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [showQuickReplies, setShowQuickReplies] = useState(false)
  const [quickReplies, setQuickReplies] = useState<Array<{ id: number; text: string; order: number }>>([])
  const [editingReply, setEditingReply] = useState<{ id: number; text: string } | null>(null)
  const [newReplyText, setNewReplyText] = useState('')
  const [contextMenu, setContextMenu] = useState<{ messageId: number; x: number; y: number } | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null)
  const [editingMessageText, setEditingMessageText] = useState('')
  const [replyingToMessageId, setReplyingToMessageId] = useState<number | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const [showTransactionsModal, setShowTransactionsModal] = useState(false)
  const [allRequests, setAllRequests] = useState<Array<{
    id: number
    userId: string
    requestType: string
    amount: string
    status: string
    statusDetail: string | null
    bookmaker: string | null
    bank: string | null
    createdAt: string
    processedAt: string | null
  }>>([])
  const [uncreatedRequests, setUncreatedRequests] = useState<Array<{
    id: number
    userId: string
    username: string | null
    firstName: string | null
    lastName: string | null
    bookmaker: string | null
    accountId: string | null
    bank: string | null
    amount: string
    requestType: string
    status: string
    createdRequestId: number | null
    createdAt: string
  }>>([])
  const [loadingRequests, setLoadingRequests] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const getBankImage = (bank?: string | null) => {
    const defaultBank = '/images/mbank.png'
    if (!bank) return defaultBank
    const normalized = bank.toLowerCase()
    if (normalized.includes('demirbank') || normalized.includes('demir')) return '/images/demirbank.jpg'
    if (normalized.includes('omoney') || normalized.includes('o!money')) return '/images/omoney.jpg'
    if (normalized.includes('balance')) return '/images/balance.jpg'
    if (normalized.includes('bakai')) return '/images/bakai.jpg'
    if (normalized.includes('megapay')) return '/images/megapay.jpg'
    if (normalized.includes('mbank')) return '/images/mbank.png'
    if (normalized.includes('optima')) return '/images/optima.jpg'
    if (normalized.includes('companion')) return '/images/companion.png'
    if (normalized.includes('kaspi')) return '/images/kaspi.png'
    return defaultBank
  }

  const handleCheckRequest = (id: number, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    router.push(`/dashboard/requests/${id}`)
  }

  useEffect(() => {
    if (params.userId) {
      fetchChatData()
      fetchQuickReplies()
      // Обновляем чат каждые 2 секунды для получения новых сообщений от пользователя
      const interval = setInterval(() => {
        // Обновляем только если не отправляем сообщение
        if (!sending) {
          fetchChatData()
        }
      }, 2000)
      return () => clearInterval(interval)
    }
  }, [params.userId, sending])

  const fetchQuickReplies = async () => {
    try {
      const response = await fetch('/api/quick-replies')
      const data = await response.json()
      if (data.success) {
        setQuickReplies(data.data.replies || [])
      }
    } catch (error) {
      console.error('Failed to fetch quick replies:', error)
    }
  }

  const handleQuickReplyClick = (text: string) => {
    setNewMessage(text)
    setShowQuickReplies(false)
  }

  const handleAddQuickReply = async () => {
    if (!newReplyText.trim()) return

    try {
      const response = await fetch('/api/quick-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newReplyText.trim() }),
      })

      const data = await response.json()
      if (data.success) {
        setNewReplyText('')
        await fetchQuickReplies()
      } else {
        alert(data.error || 'Ошибка при добавлении быстрого ответа')
      }
    } catch (error) {
      console.error('Failed to add quick reply:', error)
      alert('Ошибка при добавлении быстрого ответа')
    }
  }

  const handleEditQuickReply = async (id: number, text: string) => {
    if (!text.trim()) return

    try {
      const response = await fetch('/api/quick-replies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, text: text.trim() }),
      })

      const data = await response.json()
      if (data.success) {
        setEditingReply(null)
        await fetchQuickReplies()
      } else {
        alert(data.error || 'Ошибка при редактировании быстрого ответа')
      }
    } catch (error) {
      console.error('Failed to edit quick reply:', error)
      alert('Ошибка при редактировании быстрого ответа')
    }
  }

  const handleDeleteQuickReply = async (id: number) => {
    if (!confirm('Удалить этот быстрый ответ?')) return

    try {
      const response = await fetch(`/api/quick-replies?id=${id}`, {
        method: 'DELETE',
      })

      const data = await response.json()
      if (data.success) {
        await fetchQuickReplies()
      } else {
        alert(data.error || 'Ошибка при удалении быстрого ответа')
      }
    } catch (error) {
      console.error('Failed to delete quick reply:', error)
      alert('Ошибка при удалении быстрого ответа')
    }
  }

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
        fetch(`/api/users/${params.userId}/operator-chat`),
        fetch(`/api/users/${params.userId}`),
        fetch(`/api/users/${params.userId}/profile-photo`)
      ])

      const chatData = await chatRes.json()
      const userData = await userRes.json()
      const photoData = await photoRes.json()

      if (chatData.success && chatData.data.messages) {
        // Разворачиваем, чтобы старые были сверху (для правильного отображения)
        const reversedMessages = [...chatData.data.messages].reverse()
        // Объединяем с временными сообщениями (если есть) и убираем дубликаты
        setMessages(prev => {
          const tempMessages = prev.filter(msg => msg.id < 0) // Временные сообщения
          const realMessages = reversedMessages
          
          // Убираем дубликаты: если временное сообщение совпадает с реальным по тексту и времени (в пределах 5 секунд), удаляем временное
          const filteredTempMessages = tempMessages.filter(tempMsg => {
            const isDuplicate = realMessages.some(realMsg => {
              const timeDiff = Math.abs(new Date(realMsg.createdAt).getTime() - new Date(tempMsg.createdAt).getTime())
              const textMatch = realMsg.messageText === tempMsg.messageText
              const directionMatch = realMsg.direction === tempMsg.direction
              // Если сообщения совпадают по тексту, направлению и времени (в пределах 5 секунд) - это дубликат
              return textMatch && directionMatch && timeDiff < 5000
            })
            return !isDuplicate // Оставляем только те временные, которые не являются дубликатами
          })
          
          // Объединяем и убираем дубликаты по ID, сортируем по времени
          const allMessages = [...realMessages, ...filteredTempMessages]
          const uniqueMessages = allMessages.filter((msg, index, self) => 
            index === self.findIndex(m => m.id === msg.id)
          )
          const sorted = uniqueMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          return sorted
        })
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

    const messageText = newMessage.trim()
    const fileToSend = selectedFile
    const previewUrlToSend = previewUrl

    // Оптимистичное обновление - сразу добавляем сообщение в список
    const tempMessage: ChatMessage = {
      id: -Date.now(), // Временный отрицательный ID, чтобы отличать от реальных
      userId: params.userId?.toString() || '',
      messageText: messageText || null,
      messageType: fileToSend?.type.startsWith('image/') ? 'photo' : fileToSend?.type.startsWith('video/') ? 'video' : 'text',
      direction: 'out',
      createdAt: new Date().toISOString(),
      mediaUrl: previewUrlToSend || null,
    }

    // Добавляем сообщение в начало списка (так как они развернуты)
    setMessages(prev => [tempMessage, ...prev])
    setNewMessage('')
    removeFile()
    
    // Скроллим вниз
    setTimeout(() => scrollToBottom(), 100)

    setSending(true)
    try {
      const formData = new FormData()
      if (messageText) {
        formData.append('message', messageText)
      }
      if (fileToSend) {
        formData.append('file', fileToSend)
        formData.append('fileType', fileToSend.type)
      }

      const response = await fetch(`/api/users/${params.userId}/operator-chat`, {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (data.success) {
        // Удаляем временное сообщение сразу после успешной отправки
        setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id))
        
        // Сбрасываем ответ на сообщение
        setReplyingToMessageId(null)
        
        // Обновляем чат, чтобы получить реальное сообщение из БД
        // Небольшая задержка, чтобы БД успела сохранить
        setTimeout(async () => {
          await fetchChatData()
        }, 300)
      } else {
        // Удаляем временное сообщение при ошибке
        setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id))
        alert(data.error || 'Ошибка при отправке сообщения')
      }
    } catch (error) {
      console.error('Failed to send message:', error)
      // Удаляем временное сообщение при ошибке
      setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id))
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

  // Обработка контекстного меню
  const handleMessageContextMenu = (e: React.MouseEvent, messageId: number) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      messageId,
      x: e.clientX,
      y: e.clientY,
    })
  }

  // Закрытие контекстного меню при клике вне его
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }

    if (contextMenu || showMenu) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [contextMenu, showMenu])

  // Копирование сообщения
  const handleCopyMessage = async (message: ChatMessage) => {
    const textToCopy = message.messageText || ''
    try {
      await navigator.clipboard.writeText(textToCopy)
      setContextMenu(null)
      // Можно добавить уведомление об успешном копировании
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  // Ответ на сообщение
  const handleReplyToMessage = (message: ChatMessage) => {
    setReplyingToMessageId(message.id)
    setContextMenu(null)
    // Добавляем префикс в поле ввода (опционально)
    if (message.messageText) {
      setNewMessage(`> ${message.messageText}\n\n`)
    }
    // Фокус на поле ввода
    setTimeout(() => {
      const input = document.querySelector('textarea') as HTMLTextAreaElement
      if (input) {
        input.focus()
        input.setSelectionRange(input.value.length, input.value.length)
      }
    }, 100)
  }

  // Редактирование сообщения
  const handleEditMessage = (message: ChatMessage) => {
    if (message.direction !== 'out') return // Можно редактировать только свои сообщения
    
    setEditingMessageId(message.id)
    setEditingMessageText(message.messageText || '')
    setContextMenu(null)
  }

  // Сохранение отредактированного сообщения
  const handleSaveEdit = async () => {
    if (!editingMessageId || !editingMessageText.trim()) return

    try {
      const response = await fetch(`/api/chat-messages/${editingMessageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: editingMessageText }),
      })

      const data = await response.json()

      if (data.success) {
        // Обновляем сообщение в списке
        setMessages(prev =>
          prev.map(msg =>
            msg.id === editingMessageId
              ? { ...msg, messageText: editingMessageText }
              : msg
          )
        )
        setEditingMessageId(null)
        setEditingMessageText('')
      } else {
        alert(data.error || 'Ошибка при редактировании сообщения')
      }
    } catch (error) {
      console.error('Failed to edit message:', error)
      alert('Ошибка при редактировании сообщения')
    }
  }

  // Удаление сообщения
  const handleDeleteMessage = async (messageId: number) => {
    if (!confirm('Вы уверены, что хотите удалить это сообщение?')) {
      setContextMenu(null)
      return
    }

    try {
      const response = await fetch(`/api/chat-messages/${messageId}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (data.success) {
        // Удаляем сообщение из списка
        setMessages(prev => prev.filter(msg => msg.id !== messageId))
        setContextMenu(null)
      } else {
        alert(data.error || 'Ошибка при удалении сообщения')
      }
    } catch (error) {
      console.error('Failed to delete message:', error)
      alert('Ошибка при удалении сообщения')
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

  const handleCloseChat = async () => {
    try {
      const response = await fetch('/api/operator-chats', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.userId, isClosed: true }),
      })
      
      const data = await response.json()
      if (data.success) {
        router.push('/dashboard/operator-chats')
      }
    } catch (error) {
      console.error('Failed to close chat:', error)
    }
  }

  const fetchAllRequests = async () => {
    setLoadingRequests(true)
    try {
      const response = await fetch(`/api/users/${params.userId}/requests`)
      const data = await response.json()
      if (data.success) {
        setAllRequests(data.data.requests || [])
        setUncreatedRequests(data.data.uncreatedRequests || [])
      } else {
        console.error('Failed to fetch requests:', data.error)
        setAllRequests([])
        setUncreatedRequests([])
      }
    } catch (error) {
      console.error('Failed to fetch requests:', error)
      setAllRequests([])
      setUncreatedRequests([])
    } finally {
      setLoadingRequests(false)
    }
  }

  const handleOpenTransactions = () => {
    setShowMenu(false)
    setShowTransactionsModal(true)
    fetchAllRequests()
  }

  const handleSendToReview = async (uncreatedId: number) => {
    try {
      const response = await fetch(`/api/uncreated-requests/${uncreatedId}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      if (!data.success) {
        alert(data.error || 'Не удалось отправить на проверку')
        return
      }
      setUncreatedRequests(prev => prev.filter(u => u.id !== uncreatedId))
      if (data.data?.request) {
        setAllRequests(prev => [data.data.request, ...prev])
      }
      alert('Отправлено на проверку')
    } catch (error) {
      console.error('Send to review error:', error)
      alert('Ошибка при отправке на проверку')
    }
  }

  const handleSendRequestToReview = async (requestId: number, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    try {
      const response = await fetch(`/api/requests/${requestId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      if (!data.success) {
        alert(data.error || 'Не удалось отправить на проверку')
        return
      }
      if (data.data?.request) {
        setAllRequests((prev) =>
          prev.map((r) => (r.id === requestId ? { ...r, ...data.data.request } : r))
        )
      }
      alert('Отправлено на проверку')
    } catch (error) {
      console.error('Send request to review error:', error)
      alert('Ошибка при отправке на проверку')
    }
  }

  const getTransactionType = (tx: { transType: string; status: string; status_detail: string | null }) => {
    if (tx.status_detail?.includes('pending_check') || tx.status === 'pending_check') {
      return 'На проверке'
    }
    if (tx.status === 'pending' || tx.status === 'processing') {
      return '-'
    }
    
    if (tx.transType === 'withdraw') {
      return tx.status_detail?.match(/profile-\d+/)?.[0] || 'profile-1'
    }
    
    if (tx.transType === 'deposit') {
      if (tx.status === 'autodeposit_success' || tx.status === 'auto_completed' || tx.status_detail?.includes('autodeposit')) {
        return 'Авто пополнение'
      }
      if (tx.status_detail?.match(/profile-\d+/)) {
        return tx.status_detail.match(/profile-(\d+)/)?.[0] || ''
      }
      return ''
    }
    
    return tx.transType === 'deposit' ? 'Пополнение' : 'Вывод'
  }

  const getStatusLabel = (status: string, status_detail: string | null = null) => {
    if (status_detail?.match(/profile-\d+/)) {
      return status_detail.match(/profile-(\d+)/)?.[0] || status_detail
    }
    
    switch (status) {
      case 'completed':
      case 'approved':
      case 'auto_completed':
      case 'autodeposit_success':
        return 'Успешно'
      case 'pending':
        return 'Ожидает'
      case 'rejected':
      case 'declined':
        if (status_detail) {
          return status_detail
        }
        return 'Отклонено'
      case 'deferred':
        return 'Отложено'
      case 'processing':
        return 'Обработка'
      case 'manual':
      case 'awaiting_manual':
        return 'Ручная'
      default:
        return 'Неизвестно'
    }
  }

  const formatRequestDate = (dateString: string) => {
    const date = new Date(dateString)
    const day = date.getDate().toString().padStart(2, '0')
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const year = date.getFullYear()
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    return `${day}.${month}.${year} • ${hours}:${minutes}`
  }

  return (
    <div className="flex flex-col h-full max-h-full bg-gray-900">
      {/* Хедер */}
      <div className="flex items-center justify-between p-4 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <Link
          href={`/dashboard/users/${user.userId}`}
          className="flex items-center space-x-3 flex-1 ml-2"
        >
          {user.photoUrl ? (
            <img
              src={user.photoUrl}
              alt={displayName}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-bold">{displayName.charAt(0).toUpperCase()}</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{displayName}</p>
            <p className="text-xs text-gray-500">был(а) недавно</p>
          </div>
        </Link>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleCloseChat}
            className="px-3 py-1.5 text-xs text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            Закрыть чат
          </button>
          <div className="relative" ref={menuRef}>
            <button 
              onClick={(e) => {
                e.stopPropagation()
                setShowMenu(!showMenu)
              }}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors flex-shrink-0"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 z-50">
                <button
                  onClick={handleOpenTransactions}
                  className="w-full px-4 py-2 text-left text-gray-100 hover:bg-gray-800 flex items-center space-x-3 transition-colors"
                >
                  <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <span>Транзакции</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Сообщения */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-900 min-h-0">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <p>Нет сообщений</p>
            <p className="text-sm mt-2">Начните общение</p>
          </div>
        ) : (
          messages.map((message) => {
            const isEditing = editingMessageId === message.id
            const isReplying = replyingToMessageId === message.id
            
            return (
              <div
                key={message.id}
                className={`flex ${message.direction === 'out' ? 'justify-end' : 'justify-start'} group`}
                onContextMenu={(e) => handleMessageContextMenu(e, message.id)}
              >
                <div
                  className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl relative ${
                    message.direction === 'out'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-800 text-white'
                  } ${isReplying ? 'ring-2 ring-blue-400' : ''}`}
                >
                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea
                        value={editingMessageText}
                        onChange={(e) => setEditingMessageText(e.target.value)}
                        className="w-full bg-transparent text-white border border-white/30 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-white/50 resize-none"
                        rows={3}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.ctrlKey) {
                            handleSaveEdit()
                          } else if (e.key === 'Escape') {
                            setEditingMessageId(null)
                            setEditingMessageText('')
                          }
                        }}
                      />
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => {
                            setEditingMessageId(null)
                            setEditingMessageText('')
                          }}
                          className="text-xs text-white/70 hover:text-white"
                        >
                          Отмена
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg"
                        >
                          Сохранить (Ctrl+Enter)
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
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
                          {message.messageType === 'photo' && (
                            <div className="flex items-center text-xs text-gray-400 mt-1">
                              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              Изображение
                            </div>
                          )}
                        </div>
                      )}
                      {message.messageText && (
                        <p className="text-sm whitespace-pre-wrap break-words">{message.messageText}</p>
                      )}
                      <div className="flex items-center justify-end mt-1">
                        <p className={`text-xs ${message.direction === 'out' ? 'text-blue-100' : 'text-gray-400'}`}>
                          {formatDate(message.createdAt)}
                        </p>
                        {message.direction === 'out' && (
                          <svg className="w-4 h-4 ml-1 text-blue-100" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Контекстное меню */}
      {contextMenu && (() => {
        const message = messages.find(m => m.id === contextMenu.messageId)
        if (!message) return null

        return (
          <div
            ref={contextMenuRef}
            className="fixed bg-white rounded-lg shadow-xl py-1 z-50 min-w-[180px]"
            style={{
              left: `${Math.min(contextMenu.x, window.innerWidth - 200)}px`,
              top: `${Math.min(contextMenu.y, window.innerHeight - 200)}px`,
            }}
          >
            <button
              onClick={() => handleReplyToMessage(message)}
              className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center space-x-3"
            >
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              <span>Ответить</span>
            </button>
            <button
              onClick={() => handleCopyMessage(message)}
              className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center space-x-3"
            >
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span>Копировать</span>
            </button>
            {message.direction === 'out' && (
              <button
                onClick={() => handleEditMessage(message)}
                className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center space-x-3"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span>Редактировать</span>
              </button>
            )}
            {message.direction === 'out' && (
              <button
                onClick={() => handleDeleteMessage(message.id)}
                className="w-full px-4 py-2 text-left text-red-600 hover:bg-red-50 flex items-center space-x-3"
              >
                <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span>Удалить</span>
              </button>
            )}
          </div>
        )
      })()}

      {/* Панель быстрых ответов */}
      {showQuickReplies && (
        <div className="bg-gray-800 border-t border-gray-700 p-4 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Быстрые ответы</h3>
            <button
              onClick={() => {
                setShowQuickReplies(false)
                setEditingReply(null)
              }}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Список быстрых ответов */}
          {quickReplies.length > 0 ? (
            <div className="flex flex-wrap gap-2 mb-3 max-h-32 overflow-y-auto">
              {quickReplies.map((reply) => (
                <div key={reply.id} className="flex items-center group relative">
                  {editingReply?.id === reply.id ? (
                    <div className="flex items-center space-x-1 bg-gray-700 rounded-lg px-2 py-1">
                      <input
                        type="text"
                        value={editingReply.text}
                        onChange={(e) => setEditingReply({ ...editingReply, text: e.target.value })}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            handleEditQuickReply(reply.id, editingReply.text)
                          } else if (e.key === 'Escape') {
                            setEditingReply(null)
                          }
                        }}
                        className="bg-transparent text-white text-xs px-1 py-0.5 rounded border border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[150px]"
                        autoFocus
                      />
                      <button
                        onClick={() => handleEditQuickReply(reply.id, editingReply.text)}
                        className="text-green-400 hover:text-green-300 p-0.5"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setEditingReply(null)}
                        className="text-red-400 hover:text-red-300 p-0.5"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleQuickReplyClick(reply.text)}
                        className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                      >
                        {reply.text}
                      </button>
                      <div className="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditingReply({ id: reply.id, text: reply.text })}
                          className="text-gray-400 hover:text-blue-400 p-0.5"
                          title="Редактировать"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteQuickReply(reply.id)}
                          className="text-gray-400 hover:text-red-400 p-0.5"
                          title="Удалить"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 mb-3">Нет быстрых ответов. Добавьте первый!</p>
          )}

          {/* Добавление нового быстрого ответа */}
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={newReplyText}
              onChange={(e) => setNewReplyText(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleAddQuickReply()
                }
              }}
              placeholder="Добавить быстрый ответ..."
              className="flex-1 bg-gray-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleAddQuickReply}
              disabled={!newReplyText.trim()}
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Добавить
            </button>
          </div>
        </div>
      )}

      {/* Поле ввода */}
      <div className="p-4 bg-gray-900 border-t border-gray-800 flex-shrink-0">
        {/* Индикатор ответа на сообщение */}
        {replyingToMessageId && (() => {
          const replyingTo = messages.find(m => m.id === replyingToMessageId)
          if (!replyingTo) return null
          
          return (
            <div className="mb-2 p-2 bg-gray-800 rounded-lg border-l-4 border-blue-500 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-400 mb-1">Ответ на сообщение:</div>
                <div className="text-sm text-white truncate">
                  {replyingTo.messageText || (replyingTo.mediaUrl ? 'Медиа' : 'Сообщение')}
                </div>
              </div>
              <button
                onClick={() => setReplyingToMessageId(null)}
                className="ml-2 text-gray-400 hover:text-white"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )
        })()}
        
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
          {/* Кнопка молнии для быстрых ответов */}
          <button
            onClick={() => setShowQuickReplies(!showQuickReplies)}
            className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
              showQuickReplies ? 'bg-blue-500 text-white' : 'hover:bg-gray-800 text-white'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </button>
          {/* Кнопка вложения */}
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors flex-shrink-0"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Введите сообщение..."
            className="flex-1 bg-gray-800 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={sending}
          />
          <button
            onClick={sendMessage}
            disabled={sending || (!newMessage.trim() && !selectedFile)}
            className="p-2 bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>

      {/* Модальное окно со всеми транзакциями */}
      {showTransactionsModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50"
          onClick={() => setShowTransactionsModal(false)}
        >
          <div 
            className="bg-gray-900 rounded-2xl shadow-xl max-w-sm w-full max-h-[90vh] overflow-hidden flex flex-col border border-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Заголовок */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
              <div>
                <h2 className="text-[15px] font-bold text-white">Все заявки</h2>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {user ? (user.firstName || user.username || `ID: ${user.userId}`) : ''} • Всего: {allRequests.length}
                </p>
              </div>
              <button
                onClick={() => setShowTransactionsModal(false)}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Список заявок */}
            <div className="flex-1 overflow-y-auto px-3 py-2 max-h-[70vh]">
              {loadingRequests ? (
                <div className="flex items-center justify-center py-10">
                  <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-500"></div>
                </div>
              ) : (uncreatedRequests.length === 0 && allRequests.length === 0) ? (
                <div className="text-center py-10">
                  <p className="text-gray-400">Нет заявок</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {uncreatedRequests.map((req) => {
                    const isDeposit = req.requestType === 'deposit'
                    return (
                      <div
                        key={`u-${req.id}`}
                        className="bg-gray-800 rounded-lg p-4 border border-dashed border-gray-700"
                      >
                        <div className="flex items-center justify-between space-x-3">
                          <div className="flex-1 min-w-0 flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-700 flex items-center justify-center border border-gray-700">
                              <img
                                src={getBankImage(req.bank)}
                                alt={req.bank || 'bank'}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="text-sm font-semibold text-white truncate">
                                  {isDeposit ? 'Пополнение' : 'Вывод'}
                                </span>
                                {req.accountId && (
                                  <span className="text-[11px] text-gray-400 truncate">ID: {req.accountId}</span>
                                )}
                              </div>
                              <div className="flex items-center space-x-2 text-[11px] text-gray-400">
                                <span>{formatRequestDate(req.createdAt)}</span>
                                {req.bank && <span className="truncate">• {req.bank}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="text-right ml-2 flex-shrink-0">
                            <p className="text-[15px] font-bold mb-1 text-green-500">
                              +{req.amount}
                            </p>
                            <div className="flex items-center justify-end space-x-2">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-800 text-gray-100 border border-gray-700">
                                {req.status === 'pending_check' ? 'На проверке' : 'Не создана'}
                              </span>
                              {req.status === 'not_created' && (
                                <button
                                  onClick={() => handleSendToReview(req.id)}
                                  className="px-3 py-1 text-[11px] font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                                >
                                  На проверку
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {allRequests.map((request) => {
                    const isDeposit = request.requestType === 'deposit'
                    const transactionType = getTransactionType({
                      transType: request.requestType,
                      status: request.status,
                      status_detail: request.statusDetail,
                    })
                    const statusLabel = getStatusLabel(request.status, request.statusDetail)

                    const isRejected = ['rejected', 'declined'].includes(request.status)
                    return (
                      <Link
                        key={request.id}
                        href={`/dashboard/requests/${request.id}`}
                        className="block bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-blue-500 transition-colors"
                      >
                        <div className="flex items-center justify-between space-x-3">
                          <div className="flex-1 min-w-0 flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-700 flex items-center justify-center border border-gray-700">
                              <img
                                src={getBankImage(request.bank)}
                                alt={request.bank || 'bank'}
                                className="w-full h-full object-cover"
                              />
                              </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="text-sm font-semibold text-white truncate">
                                  {displayName}
                                </span>
                                {request.bookmaker && (
                                  <span className="text-[11px] text-gray-400 truncate">
                                    {request.bookmaker}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center flex-wrap gap-2 text-[11px] text-gray-400">
                                <span>{formatRequestDate(request.createdAt)}</span>
                                {transactionType && transactionType !== '-' && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-600 text-white">
                                      {transactionType}
                                    </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right ml-2 flex-shrink-0">
                            <p className={`text-[15px] font-bold mb-1 ${
                              isDeposit ? 'text-green-500' : 'text-red-500'
                            }`}>
                              {isDeposit ? '+' : '-'}{parseFloat(request.amount || '0').toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </p>
                            <div className="flex items-center justify-end gap-2">
                            <div className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-800 text-gray-100 border border-gray-700">
                              {statusLabel}
                              </div>
                              {isRejected && (
                                <button
                                  onClick={(e) => handleSendRequestToReview(request.id, e)}
                                  className="px-3 py-1 text-[11px] font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                                >
                                  Проверка
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

