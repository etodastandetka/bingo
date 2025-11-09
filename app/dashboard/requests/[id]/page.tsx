'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

interface RequestDetail {
  id: number
  userId: string
  username: string | null
  firstName: string | null
  lastName: string | null
  bookmaker: string | null
  accountId: string | null
  amount: string | null
  requestType: string
  status: string
  statusDetail: string | null
  status_detail: string | null
  bank: string | null
  phone: string | null
  withdrawalCode: string | null
  withdrawal_code: string | null
  photoFileUrl: string | null
  userNote: string | null
  createdAt: string
  updatedAt: string
  processedAt: string | null
  incomingPayments: any[]
  matchingPayments?: any[]
  casinoTransactions?: any[]
}

interface MatchingPayment {
  id: number
  amount: string
  bank: string | null
  paymentDate: string
  requestId: number | null
  isProcessed: boolean
}

interface Payment {
  id: number
  amount: string
  createdAt: string
  description?: string
}

export default function RequestDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [request, setRequest] = useState<RequestDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchAmount, setSearchAmount] = useState('')
  const [exactAmount, setExactAmount] = useState(false)
  const [processedOnly, setProcessedOnly] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [searchId, setSearchId] = useState('')
  const [deferring, setDeferring] = useState(false)
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null)
  const [selectedPaymentId, setSelectedPaymentId] = useState<number | null>(null)
  const [linkingPayment, setLinkingPayment] = useState(false)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    
    return () => {
      isMountedRef.current = false
    }
  }, [])

    useEffect(() => {
      const requestId = Array.isArray(params.id) ? params.id[0] : params.id
      if (!requestId) {
        setLoading(false)
        return
      }

      const abortController = new AbortController()
      let intervalId: NodeJS.Timeout | null = null

      const fetchRequest = async (showLoading = true) => {
        try {
          const response = await fetch(`/api/requests/${requestId}`, {
            signal: abortController.signal
          })
          
          if (abortController.signal.aborted || !isMountedRef.current) return
          
          const data = await response.json()

          // console.log('📋 Request detail data:', data)

          if (!isMountedRef.current) return

          if (data.success && isMountedRef.current) {
            const requestData = data.data
            
            // Проверяем, есть ли привязанный платеж с совпадающей суммой
            // Если да, и заявка еще не completed, автоматически обновляем статус
            if (requestData.requestType === 'deposit' && 
                requestData.status !== 'completed' && 
                requestData.status !== 'approved' &&
                requestData.status !== 'rejected' &&
                requestData.matchingPayments) {
              const linkedPayment = requestData.matchingPayments.find((p: MatchingPayment) => 
                p.requestId === requestData.id && p.isProcessed
              )
              
              if (linkedPayment && requestData.amount) {
                const paymentAmount = parseFloat(linkedPayment.amount)
                const requestAmount = parseFloat(requestData.amount)
                
                // Если сумма совпадает (с точностью до 1 копейки), обновляем статус
                if (Math.abs(paymentAmount - requestAmount) < 0.01) {
                  try {
                    const updateResponse = await fetch(`/api/requests/${requestData.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                        status: 'completed',
                        statusDetail: null // "успешно"
                      }),
                    })
                    
                    const updateData = await updateResponse.json()
                    if (updateData.success) {
                      // Обновляем данные заявки
                      const refreshedResponse = await fetch(`/api/requests/${requestId}`, {
                        signal: abortController.signal
                      })
                      const refreshedData = await refreshedResponse.json()
                      if (refreshedData.success && isMountedRef.current) {
                        requestData.status = 'completed'
                        requestData.statusDetail = null
                        requestData.processedAt = refreshedData.data.processedAt
                      }
                    }
                  } catch (error) {
                    console.error('Failed to auto-update request status:', error)
                  }
                }
              }
            }
            
            setRequest(requestData)
            
            // Загружаем фото профиля пользователя
            if (requestData.userId) {
              fetchProfilePhoto(requestData.userId)
            }
          } else {
            console.error('❌ Failed to fetch request:', data.error)
          }
        } catch (error: any) {
          if (error.name === 'AbortError') {
            return // Запрос был отменен, игнорируем ошибку
          }
          console.error('❌ Failed to fetch request:', error)
        } finally {
          if (isMountedRef.current && !abortController.signal.aborted && showLoading) {
            setLoading(false)
          }
        }
      }
      
      const fetchProfilePhoto = async (userId: string) => {
        try {
          const photoResponse = await fetch(`/api/users/${userId}/profile-photo`)
          const photoData = await photoResponse.json()
          
          if (photoData.success && photoData.data?.photoUrl && isMountedRef.current) {
            setProfilePhotoUrl(photoData.data.photoUrl)
          }
        } catch (error) {
          console.error('Failed to fetch profile photo:', error)
        }
      }
    
    fetchRequest(true)
    
    // Автоматическое обновление каждые 3 секунды
    intervalId = setInterval(() => {
      fetchRequest(false)
    }, 3000)
    
    // Обновление при фокусе страницы
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchRequest(false)
      }
    }
    
    const handleFocus = () => {
      fetchRequest(false)
    }
    
    // Синхронизация между вкладками через storage event
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'request_updated' && e.newValue) {
        const updatedRequestId = parseInt(e.newValue)
        if (updatedRequestId === parseInt(requestId as string)) {
          console.log('🔄 Request updated in another tab:', updatedRequestId)
          fetchRequest(false)
        }
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('storage', handleStorageChange)
    
    return () => {
      abortController.abort()
      if (intervalId) {
        clearInterval(intervalId)
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [params.id])

  // Закрываем меню при клике вне его
  useEffect(() => {
    if (!showMenu) return

    const handleClickOutside = (event: MouseEvent) => {
      if (!isMountedRef.current) return
      
      const target = event.target as HTMLElement
      if (!target.closest('.relative')) {
        if (isMountedRef.current) {
          setShowMenu(false)
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])

  // Получаем все транзакции по accountId (ID казино) - используем useMemo для безопасного вычисления
  // ВАЖНО: должен вызываться до любых условных возвратов!
  const transactions = useMemo(() => {
    if (!request || !request.casinoTransactions) return []
    
    return request.casinoTransactions.map(t => {
      const amount = parseFloat(t.amount || '0')
      const isDeposit = t.requestType === 'deposit'
      const userName = t.username 
        ? `@${t.username}` 
        : t.firstName 
          ? `${t.firstName}${t.lastName ? ' ' + t.lastName : ''}` 
          : `ID: ${t.userId}`
      
      return {
        id: t.id,
        amount: Math.abs(amount).toFixed(2).replace('.', ','),
        isDeposit,
        createdAt: t.createdAt,
        status: t.status,
        userName,
        userId: t.userId,
        bookmaker: t.bookmaker,
        description: `${isDeposit ? 'Пополнение' : 'Вывод'} от ${userName}`,
      }
    })
  }, [request])

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    alert('Скопировано в буфер обмена')
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const day = date.getDate().toString().padStart(2, '0')
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const year = date.getFullYear()
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    return `${day}.${month}.${year} • ${hours}:${minutes}`
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
      case 'Ожидает':
        return 'bg-yellow-500 text-black'
      case 'completed':
      case 'approved':
      case 'Успешно':
        return 'bg-blue-500 text-white'
      case 'rejected':
        return 'bg-red-500 text-white'
      case 'deferred':
        return 'bg-orange-500 text-white'
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
      default:
        return status
    }
  }

  const deferRequest = async () => {
    if (!request) return
    
    setDeferring(true)
    try {
      const response = await fetch(`/api/requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'deferred' }),
      })

      const data = await response.json()

      if (data.success) {
        // Проверяем, что компонент все еще смонтирован перед обновлением
        setRequest(prevRequest => prevRequest ? { ...prevRequest, ...data.data } : data.data)
        setShowMenu(false)
        
        // Уведомляем другие вкладки об обновлении
        localStorage.setItem('request_updated', request.id.toString())
        localStorage.removeItem('request_updated') // Триггерим storage event
        
        alert('Заявка отложена')
      } else {
        alert(data.error || 'Ошибка при откладывании заявки')
      }
    } catch (error) {
      console.error('Failed to defer request:', error)
      alert('Ошибка при откладывании заявки')
    } finally {
      setDeferring(false)
    }
  }

    // Функция для обновления статуса заявки (подтвердить/отклонить)
    const updateRequestStatus = async (newStatus: 'completed' | 'approved' | 'rejected') => {
      if (!request) return
      
      try {
        // Если подтверждаем депозит, сначала пополняем баланс через API казино
        if ((newStatus === 'completed' || newStatus === 'approved') && request.requestType === 'deposit' && request.bookmaker && request.accountId && request.amount) {
          try {
            // Если выбран платеж, используем его сумму, иначе сумму заявки
            let depositAmount = request.amount
            if (selectedPaymentId && request.matchingPayments) {
              const selectedPayment = request.matchingPayments.find((p: MatchingPayment) => p.id === selectedPaymentId)
              if (selectedPayment) {
                depositAmount = selectedPayment.amount
              }
            }
            
            const depositResponse = await fetch('/api/deposit-balance', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                requestId: request.id,
                bookmaker: request.bookmaker,
                accountId: request.accountId,
                amount: depositAmount,
              }),
            })

            const depositData = await depositResponse.json()

            if (!depositData.success) {
              alert(`Ошибка пополнения баланса: ${depositData.error || depositData.message || 'Неизвестная ошибка'}`)
              return
            }

            // Если пополнение успешно, обновляем заявку
            if (depositData.data?.request) {
              // Проверяем, есть ли привязанный платеж
              const hasLinkedPayment = request.matchingPayments?.some((p: MatchingPayment) => p.requestId === request.id && p.isProcessed)
              
              // Если подтверждаем через привязанный платеж - устанавливаем "успешно" (completed без statusDetail)
              // Иначе - profile-1
              const statusDetail = hasLinkedPayment ? null : 'profile-1'
              
              // Обновляем статус заявки на completed
              const updateResponse = await fetch(`/api/requests/${request.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  status: 'completed',
                  statusDetail: statusDetail
                }),
              })
              
              const updateData = await updateResponse.json()
              if (updateData.success) {
                // Обновляем заявку с новым статусом
                const updatedRequest = { ...request, ...updateData.data, status: 'completed', statusDetail: statusDetail }
                setRequest(updatedRequest)
                // Перезагружаем данные для получения актуального состояния
                // Используем setTimeout для асинхронной перезагрузки после обновления состояния
                setTimeout(async () => {
                  const refreshResponse = await fetch(`/api/requests/${request.id}`)
                  const refreshData = await refreshResponse.json()
                  if (refreshData.success && isMountedRef.current) {
                    setRequest(refreshData.data)
                  }
                }, 500)
              } else {
                // Если обновление статуса не удалось, но баланс пополнен, обновляем только данные из depositData
                if (depositData.data?.request) {
                  setRequest(prevRequest => prevRequest ? { ...prevRequest, ...depositData.data.request } : depositData.data.request)
                }
              }
              
              // Уведомляем другие вкладки об обновлении
              localStorage.setItem('request_updated', request.id.toString())
              localStorage.removeItem('request_updated')
              
              const statusMessage = hasLinkedPayment ? 'Баланс игрока пополнен. Заявка подтверждена успешно.' : 'Баланс игрока пополнен. Заявка подтверждена.'
              alert(statusMessage)
              return
            }
          } catch (depositError) {
            console.error('Failed to deposit balance:', depositError)
            alert('Ошибка при пополнении баланса игрока. Заявка не подтверждена.')
            return
          }
        }

        // Для остальных случаев просто обновляем статус
        const response = await fetch(`/api/requests/${request.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        })

        const data = await response.json()

        if (data.success) {
          // Обновляем заявку с новым статусом
          const updatedRequest = { ...request, ...data.data, status: newStatus }
          setRequest(updatedRequest)
          
          // Перезагружаем данные для получения актуального состояния
          setTimeout(async () => {
            const refreshResponse = await fetch(`/api/requests/${request.id}`)
            const refreshData = await refreshResponse.json()
            if (refreshData.success && isMountedRef.current) {
              setRequest(refreshData.data)
            }
          }, 500)
          
          // Уведомляем другие вкладки об обновлении
          localStorage.setItem('request_updated', request.id.toString())
          localStorage.removeItem('request_updated') // Триггерим storage event
          
          const statusLabel = newStatus === 'completed' || newStatus === 'approved' ? 'подтверждена' : 'отклонена'
          alert(`Заявка ${statusLabel}`)
        } else {
          alert(data.error || 'Ошибка при обновлении заявки')
        }
      } catch (error) {
        console.error('Failed to update request status:', error)
        alert('Ошибка при обновлении заявки')
      }
    }

  const handleSearchById = () => {
    if (!searchId.trim()) {
      alert('Введите ID заявки')
      return
    }

    const id = parseInt(searchId.trim())
    if (isNaN(id)) {
      alert('ID должен быть числом')
      return
    }

    router.push(`/dashboard/requests/${id}`)
    setShowSearchModal(false)
    setSearchId('')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (!request) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-24 h-24 bg-red-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
          <svg className="w-16 h-16 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <p className="text-white text-lg font-medium">Заявка не найдена</p>
        <button
          onClick={() => router.back()}
          className="mt-4 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
        >
          Назад
        </button>
      </div>
    )
  }

    const displayAmount = request?.amount ? parseFloat(request.amount).toFixed(2).replace('.', ',') : '0,00'
    const isDeposit = request?.requestType === 'deposit'
    const isDeferred = request?.status === 'deferred'
    
    // Определяем тип транзакции для проверки
    const getTransactionTypeForMinus = () => {
      // Для выводов может быть profile-*
      if (request?.requestType === 'withdraw') {
        return request?.status_detail?.match(/profile-\d+/)?.[0] || 'profile-1'
      }
      
      // Для депозитов
      if (request?.requestType === 'deposit') {
        // Авто пополнение - только если статус явно указывает на автопополнение
        if (request?.status === 'autodeposit_success' || request?.status === 'auto_completed' || request?.status_detail?.includes('autodeposit')) {
          return 'Авто пополнение'
        }
        
        // Проверяем наличие profile-* в status_detail
        if (request?.status_detail?.match(/profile-\d+/)) {
          return request.status_detail.match(/profile-(\d+)/)?.[0] || 'profile-1'
        }
        
        // Для всех остальных депозитов (включая отклоненные) показываем profile-1
        return 'profile-1'
      }
      
      return request?.requestType === 'deposit' ? 'Пополнение' : 'Вывод'
    }
    
    const transactionType = getTransactionTypeForMinus()
    // Если отложено и "Авто пополнение", показываем минус
    const showMinus = isDeferred && transactionType === 'Авто пополнение'
    
    const userName = request?.username 
      ? `@${request.username}` 
      : request?.firstName 
        ? `${request.firstName}${request.lastName ? ' ' + request.lastName : ''}` 
        : request ? `ID: ${request.userId}` : ''
    const displayName = request?.firstName || request?.username || (request ? `ID: ${request.userId}` : '')

  return (
    <div className="py-4">
      {/* Хедер с навигацией */}
      <div className="flex items-center mb-4 px-4">
        <div className="flex items-center space-x-2 flex-1 bg-gray-800 rounded-xl px-3 py-2 border border-gray-700">
          <button
            onClick={() => router.back()}
            className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <Link
            href={`/dashboard/users/${request.userId}`}
            className="flex items-center space-x-2 flex-1"
          >
            {profilePhotoUrl ? (
              <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 border-2 border-gray-600 relative">
                <Image
                  src={profilePhotoUrl}
                  alt={displayName}
                  fill
                  className="object-cover"
                  onError={() => {
                    // Если фото не загрузилось, показываем букву
                    setProfilePhotoUrl(null)
                  }}
                />
              </div>
            ) : (
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white text-sm font-bold">{displayName.charAt(0).toUpperCase()}</span>
              </div>
            )}
            <div className="text-left flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{displayName}</p>
              {request.username && (
                <p className="text-xs text-gray-400 truncate">@{request.username}</p>
              )}
            </div>
          </Link>
          <div className="flex items-center space-x-1">
            <Link
              href={`/dashboard/users/${request.userId}/chat`}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </Link>
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              </button>
              {showMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-gray-800 border border-gray-700 rounded-xl shadow-lg z-50">
                  <button
                    onClick={deferRequest}
                    disabled={deferring}
                    className="w-full text-left px-4 py-3 text-sm text-white hover:bg-gray-700 rounded-t-xl transition-colors disabled:opacity-50"
                  >
                    {deferring ? 'Откладывание...' : 'Отложить'}
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false)
                      setShowSearchModal(true)
                    }}
                    className="w-full text-left px-4 py-3 text-sm text-white hover:bg-gray-700 rounded-b-xl transition-colors"
                  >
                    Поиск по ID
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Модальное окно поиска по ID */}
      {showSearchModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-2xl p-6 mx-4 w-full max-w-md border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-4">Поиск по ID</h3>
            <input
              type="text"
              placeholder="Введите ID заявки"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearchById()}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-4"
              autoFocus
            />
            <div className="flex space-x-2">
              <button
                onClick={handleSearchById}
                className="flex-1 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
              >
                Найти
              </button>
              <button
                onClick={() => {
                  setShowSearchModal(false)
                  setSearchId('')
                }}
                className="px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Основная карточка с Telegram ID и суммой */}
      <div className="mx-4 mb-4 bg-gray-800 rounded-2xl p-6 border border-gray-700 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <span className="text-2xl font-bold text-white">{request.userId}</span>
            <button
              onClick={() => copyToClipboard(request.userId)}
              className="p-1 hover:bg-gray-700 rounded transition-colors"
            >
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
          <div className={`flex items-center space-x-2 px-3 py-1 rounded-full ${getStatusColor(request.status)}`}>
            <div className="w-2 h-2 rounded-full bg-current"></div>
            <span className="text-xs font-medium">{getStatusLabel(request.status)}</span>
          </div>
        </div>

        <p className="text-sm text-gray-400 mb-6">{formatDate(request.createdAt)}</p>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 mb-1">
              {isDeposit ? 'Пополнение' : 'Вывод'}
            </p>
            <p className={`text-3xl font-bold ${showMinus ? 'text-red-500' : (isDeposit ? 'text-blue-400' : 'text-red-500')}`}>
              {showMinus ? '-' : (isDeposit ? '+' : '-')}{displayAmount}
            </p>
          </div>
          <div className="flex space-x-2">
            <button className="p-3 bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </button>
            <button className="p-3 bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Информация о сайте и пользователе */}
      <div className="mx-4 mb-4 bg-gray-800 rounded-2xl p-4 border border-gray-700">
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400">Сайт:</span>
            <span className="text-sm font-medium text-white">{request.bookmaker || 'N/A'}</span>
          </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">ID заявки:</span>
              <span className="text-sm font-medium text-white">{request.id}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">ID Telegram:</span>
              <span className="text-sm font-medium text-white">{request.userId}</span>
            </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400">Дата создания:</span>
            <span className="text-sm font-medium text-white">{formatDate(request.createdAt)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400">Пользователь:</span>
            <span className="text-sm font-medium text-white">{userName}</span>
          </div>
          {request.userNote && (
            <div className="pt-2 border-t border-gray-700">
              <span className="text-sm text-gray-400 block mb-1">Заметка:</span>
              <span className="text-sm font-medium text-red-400 whitespace-pre-wrap">{request.userNote}</span>
            </div>
          )}
          {request.accountId && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">ID счета:</span>
              <span className="text-sm font-medium text-white">{request.accountId}</span>
            </div>
          )}
          {request.bank && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">Банк:</span>
              <span className="text-sm font-medium text-white">{request.bank}</span>
            </div>
          )}
          {request.phone && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">Телефон:</span>
              <span className="text-sm font-medium text-white">{request.phone}</span>
            </div>
          )}
          {(request.withdrawalCode || request.withdrawal_code) && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">Код вывода:</span>
              <span className="text-sm font-medium text-white">{request.withdrawalCode || request.withdrawal_code}</span>
            </div>
          )}
        </div>
      </div>

      {/* Фото чека (если есть) */}
      {request.photoFileUrl && (
        <div className="mx-4 mb-4 bg-gray-800 rounded-2xl p-4 border border-gray-700">
          <h3 className="text-base font-semibold text-white mb-3">Фото QR кода от банка</h3>
          <div className="relative w-full flex justify-center" style={{ minHeight: '200px', maxHeight: '500px' }}>
            {request.photoFileUrl.startsWith('data:image') || request.photoFileUrl.startsWith('/') ? (
              <img
                src={request.photoFileUrl}
                alt="Фото QR кода от банка"
                className="max-w-full max-h-[500px] rounded-lg border border-gray-600 object-contain"
                style={{ width: 'auto', height: 'auto' }}
                onError={(e) => {
                  // Если фото не загрузилось, скрываем блок
                  const target = e.target as HTMLElement
                  target.style.display = 'none'
                  const parent = target.closest('.bg-gray-800')
                  if (parent) {
                    (parent as HTMLElement).style.display = 'none'
                  }
                }}
              />
            ) : (
              <Image
                src={request.photoFileUrl}
                alt="Фото QR кода от банка"
                width={800}
                height={500}
                className="max-w-full max-h-[500px] rounded-lg border border-gray-600 object-contain"
                style={{ width: 'auto', height: 'auto' }}
                onError={(e) => {
                  // Если фото не загрузилось, скрываем блок
                  const target = e.target as HTMLElement
                  target.style.display = 'none'
                  const parent = target.closest('.bg-gray-800')
                  if (parent) {
                    (parent as HTMLElement).style.display = 'none'
                  }
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Кнопки действий для отложенных и ожидающих заявок */}
      {/* Скрываем кнопки если заявка уже обработана */}
      {(() => {
        const isPendingOrDeferred = request.status === 'deferred' || request.status === 'pending'
        const isProcessed = request.status === 'completed' || 
                          request.status === 'approved' || 
                          request.status === 'rejected' || 
                          request.status === 'auto_completed' || 
                          request.status === 'autodeposit_success'
        const hasProcessedPayment = request.matchingPayments?.some((p: MatchingPayment) => p.requestId === request.id && p.isProcessed)
        
        return isPendingOrDeferred && !isProcessed && !hasProcessedPayment
      })() && (
        <div className="mx-4 mb-4 flex space-x-3">
          <button
            onClick={() => updateRequestStatus('approved')}
            className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>Подтвердить</span>
          </button>
          <button
            onClick={() => updateRequestStatus('rejected')}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span>Отклонить</span>
          </button>
        </div>
      )}

      {/* Входящие платежи с поиском */}
      {request.requestType === 'deposit' && request.matchingPayments && request.matchingPayments.length > 0 && (
        <div className="mx-4 mb-4 bg-gray-800 rounded-2xl p-4 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-3">Переводы по QR</h3>
          
          {/* Поиск и фильтры */}
          <div className="mb-3">
            <div className="flex space-x-2 mb-2">
              <div className="flex-1 relative">
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Поиск по сумме..."
                  value={searchAmount}
                  onChange={(e) => setSearchAmount(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex space-x-3">
              <label className="flex items-center space-x-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exactAmount}
                  onChange={(e) => setExactAmount(e.target.checked)}
                  className="w-3.5 h-3.5 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                />
                <span className="text-xs text-gray-300">Точная сумма</span>
              </label>
              <label className="flex items-center space-x-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={processedOnly}
                  onChange={(e) => setProcessedOnly(e.target.checked)}
                  className="w-3.5 h-3.5 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                />
                <span className="text-xs text-gray-300">Обработанные</span>
              </label>
            </div>
          </div>
          
          <div className="space-y-1.5">
            {request.matchingPayments
              .filter((payment: MatchingPayment) => {
                // Фильтрация по сумме
                if (searchAmount) {
                  const searchValue = parseFloat(searchAmount.replace(',', '.'))
                  const paymentAmount = parseFloat(payment.amount)
                  if (exactAmount) {
                    if (Math.abs(paymentAmount - searchValue) > 0.01) return false
                  } else {
                    if (paymentAmount < searchValue * 0.9 || paymentAmount > searchValue * 1.1) return false
                  }
                }
                // Фильтрация по обработанным
                if (processedOnly && !payment.isProcessed) return false
                return true
              })
              .map((payment: MatchingPayment) => {
              const isAttached = payment.requestId === request.id && payment.isProcessed
              const isAutoCompleted = request.status === 'autodeposit_success' || request.status === 'auto_completed'
              // Платеж нередактируемый если он привязан или обработан для другой заявки
              const isDisabled = isAutoCompleted || isAttached || (payment.isProcessed && payment.requestId !== null && payment.requestId !== request.id)
              const isSelected = selectedPaymentId === payment.id
              
              return (
                <div
                  key={payment.id}
                  className={`bg-gray-900 rounded-lg p-2.5 border transition-colors ${
                    isDisabled 
                      ? 'border-gray-700 opacity-50 cursor-not-allowed' 
                      : isSelected
                        ? 'border-blue-500 bg-blue-900/20'
                        : 'border-gray-700 hover:border-gray-600 cursor-pointer'
                  }`}
                  onClick={() => !isDisabled && setSelectedPaymentId(isSelected ? null : payment.id)}
                >
                  <div className="flex items-center space-x-2">
                    <div className={`w-1 h-10 rounded-full ${isDisabled ? 'bg-gray-600' : 'bg-blue-500'}`}></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <p className="text-sm font-medium text-white truncate">Перевод по QR</p>
                        {(isAttached || (payment.isProcessed && payment.requestId === request.id)) && (
                          <span className="px-2 py-0.5 bg-gray-600 text-gray-300 rounded text-xs font-medium flex-shrink-0">
                            Обработан
                          </span>
                        )}
                        {payment.isProcessed && payment.requestId !== request.id && payment.requestId !== null && (
                          <span className="px-2 py-0.5 bg-gray-600 text-gray-300 rounded text-xs font-medium flex-shrink-0">
                            Обработан
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 mt-0.5">
                        <p className="text-xs text-gray-400">{formatDate(payment.paymentDate)}</p>
                        {payment.bank && (
                          <span className="text-xs text-gray-500">• {payment.bank}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <p className={`text-base font-bold ${isDisabled ? 'text-gray-500' : 'text-blue-400'}`}>
                        +{parseFloat(payment.amount).toFixed(2).replace('.', ',')}
                      </p>
                      {isSelected && !isDisabled && (
                        <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {selectedPaymentId && !request.matchingPayments?.find((p: MatchingPayment) => p.id === selectedPaymentId && (p.isProcessed && p.requestId === request.id)) && (
            <button
              onClick={async () => {
                if (!request || !selectedPaymentId) return
                setLinkingPayment(true)
                try {
                  const response = await fetch(`/api/incoming-payment/${selectedPaymentId}/link`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ requestId: request.id }),
                  })
                  
                  const data = await response.json()
                  if (data.success) {
                    // Обновляем заявку (API автоматически обновит статус если сумма совпадает)
                    const fetchResponse = await fetch(`/api/requests/${request.id}`)
                    const fetchData = await fetchResponse.json()
                    if (fetchData.success) {
                      setRequest(fetchData.data)
                      
                      // Проверяем, изменился ли статус на "успешно"
                      if (fetchData.data.status === 'completed') {
                        alert('Платеж привязан к заявке. Заявка автоматически подтверждена.')
                      } else {
                        alert('Платеж привязан к заявке')
                      }
                    }
                    setSelectedPaymentId(null)
                  } else {
                    alert(data.error || 'Ошибка при привязке платежа')
                  }
                } catch (error) {
                  console.error('Failed to link payment:', error)
                  alert('Ошибка при привязке платежа')
                } finally {
                  setLinkingPayment(false)
                }
              }}
              disabled={linkingPayment}
              className="mt-2 w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 text-sm"
            >
              {linkingPayment ? 'Привязка...' : 'Привязать выбранный платеж'}
            </button>
          )}
        </div>
      )}


      {/* Список транзакций по ID казино */}
      <div className="mx-4">
        <h3 className="text-lg font-semibold text-white mb-3">
          Транзакции {request.accountId && `(ID: ${request.accountId})`}
        </h3>
        {transactions.length > 0 ? (
          <div className="space-y-2">
            {transactions.map((transaction) => (
              <Link
                key={transaction.id}
                href={`/dashboard/requests/${transaction.id}`}
                className="block bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-blue-500 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-1 h-12 rounded-full ${transaction.isDeposit ? 'bg-blue-500' : 'bg-red-500'}`}></div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <p className="text-sm font-medium text-white">
                        {transaction.description}
                      </p>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        transaction.status === 'completed' || transaction.status === 'approved'
                          ? 'bg-blue-500 text-white'
                          : transaction.status === 'pending'
                          ? 'bg-yellow-500 text-black'
                          : transaction.status === 'rejected'
                          ? 'bg-red-500 text-white'
                          : 'bg-gray-700 text-gray-300'
                      }`}>
                        {transaction.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">{formatDate(transaction.createdAt)}</p>
                    {transaction.bookmaker && (
                      <p className="text-xs text-gray-500 mt-1">{transaction.bookmaker}</p>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <p className={`text-lg font-bold ${transaction.isDeposit ? 'text-blue-400' : 'text-red-500'}`}>
                      {transaction.isDeposit ? '+' : '-'}{transaction.amount}
                    </p>
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 text-center">
            <p className="text-gray-400">
              {request.accountId 
                ? `Нет транзакций по ID: ${request.accountId}`
                : 'ID казино не указан'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
