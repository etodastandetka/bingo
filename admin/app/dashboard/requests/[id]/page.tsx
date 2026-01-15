'use client'
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

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
  processedByUsername: string | null
  processedBy: string | null
  bank: string | null
  phone: string | null
  photoFileUrl: string | null
  withdrawalCode: string | null
  createdAt: string
  updatedAt: string
  processedAt: string | null
  userNote: string | null
  casinoError: string | null
  incomingPayments: any[]
  casinoTransactions?: any[]
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
  const searchAmountInitializedRef = useRef(false) // Отслеживаем, была ли сумма установлена
  // По умолчанию выключена "Точная сумма" - показываем все варианты с разными копейками
  const [exactAmount, setExactAmount] = useState(false)
  const [processedOnly, setProcessedOnly] = useState<boolean | undefined>(undefined)
  const [showMenu, setShowMenu] = useState(false)
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [searchId, setSearchId] = useState('')
  const [deferring, setDeferring] = useState(false)
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null)
  const [similarPayments, setSimilarPayments] = useState<any[]>([])
  const [selectedPaymentId, setSelectedPaymentId] = useState<number | null>(null)
  const [selectedPaymentPreview, setSelectedPaymentPreview] = useState<string | null>(null) // Предпросмотр суммы заявки по выбранному пополнению
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const [statusModalAction, setStatusModalAction] = useState<'approved' | 'rejected' | null>(null)
  const [statusModalLoading, setStatusModalLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [paymentModalAction, setPaymentModalAction] = useState<'approve' | 'reject' | null>(null)
  const [imageModalOpen, setImageModalOpen] = useState(false)
  const [imageZoom, setImageZoom] = useState(1)
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [photoFileUrl, setPhotoFileUrl] = useState<string | null>(null)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [deletePaymentModalOpen, setDeletePaymentModalOpen] = useState(false)
  const [paymentToDelete, setPaymentToDelete] = useState<number | null>(null)
  const [deletingPayment, setDeletingPayment] = useState(false)
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [scanningQr, setScanningQr] = useState(false)
  const [isEditingAmount, setIsEditingAmount] = useState(false)
  const [editAmount, setEditAmount] = useState('')
  const [updatingAmount, setUpdatingAmount] = useState(false)

  const pushToast = (message: string, type: 'success' | 'error' | 'info' = 'info', timeout = 4000) => {
    setToast({ message, type })
    if (timeout) {
      setTimeout(() => setToast((prev) => (prev?.message === message ? null : prev)), timeout)
    }
  }
  const [selectedBookmaker, setSelectedBookmaker] = useState<string | null>(null)
  const [updatingBookmaker, setUpdatingBookmaker] = useState(false)
  const isMountedRef = useRef(true)
  // Кэшируем userId, для которых уже тянули фото профиля, чтобы не спамить запросами
  const fetchedProfilePhotoUserIds = useRef<Set<string>>(new Set())
  const fetchProfilePhotoOnce = async (userId: string) => {
    if (!userId) return
    // Если уже грузили для этого пользователя — повторно не дергаем
    if (fetchedProfilePhotoUserIds.current.has(userId)) return

    try {
      const photoResponse = await fetch(`/api/users/${userId}/profile-photo`)
      const photoData = await photoResponse.json()
      
      if (photoData.success && photoData.data?.photoUrl && isMountedRef.current) {
        setProfilePhotoUrl(photoData.data.photoUrl)
        fetchedProfilePhotoUserIds.current.add(userId)
      }
    } catch (error) {
      console.error('Failed to fetch profile photo:', error)
    }
  }

  // Список казино
  const CASINOS = [
    { id: '1xbet', name: '1xBet' },
    { id: 'melbet', name: 'Melbet' },
    { id: '1win', name: '1win' },
    { id: 'mostbet', name: 'mostbet' },
    { id: 'winwin', name: 'Winwin' },
    { id: '888starz', name: '888starz' },
    { id: '1xcasino', name: '1xCasino' },
    { id: 'betwinner', name: 'BetWinner' },
    { id: 'wowbet', name: 'WowBet' },
  ]

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

          console.log('📋 Request detail data:', data)

          if (!isMountedRef.current) return

          if (data.success && isMountedRef.current) {
            const isFirstLoad = !request // Проверяем, это первая загрузка или обновление
            setRequest(data.data)
            
            // Если photoFileUrl отсутствует, пустой или null, пытаемся загрузить через отдельный endpoint
            // Это может быть из-за большого размера фото (> 1MB), которое не включено в основной ответ
            if (!data.data.photoFileUrl || data.data.photoFileUrl.length === 0) {
              // Пытаемся загрузить фото через отдельный endpoint
              fetch(`/api/requests/${requestId}/photo`)
                .then(res => res.json())
                .then(photoData => {
                  if (photoData.success && photoData.data?.photoFileUrl && isMountedRef.current) {
                    setPhotoFileUrl(photoData.data.photoFileUrl)
                    // Обновляем request с загруженным фото
                    setRequest((prev) => prev ? { ...prev, photoFileUrl: photoData.data.photoFileUrl } : prev)
                  }
                })
                .catch(err => {
                  console.warn('Failed to fetch photo separately:', err)
                })
            } else {
              // Если фото есть в основном ответе, используем его
              setPhotoFileUrl(data.data.photoFileUrl)
            }
            
            // Устанавливаем выбранное казино из заявки (или оставляем текущее, если уже было изменено)
            if (selectedBookmaker === null) {
              setSelectedBookmaker(data.data.bookmaker)
            }
            
            // Автоматически заполняем поле поиска ТОЛЬКО один раз при первой загрузке
            if (!searchAmountInitializedRef.current && data.data.requestType === 'deposit' && data.data.amount) {
              const amount = parseFloat(data.data.amount)
              if (!isNaN(amount) && amount > 0) {
                // Заполняем поле поиска только один раз
                setSearchAmount(amount.toString())
                searchAmountInitializedRef.current = true // Помечаем, что сумма установлена
                // Автоматически запускаем поиск поступлений при первой загрузке
                setTimeout(() => {
                  handleSearchPaymentsWithAmount(amount.toString())
                }, 500)
              }
            }
            
            // Загружаем фото профиля пользователя (с кэшем)
            if (data.data.userId) {
              fetchProfilePhotoOnce(data.data.userId)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  // Автоматическая проверка поступлений каждую секунду для pending заявок типа deposit
  useEffect(() => {
    if (!request || request.requestType !== 'deposit' || request.status !== 'pending' || !request.amount || !request.createdAt) {
      return
    }

    const requestId = request.id
    const amount = parseFloat(request.amount.toString())
    const createdAt = new Date(request.createdAt)
    const now = new Date()

    // Проверяем, не прошло ли больше 5 минут после создания заявки
    const fiveMinutesAfter = new Date(createdAt.getTime() + 5 * 60 * 1000)
    if (now > fiveMinutesAfter) {
      // Окно проверки истекло
      return
    }

    // Проверяем поступления каждую секунду
    const checkInterval = setInterval(async () => {
      if (!isMountedRef.current) {
        clearInterval(checkInterval)
        return
      }

      // Проверяем, не прошло ли больше 5 минут после создания заявки
      const currentTime = new Date()
      if (currentTime > fiveMinutesAfter) {
        clearInterval(checkInterval)
        return
      }

      try {
        // Проверяем текущий статус заявки перед проверкой поступления
        const statusResponse = await fetch(`/api/requests/${requestId}`)
        const statusData = await statusResponse.json()
        
        if (statusData.success && statusData.data) {
          // Если заявка уже обработана - останавливаем проверку
          if (statusData.data.status !== 'pending') {
            clearInterval(checkInterval)
            if (isMountedRef.current) {
              setRequest(statusData.data)
            }
            return
          }
        }

        // Вызываем API для проверки и автоматической обработки поступления
        const response = await fetch('/api/auto-deposit/check-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId,
            amount,
            createdAt: createdAt.toISOString(),
          }),
        })

        const data = await response.json()

        if (data.success && data.data?.processed) {
          console.log(`✅ [Auto-Deposit] Payment processed automatically for request ${requestId}`)
          // Заявка обработана, останавливаем проверку
          clearInterval(checkInterval)
          // Обновляем заявку
          const updatedResponse = await fetch(`/api/requests/${requestId}`)
          const updatedData = await updatedResponse.json()
          if (updatedData.success && isMountedRef.current) {
            setRequest(updatedData.data)
          }
        }
      } catch (error) {
        // Игнорируем ошибки проверки, чтобы не прерывать процесс
        console.warn('Auto-deposit check error:', error)
      }
    }, 1000) // Проверка каждую секунду

    return () => {
      clearInterval(checkInterval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.id, request?.status, request?.requestType, request?.amount, request?.createdAt])

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
      const isWithdraw = t.requestType === 'withdraw'
      const userName = t.firstName 
        ? `${t.firstName}${t.lastName ? ' ' + t.lastName : ''}` 
        : t.username 
          ? `@${t.username}` 
          : `ID: ${t.userId}`
      
      // Для выводов не показываем копейки, для депозитов показываем
      return {
        id: t.id,
        amount: isWithdraw
          ? Math.round(Math.abs(amount)).toLocaleString('en-US', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })
          : Math.abs(amount).toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
        isDeposit,
        createdAt: t.createdAt,
        status: t.status,
        userName,
        userId: t.userId,
        bookmaker: t.bookmaker,
        bank: t.bank || null,
        accountId: t.accountId || null,
        description: `${isDeposit ? 'Пополнение' : 'Вывод'} от ${userName}`,
      }
    })
  }, [request])

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    pushToast('Скопировано', 'info')
  }

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '—'
    
    // Парсим ISO строку напрямую, извлекая UTC компоненты
    // Формат: "2026-01-01T10:43:00.000Z" (UTC время, где 10:43 = 16:43 UTC+6 - 6 часов)
    const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/)
    if (match) {
      const [, year, month, day, hour, minute] = match
      
      // Время в БД сохранено как UTC (например, 10:43 для 16:43 КГ)
      // Добавляем 6 часов обратно, чтобы получить время Кыргызстана
      const utcHour = parseInt(hour)
      const utcMinute = parseInt(minute)
      
      // Добавляем 6 часов
      let kyrgyzstanHour = utcHour + 6
      let kyrgyzstanDay = parseInt(day)
      let kyrgyzstanMonth = parseInt(month)
      let kyrgyzstanYear = parseInt(year)
      
      // Обработка перехода через полночь
      if (kyrgyzstanHour >= 24) {
        kyrgyzstanHour -= 24
        kyrgyzstanDay += 1
        // Обработка перехода через месяц (упрощенная версия)
        const daysInMonth = new Date(kyrgyzstanYear, kyrgyzstanMonth, 0).getDate()
        if (kyrgyzstanDay > daysInMonth) {
          kyrgyzstanDay = 1
          kyrgyzstanMonth += 1
          if (kyrgyzstanMonth > 12) {
            kyrgyzstanMonth = 1
            kyrgyzstanYear += 1
          }
        }
      }
      
      const dayStr = kyrgyzstanDay.toString().padStart(2, '0')
      const monthStr = kyrgyzstanMonth.toString().padStart(2, '0')
      const yearStr = kyrgyzstanYear.toString()
      const hoursStr = kyrgyzstanHour.toString().padStart(2, '0')
      const minutesStr = utcMinute.toString().padStart(2, '0')
      return `${dayStr}.${monthStr}.${yearStr} • ${hoursStr}:${minutesStr}`
    }
    
    // Fallback на старый способ, если формат не ISO
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return '—'
    const day = date.getDate().toString().padStart(2, '0')
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const year = date.getFullYear()
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    return `${day}.${month}.${year} • ${hours}:${minutes}`
  }

  // Форматирование времени обработки заявки
  const formatProcessingTime = () => {
    if (!request?.createdAt || !request?.processedAt) return null
    
    // Если автопополнение - всегда показываем 1s
    if (request?.status === 'autodeposit_success' || request?.status === 'auto_completed' || 
        request?.processedBy === 'автопополнение' || request?.processedBy === 'autodeposit') {
      return '1s'
    }
    
    // Вычисляем разницу во времени
    const createdAt = new Date(request.createdAt)
    const processedAt = new Date(request.processedAt)
    const diffMs = processedAt.getTime() - createdAt.getTime()
    
    if (diffMs < 0) return '1s' // Если дата обработки раньше создания, показываем 1s
    
    const diffSeconds = Math.floor(diffMs / 1000)
    const diffMinutes = Math.floor(diffSeconds / 60)
    const diffHours = Math.floor(diffMinutes / 60)
    
    // Если больше часа - показываем в часах
    if (diffHours > 0) {
      return `${diffHours} Hour${diffHours > 1 ? 's' : ''}`
    }
    
    // Если больше минуты - показываем минуты и секунды
    if (diffMinutes > 0) {
      const remainingSeconds = diffSeconds % 60
      if (remainingSeconds > 0) {
        return `${diffMinutes} Minute${diffMinutes > 1 ? 's' : ''} ${remainingSeconds}s`
      }
      return `${diffMinutes} Minute${diffMinutes > 1 ? 's' : ''}`
    }
    
    // Меньше минуты - показываем секунды
    return `${diffSeconds}s`
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

  const getStatusLabel = (status: string, requestData?: RequestDetail | null) => {
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
      case 'api_error':
        // Для api_error показываем ошибку из statusDetail или casinoError
        return requestData?.statusDetail || requestData?.casinoError || 'Ошибка API'
      default:
        // Для неизвестного статуса показываем ошибку, если она есть
        if (requestData?.casinoError) {
          return requestData.casinoError.length > 50 ? requestData.casinoError.substring(0, 50) + '...' : requestData.casinoError
        }
        if (requestData?.statusDetail) {
          return requestData.statusDetail.length > 50 ? requestData.statusDetail.substring(0, 50) + '...' : requestData.statusDetail
        }
        return status || 'Неизвестно'
    }
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
    
    return defaultBank
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
        setShowMenu(false)
        
        // Полная перезагрузка данных заявки, чтобы получить все поля
          const requestId = Array.isArray(params.id) ? params.id[0] : params.id
          if (requestId) {
            const fullDataResponse = await fetch(`/api/requests/${requestId}`)
            const fullData = await fullDataResponse.json()
            
            if (fullData.success && isMountedRef.current) {
              setRequest(fullData.data)
              
              // НЕ устанавливаем сумму - пользователь должен вводить сам
              
              // Загружаем фото профиля пользователя (с кэшем)
              if (fullData.data.userId) {
                fetchProfilePhotoOnce(fullData.data.userId)
              }
            }
          }
        
        // Уведомляем другие вкладки об обновлении
        localStorage.setItem('request_updated', request.id.toString())
        localStorage.removeItem('request_updated') // Триггерим storage event
        
        pushToast('Заявка отложена', 'success')
      } else {
        pushToast(data.error || 'Ошибка при откладывании заявки', 'error')
      }
    } catch (error) {
      console.error('Failed to defer request:', error)
      pushToast('Ошибка при откладывании заявки', 'error')
    } finally {
      setDeferring(false)
    }
  }

    // Функция для обновления статуса заявки (подтвердить/отклонить)
    const updateRequestStatus = async (newStatus: 'completed' | 'approved' | 'rejected') => {
      if (!request) return
      
      try {
        // Если подтверждаем депозит, сначала пополняем баланс через API казино
        // Используем выбранное казино из выпадающего списка (если было изменено) или текущее из заявки
        // selectedBookmaker содержит актуальное значение из выпадающего списка
        const bookmakerToUse = (selectedBookmaker !== null && selectedBookmaker !== '') 
          ? selectedBookmaker 
          : request.bookmaker
        
        if ((newStatus === 'completed' || newStatus === 'approved') && request.requestType === 'deposit' && bookmakerToUse && request.accountId && request.amount) {
          try {
            const depositResponse = await fetch('/api/deposit-balance', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                requestId: request.id,
                bookmaker: bookmakerToUse,
                accountId: request.accountId,
                amount: request.amount,
              }),
            })

            const depositData = await depositResponse.json()

            if (!depositData.success) {
              pushToast(`Ошибка пополнения баланса: ${depositData.error || depositData.message || 'Неизвестная ошибка'}`, 'error')
              return
            }

            // Обновляем статус локально для мгновенного отклика
            if (isMountedRef.current && request) {
              setRequest({
                ...request,
                status: 'approved',
                processedAt: new Date().toISOString(),
              })
            }
            
            // Уведомляем другие вкладки об обновлении
            localStorage.setItem('request_updated', request.id.toString())
            localStorage.removeItem('request_updated')
            
            pushToast(`Баланс пополнен. Заявка подтверждена.`, 'success')
            
            // Загружаем полные данные асинхронно (не блокируем UI)
            const requestId = Array.isArray(params.id) ? params.id[0] : params.id
            if (requestId) {
              fetch(`/api/requests/${requestId}`)
                .then(res => res.json())
                .then(fullData => {
                  if (fullData.success && isMountedRef.current) {
                    setRequest(fullData.data)
                    
                    // Загружаем фото профиля асинхронно
                    if (fullData.data.userId) {
                      fetchProfilePhotoOnce(fullData.data.userId)
                    }
                  }
                })
                .catch(err => console.error('Failed to reload request data:', err))
            }
            
            // Редирект в дашборд после подтверждения
            setTimeout(() => {
              router.push('/dashboard/')
            }, 500) // Уменьшено с 1000 до 500 для более быстрого редиректа
            return
          } catch (depositError) {
            console.error('Failed to deposit balance:', depositError)
            pushToast('Ошибка при пополнении баланса игрока. Заявка не подтверждена.', 'error')
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
          // Обновляем статус локально для мгновенного отклика
          if (isMountedRef.current && request) {
            setRequest({
              ...request,
              status: newStatus,
              processedAt: new Date().toISOString(),
              processedByUsername: data.data?.processedByUsername || null,
            })
          }
          
          // Уведомляем другие вкладки об обновлении
          localStorage.setItem('request_updated', request.id.toString())
          localStorage.removeItem('request_updated') // Триггерим storage event
          
          const statusLabel = newStatus === 'completed' || newStatus === 'approved' ? 'подтверждена' : 'отклонена'
          pushToast(`Заявка ${statusLabel}`, 'success')
          
          // Загружаем полные данные и фото профиля асинхронно (не блокируем UI)
          const requestId = Array.isArray(params.id) ? params.id[0] : params.id
          if (requestId) {
            // Загружаем в фоне, не ждем
            fetch(`/api/requests/${requestId}`)
              .then(res => res.json())
              .then(fullData => {
                if (fullData.success && isMountedRef.current) {
                  setRequest(fullData.data)
                  
                  // Загружаем фото профиля асинхронно
                  if (fullData.data.userId) {
                    fetch(`/api/users/${fullData.data.userId}/profile-photo`)
                      .then(res => res.json())
                      .then(photoData => {
                        if (photoData.success && photoData.data?.photoUrl && isMountedRef.current) {
                          setProfilePhotoUrl(photoData.data.photoUrl)
                        }
                      })
                      .catch(err => console.error('Failed to fetch profile photo:', err))
                  }
                }
              })
              .catch(err => console.error('Failed to reload request data:', err))
          }
          
          // Редирект в дашборд после подтверждения/отклонения
          setTimeout(() => {
            router.push('/dashboard/')
          }, 500) // Уменьшено с 1000 до 500 для более быстрого редиректа
        } else {
          pushToast(data.error || 'Ошибка при обновлении заявки', 'error')
        }
      } catch (error) {
        console.error('Failed to update request status:', error)
        pushToast('Ошибка при обновлении заявки', 'error')
      }
    }

  const handleSearchById = () => {
    if (!searchId.trim()) {
      pushToast('Введите ID заявки', 'error')
      return
    }

    const id = parseInt(searchId.trim())
    if (isNaN(id)) {
      pushToast('ID должен быть числом', 'error')
      return
    }

    router.push(`/dashboard/requests/${id}`)
    setShowSearchModal(false)
    setSearchId('')
  }

  const handleSearchPaymentsWithAmount = async (amountStr?: string) => {
    const amountToSearch = amountStr || searchAmount
    if (!amountToSearch || !amountToSearch.trim()) {
      pushToast('Введите сумму для поиска', 'error')
      return
    }

    // Парсим сумму с поддержкой формата с запятыми (1,000.67)
    // Убираем все запятые (разделители тысяч), оставляем точку для десятичных
    const cleanedAmount = amountToSearch.toString().replace(/,/g, '').trim()
    const amount = parseFloat(cleanedAmount)
    if (isNaN(amount) || amount <= 0) {
      pushToast('Введите корректную сумму', 'error')
      return
    }

    setSearching(true)
    try {
      const params = new URLSearchParams()
      params.append('amount', amount.toString())
      params.append('exactAmount', exactAmount.toString())
      // Отправляем processedOnly только если чекбокс явно установлен (true или false)
      // Если не установлен, не отправляем параметр - показываем все пополнения
      if (processedOnly !== undefined) {
        params.append('processedOnly', processedOnly.toString())
      }
      if (request?.id) {
        params.append('requestId', request.id.toString())
      }

      const response = await fetch(`/api/incoming-payments/search?${params.toString()}`)
      const data = await response.json()

      if (data.success) {
        const incoming = data.data.payments || []
        // ЗАМЕНЯЕМ список полностью, а не объединяем со старым
        // Это гарантирует, что показываются только результаты текущего поиска
        const sortedPayments = [...incoming].sort((a: any, b: any) => {
          const da = new Date(a.paymentDate || a.createdAt || 0).getTime()
          const db = new Date(b.paymentDate || b.createdAt || 0).getTime()
          return db - da
        })
        setSimilarPayments(sortedPayments)
        // Не сбрасываем выбор, если выбранный платеж ещё существует
        const stillExists = selectedPaymentId && incoming.some((p: any) => p.id === selectedPaymentId)
        if (!stillExists) {
          setSelectedPaymentPreview(null)
        }
      } else {
        // Если ошибка поиска — не сбрасываем текущий список/выбор
      }
    } catch (error) {
      console.error('Failed to search payments:', error)
      setSimilarPayments([])
    } finally {
      setSearching(false)
    }
  }

  // УБРАНО: Автоподгрузка поступлений в фоне - теперь поиск выполняется только по кнопке "Найти"
  // Это предотвращает конфликты с ручным поиском пользователя

  const handleSearchPayments = async () => {
    if (!searchAmount.trim()) {
      pushToast('Введите сумму для поиска', 'error')
      return
    }

    await handleSearchPaymentsWithAmount()
  }

  const handleConfirmPayment = async () => {
    if (!request) {
      pushToast('Заявка не найдена', 'error')
      return
    }

    const selectedPayment = selectedPaymentId
      ? similarPayments.find(p => p.id === selectedPaymentId)
      : null

    if (selectedPaymentId && !selectedPayment) {
      pushToast('Выбранное пополнение не найдено', 'error')
      return
    }

    setConfirming(true)
    try {
      // Если подтверждаем депозит, сначала пополняем баланс через API казино
      const bookmakerToUse = (selectedBookmaker !== null && selectedBookmaker !== '') 
        ? selectedBookmaker 
        : request.bookmaker
        
      if (request.requestType === 'deposit' && bookmakerToUse && request.accountId && request.amount) {
        try {
          const depositPayload = {
            requestId: request.id,
            bookmaker: bookmakerToUse,
            accountId: request.accountId,
            amount: request.amount,
          }
          
          const depositResponse = await fetch('/api/deposit-balance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(depositPayload),
          })

          const depositData = await depositResponse.json()

          if (!depositData.success) {
            pushToast(`Ошибка пополнения баланса: ${depositData.error || depositData.message || 'Неизвестная ошибка'}`, 'error')
            setConfirming(false)
            return
          }
        } catch (depositError) {
          console.error('Failed to deposit balance:', depositError)
          pushToast('Ошибка при пополнении баланса игрока. Заявка не подтверждена.', 'error')
          setConfirming(false)
          return
        }
      }
      
      // Обновляем сумму заявки и связываем пополнение с заявкой
      const response = await fetch(`/api/requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: selectedPayment ? selectedPayment.amount : request.amount,
          statusDetail: selectedPayment ? `matched_payment_${selectedPaymentId}` : request.statusDetail,
          status: 'approved',
        }),
      })

      const data = await response.json()

      if (data.success) {
        // Если привязано поступление — помечаем его обработанным
        if (selectedPaymentId) {
        const paymentResponse = await fetch(`/api/incoming-payments/${selectedPaymentId}/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId: request.id,
          }),
        })

        const paymentData = await paymentResponse.json()

          if (!paymentData.success) {
            pushToast('Ошибка при обработке пополнения: ' + (paymentData.error || 'Неизвестная ошибка'), 'error')
          } else {
          // Обновляем список пополнений
          setSimilarPayments(prev => prev.map(p => 
            p.id === selectedPaymentId 
              ? { ...p, isProcessed: true, requestId: request.id }
              : p
          ))
          }
        }

        // Обновляем заявку (в любом случае)
        setRequest(prevRequest => prevRequest ? {
          ...prevRequest,
          amount: selectedPayment ? selectedPayment.amount : prevRequest.amount,
          statusDetail: selectedPayment ? `matched_payment_${selectedPaymentId}` : prevRequest.statusDetail,
          status: 'approved',
          processedAt: new Date().toISOString(),
        } : null)

          setSelectedPaymentId(null)
        setSelectedPaymentPreview(null)
        pushToast('Подтверждено.', 'success')
        
        // Редирект в дашборд после подтверждения
        setTimeout(() => {
          router.push('/dashboard/')
        }, 1000)
        } else {
        pushToast('Ошибка при обновлении заявки: ' + (data.error || 'Неизвестная ошибка'), 'error')
      }
    } catch (error) {
      console.error('Failed to confirm payment:', error)
      pushToast('Ошибка при подтверждении пополнения', 'error')
    } finally {
      setConfirming(false)
    }
  }

  const handleConfirmStatusModal = async () => {
    if (!statusModalAction || !request) return
    setStatusModalLoading(true)
    try {
      await updateRequestStatus(statusModalAction)
      setStatusModalOpen(false)
    } finally {
      setStatusModalLoading(false)
    }
  }

  const handleDeletePayment = async () => {
    if (!paymentToDelete) return
    
    setDeletingPayment(true)
    try {
      const response = await fetch(`/api/incoming-payments/${paymentToDelete}`, {
        method: 'DELETE',
      })
      
      const data = await response.json()
      
      if (data.success) {
        // Удаляем пополнение из списка
        setSimilarPayments(prev => prev.filter(p => p.id !== paymentToDelete))
        // Если это было выбранное пополнение, сбрасываем выбор
        if (selectedPaymentId === paymentToDelete) {
          setSelectedPaymentId(null)
          setSelectedPaymentPreview(null)
        }
        pushToast('Пополнение удалено', 'success')
        setDeletePaymentModalOpen(false)
        setPaymentToDelete(null)
      } else {
        pushToast(data.error || 'Ошибка при удалении пополнения', 'error')
      }
    } catch (error) {
      console.error('Failed to delete payment:', error)
      pushToast('Ошибка при удалении пополнения', 'error')
    } finally {
      setDeletingPayment(false)
    }
  }

  const handleSaveAmount = async () => {
    if (!request) return
    
    const newAmount = parseFloat(editAmount)
    if (isNaN(newAmount) || newAmount <= 0) {
      pushToast('Введите корректную сумму', 'error')
      return
    }
    
    setUpdatingAmount(true)
    try {
      const response = await fetch(`/api/requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: newAmount.toString(),
        }),
      })
      
      const data = await response.json()
      
      if (data.success) {
        // Обновляем локальное состояние
        setRequest(prev => prev ? {
          ...prev,
          amount: newAmount.toString(),
        } : null)
        
        setIsEditingAmount(false)
        setEditAmount('')
        pushToast('Сумма обновлена', 'success')
        
        // Обновляем данные в фоне
        const requestId = Array.isArray(params.id) ? params.id[0] : params.id
        if (requestId) {
          fetch(`/api/requests/${requestId}`)
            .then(res => res.json())
            .then(fullData => {
              if (fullData.success && isMountedRef.current) {
                setRequest(fullData.data)
              }
            })
            .catch(err => console.error('Failed to reload request data:', err))
        }
      } else {
        pushToast(data.error || 'Ошибка при обновлении суммы', 'error')
      }
    } catch (error) {
      console.error('Failed to update amount:', error)
      pushToast('Ошибка при обновлении суммы', 'error')
    } finally {
      setUpdatingAmount(false)
    }
  }

  const handleScanQrFromPhoto = async () => {
    if (!request || !request.photoFileUrl) {
      pushToast('Фото QR-кода не найдено в заявке', 'error')
      return
    }

    setScanningQr(true)
    try {
      // Загружаем jsQR динамически
      const jsQR = (await import('jsqr')).default

      // Используем фото из заявки
      const img = new Image()
      // Если это base64, не нужно crossOrigin
      if (!request.photoFileUrl.startsWith('data:')) {
        img.crossOrigin = 'anonymous'
      }
      img.src = request.photoFileUrl
      
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = () => reject(new Error('Не удалось загрузить изображение'))
        // Таймаут на случай, если изображение не загрузится
        setTimeout(() => reject(new Error('Таймаут загрузки изображения')), 10000)
      })

      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        throw new Error('Failed to get canvas context')
      }
      ctx.drawImage(img, 0, 0)

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const qrCode = jsQR(imageData.data, imageData.width, imageData.height)

      if (!qrCode) {
        pushToast('QR-код не найден на изображении. Убедитесь, что фото содержит QR-код', 'error')
        return
      }

      const qrData = qrCode.data
      console.log('QR Code data:', qrData)

      // Парсим URL и извлекаем hash после #
      let hash = ''
      if (qrData.includes('#')) {
        hash = qrData.split('#')[1]
      } else {
        pushToast('Неверный формат QR-кода. Ожидается URL с символом #', 'error')
        return
      }

      // Формируем ссылку для DemirBank
      const demirBankUrl = `https://retail.demirbank.kg/#${hash}`

      // Сохраняем ссылку в заявку
      const response = await fetch(`/api/requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statusDetail: `payment_url:${demirBankUrl}`,
        }),
      })

      const data = await response.json()

      if (data.success) {
        // Обновляем локальное состояние
        setRequest(prev => prev ? {
          ...prev,
          statusDetail: `payment_url:${demirBankUrl}`,
        } : null)
        
        pushToast('QR-код отсканирован, ссылка сохранена', 'success')
      } else {
        pushToast(data.error || 'Ошибка при сохранении ссылки', 'error')
      }
    } catch (error: any) {
      console.error('Failed to scan QR code:', error)
      pushToast(error.message || 'Ошибка при сканировании QR-кода', 'error')
    } finally {
      setScanningQr(false)
    }
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

    // Форматируем сумму с запятыми для тысяч (50,000.54)
    // Для выводов не показываем копейки, для депозитов показываем
    const formatAmount = (amountStr: string | null, isWithdraw: boolean = false) => {
      if (!amountStr) return isWithdraw ? '0' : '0.00'
      const num = parseFloat(amountStr)
      if (isNaN(num)) return isWithdraw ? '0' : '0.00'
      // Используем английский формат с запятыми для тысяч и точкой для десятичных
      if (isWithdraw) {
        // Для выводов без копеек
        return Math.round(num).toLocaleString('en-US', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })
      } else {
        // Для депозитов с копейками
        return num.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      }
    }
    const isDeposit = request?.requestType === 'deposit'
    const isWithdraw = request?.requestType === 'withdraw'
    const displayAmount = formatAmount(request?.amount, isWithdraw)
    const isDeferred = request?.status === 'deferred'
    // Проверяем, является ли статус успешным (включая автопополнение)
    const isSuccessStatus = request?.status === 'completed' || 
                            request?.status === 'approved' || 
                            request?.status === 'auto_completed' || 
                            request?.status === 'autodeposit_success' ||
                            request?.processedBy === 'автопополнение' ||
                            request?.processedBy === 'autodeposit'
    
    // Определяем тип транзакции для проверки
    const getTransactionTypeForMinus = () => {
      // Для выводов может быть profile-*
      if (request?.requestType === 'withdraw') {
        return request?.status_detail?.match(/profile-\d+/)?.[0] || 'profile-1'
      }
      
      // Для депозитов
      if (request?.requestType === 'deposit') {
        const isRejected = request?.status === 'rejected' || request?.status === 'declined'
        // Авто пополнение - если статус явно указывает на автопополнение и заявка не отклонена
        if (!isRejected && (request?.status === 'autodeposit_success' || request?.status === 'auto_completed' || request?.status_detail?.includes('autodeposit'))) {
          return 'Автопополнение'
        }
        
        // Если админ вручную обработал заявку - показываем его логин
        if (request?.processedByUsername) {
          return request.processedByUsername
        }
        
        // Проверяем наличие profile-* в status_detail
        if (request?.status_detail?.match(/profile-\d+/)) {
          return request.status_detail.match(/profile-(\d+)/)?.[0] || 'profile-1'
        }
        
        // Для всех остальных депозитов показываем profile-1
        return 'profile-1'
      }
      
      return request?.requestType === 'deposit' ? 'Пополнение' : 'Вывод'
    }
    
    const transactionType = getTransactionTypeForMinus()
    // Если отложено и "Авто пополнение", показываем минус
    const showMinus = isDeferred && transactionType === 'Авто пополнение'
    
    const userName = request?.firstName 
      ? `${request.firstName}${request.lastName ? ' ' + request.lastName : ''}` 
      : request?.username 
        ? `@${request.username}` 
        : request ? `ID: ${request.userId}` : ''
    const displayName = request?.firstName || request?.username || (request ? `ID: ${request.userId}` : '')

  const getPaymentMethod = () => {
    if (!request.bank) return null
    const bankLower = request.bank.toLowerCase()
    if (bankLower.includes('crypto') || bankLower.includes('usdt') || bankLower.includes('ton')) {
      return 'Криптовалюта'
    }
    return 'Банковский перевод'
  }

  return (
    <div className="py-4">
      {/* Хедер с навигацией */}
      <div className="flex items-center justify-between mb-4 px-4">
        <div className="flex items-center space-x-3 flex-1">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          <Link
            href={`/dashboard/users/${request.userId}`}
            className="flex items-center space-x-2 hover:opacity-80 transition-opacity"
          >
            {profilePhotoUrl ? (
              <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 border-2 border-gray-600">
                <img
                  src={profilePhotoUrl}
                  alt={displayName}
                  className="w-full h-full object-cover"
                  onError={() => setProfilePhotoUrl(null)}
                />
              </div>
            ) : (
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white text-sm font-bold">{displayName.charAt(0).toUpperCase()}</span>
              </div>
            )}
            <div className="text-left">
              <p className="text-sm font-medium text-white">{displayName || 'ADMIN'}</p>
              {request.username && (
                <p className="text-xs text-gray-400">@{request.username}</p>
              )}
            </div>
          </Link>
        </div>
        
        <div className="flex items-center space-x-2">
          <Link
            href={`/dashboard/users/${request.userId}/chat`}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </Link>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

      {/* Сокращенная основная карточка с ID и суммой */}
      <div className="mx-4 mb-4 bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-4 border border-gray-700 shadow-lg">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <span className="text-lg font-bold text-white">{request.accountId || request.id}</span>
            <button
              onClick={() => copyToClipboard(request.accountId || request.id.toString())}
              className="p-1 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(request.status)}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${
              getStatusLabel(request.status, request) === 'Успешно' ? 'bg-blue-600' :
              getStatusLabel(request.status, request) === 'Отклонено' ? 'bg-red-600' :
              getStatusLabel(request.status, request) === 'Отложено' ? 'bg-orange-600' :
              'bg-yellow-600'
            }`}></div>
            {getStatusLabel(request.status, request)}
          </div>
        </div>

        <p className="text-xs text-gray-400 mb-2">{formatDate(request.createdAt)}</p>

        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {isDeposit ? 'Пополнение' : 'Вывод'}
          </p>
          <div className="flex items-center gap-2">
            {isEditingAmount ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveAmount()
                    } else if (e.key === 'Escape') {
                      setIsEditingAmount(false)
                      setEditAmount('')
                    }
                  }}
                  className="text-xl font-bold bg-gray-700 border border-gray-600 rounded-lg px-2 py-1 w-32 text-right focus:outline-none focus:border-blue-500"
                  autoFocus
                />
                <button
                  onClick={handleSaveAmount}
                  disabled={updatingAmount}
                  className="p-1 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                  title="Сохранить"
                >
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    setIsEditingAmount(false)
                    setEditAmount('')
                  }}
                  disabled={updatingAmount}
                  className="p-1 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                  title="Отмена"
                >
                  <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <>
                <p className={`text-xl font-bold ${showMinus ? 'text-red-500' : (isDeposit ? 'text-green-500' : 'text-red-500')}`}>
                  {showMinus ? '-' : (isDeposit ? '+' : '-')}{displayAmount}
                </p>
                {!isSuccessStatus && (
                  <button
                    onClick={() => {
                      setEditAmount(request.amount || '')
                      setIsEditingAmount(true)
                    }}
                    className="p-1 hover:bg-gray-700 rounded-lg transition-colors"
                    title="Изменить сумму"
                  >
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Фото чека (если есть) */}
      {(request.photoFileUrl || photoFileUrl) && (
        <div className="mx-4 mb-4 bg-gray-800 rounded-2xl p-4 border border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-white">Фото чека</h3>
            <button
              onClick={() => {
                setImageModalOpen(true)
                setImageZoom(1)
                setImagePosition({ x: 0, y: 0 })
              }}
              className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
              </svg>
              Открыть в полном размере
            </button>
          </div>
          <div className="relative w-full flex justify-center">
            <img
              src={
                (request.photoFileUrl || photoFileUrl)?.startsWith('data:image') 
                  ? (request.photoFileUrl || photoFileUrl) || ''
                  : `data:image/jpeg;base64,${request.photoFileUrl || photoFileUrl || ''}`
              }
              alt="Фото чека об оплате"
              className="max-w-full max-h-[500px] rounded-lg border border-gray-600 object-contain cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => {
                setImageModalOpen(true)
                setImageZoom(1)
                setImagePosition({ x: 0, y: 0 })
              }}
              onError={async (e) => {
                // Если фото не загрузилось, пытаемся загрузить через отдельный endpoint
                const target = e.target as HTMLImageElement
                const requestId = Array.isArray(params.id) ? params.id[0] : params.id
                
                if (!photoFileUrl && requestId && !photoLoading) {
                  setPhotoLoading(true)
                  try {
                    const photoResponse = await fetch(`/api/requests/${requestId}/photo`)
                    const photoData = await photoResponse.json()
                    
                    if (photoData.success && photoData.data?.photoFileUrl && isMountedRef.current) {
                      setPhotoFileUrl(photoData.data.photoFileUrl)
                      // Обновляем src изображения
                      target.src = photoData.data.photoFileUrl.startsWith('data:image')
                        ? photoData.data.photoFileUrl
                        : `data:image/jpeg;base64,${photoData.data.photoFileUrl}`
                    } else {
                      // Если фото не найдено, скрываем блок
                      target.style.display = 'none'
                      const parent = target.closest('.bg-gray-800')
                      if (parent) {
                        (parent as HTMLElement).style.display = 'none'
                      }
                    }
                  } catch (err) {
                    console.error('Failed to load photo:', err)
                    // Скрываем блок при ошибке
                    target.style.display = 'none'
                    const parent = target.closest('.bg-gray-800')
                    if (parent) {
                      (parent as HTMLElement).style.display = 'none'
                    }
                  } finally {
                    setPhotoLoading(false)
                  }
                } else {
                  // Если уже пытались загрузить или нет requestId, скрываем блок
                  target.style.display = 'none'
                  const parent = target.closest('.bg-gray-800')
                  if (parent) {
                    (parent as HTMLElement).style.display = 'none'
                  }
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Модальное окно для просмотра фото в полном размере */}
      {imageModalOpen && (request.photoFileUrl || photoFileUrl) && (
        <div 
          className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center p-4"
          onClick={() => {
            setImageModalOpen(false)
            setImageZoom(1)
            setImagePosition({ x: 0, y: 0 })
          }}
        >
          <div 
            className="relative w-full h-full flex items-center justify-center"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Кнопка закрытия */}
            <button
              onClick={() => {
                setImageModalOpen(false)
                setImageZoom(1)
                setImagePosition({ x: 0, y: 0 })
              }}
              className="absolute top-4 right-4 z-10 text-white hover:text-gray-300 bg-gray-800 bg-opacity-50 rounded-full p-2 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Кнопки управления зумом */}
            <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setImageZoom(prev => Math.min(prev + 0.25, 5))
                }}
                className="text-white hover:text-gray-300 bg-gray-800 bg-opacity-50 rounded-full p-2 transition-colors"
                title="Увеличить"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setImageZoom(prev => Math.max(prev - 0.25, 0.5))
                }}
                className="text-white hover:text-gray-300 bg-gray-800 bg-opacity-50 rounded-full p-2 transition-colors"
                title="Уменьшить"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setImageZoom(1)
                  setImagePosition({ x: 0, y: 0 })
                }}
                className="text-white hover:text-gray-300 bg-gray-800 bg-opacity-50 rounded-full p-2 transition-colors"
                title="Сбросить"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>

            {/* Изображение */}
            <div
              className="w-full h-full overflow-hidden flex items-center justify-center"
              onWheel={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const delta = e.deltaY > 0 ? -0.1 : 0.1
                setImageZoom(prev => Math.max(0.5, Math.min(5, prev + delta)))
              }}
              onMouseDown={(e) => {
                if (imageZoom > 1) {
                  e.stopPropagation()
                  setIsDragging(true)
                  setDragStart({ x: e.clientX - imagePosition.x, y: e.clientY - imagePosition.y })
                }
              }}
              onMouseMove={(e) => {
                if (isDragging && imageZoom > 1) {
                  e.stopPropagation()
                  setImagePosition({
                    x: e.clientX - dragStart.x,
                    y: e.clientY - dragStart.y
                  })
                }
              }}
              onMouseUp={() => setIsDragging(false)}
              onMouseLeave={() => setIsDragging(false)}
            >
              <img
                src={
                  (request.photoFileUrl || photoFileUrl)?.startsWith('data:image') 
                    ? (request.photoFileUrl || photoFileUrl) || ''
                    : `data:image/jpeg;base64,${request.photoFileUrl || photoFileUrl || ''}`
                }
                alt="Фото чека об оплате"
                className="max-w-full max-h-full object-contain transition-transform duration-200 select-none"
                style={{
                  transform: `scale(${imageZoom}) translate(${imagePosition.x / imageZoom}px, ${imagePosition.y / imageZoom}px)`,
                  cursor: imageZoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
                }}
                draggable={false}
              />
            </div>
          </div>
        </div>
      )}

      {/* Верхние кнопки подтверждения/отклонения скрыты */}

      {/* Поиск и найденные пополнения — в одном блоке (всегда виден для депозитов) */}
      {request.requestType === 'deposit' && (
        <div className="mx-4 mb-4 bg-gray-800 rounded-2xl p-4 border border-gray-700 space-y-4">
          <div className="flex space-x-2">
              <div className="flex-1 relative">
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Поиск по сумме..."
                  value={searchAmount}
                  onChange={(e) => setSearchAmount(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <button 
                onClick={handleSearchPayments}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
              Найти
              </button>
            </div>
            <div className="flex space-x-4">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exactAmount}
                  onChange={(e) => setExactAmount(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-300">Точная сумма</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={processedOnly === true}
                  onChange={(e) => {
                    // Когда чекбокс включен - показываем только обработанные (true)
                    // Когда выключен - показываем все (undefined, не отправляем параметр)
                    setProcessedOnly(e.target.checked ? true : undefined)
                  }}
                  className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-300">Обработанные</span>
              </label>
          </div>

          <div className="max-h-[340px] overflow-y-auto pr-2 payments-scroll custom-scrollbar" style={{ scrollbarWidth: 'thin', scrollbarColor: '#4B5563 #1F2937' }}>
            {similarPayments.length === 0 ? (
              <p className="text-sm text-gray-500">Ничего не найдено</p>
            ) : (
            <div className="space-y-2">
              {similarPayments.map((payment) => {
                const isSelected = selectedPaymentId === payment.id
                const isProcessed = payment.isProcessed
                
                // Форматируем дату для отображения
                const paymentDate = payment.paymentDate 
                  ? formatDate(payment.paymentDate)
                  : payment.createdAt 
                    ? formatDate(payment.createdAt)
                    : ''

                const formattedAmount = parseFloat(payment.amount).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })

                const handleSelectPayment = () => {
                  // Для обработанных пополнений не делаем ничего при клике на элемент
                  if (isProcessed) {
                    return
                  }
                  // Для необработанных - выбираем/снимаем выбор
                  const nextSelected = isSelected ? null : payment.id
                  setSelectedPaymentId(nextSelected)
                  setSelectedPaymentPreview(nextSelected ? formattedAmount : null)
                }

                const handleArrowClick = (e: React.MouseEvent | React.TouchEvent) => {
                  e.stopPropagation()
                  // Переход к заявке только при клике на стрелку
                  if (isProcessed && payment.requestId) {
                    router.push(`/dashboard/requests/${payment.requestId}`)
                  }
                }


                return (
                  <div
                    key={payment.id}
                    onClick={!isProcessed ? handleSelectPayment : undefined}
                    className={`relative flex items-center rounded-xl p-3 transition-all ${
                      isProcessed
                        ? 'bg-gray-800 opacity-70 border border-gray-700'
                        : isSelected
                        ? 'bg-blue-500 bg-opacity-20 border-2 border-blue-500 cursor-pointer hover:border-blue-600'
                        : 'bg-gray-900 border border-gray-700 cursor-pointer hover:border-green-500'
                    }`}
                  >
                    {/* Левая полоска */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${
                      isProcessed ? 'bg-gray-600' : isSelected ? 'bg-blue-500' : 'bg-green-500'
                    }`}></div>
                    
                    <div className="flex-1 ml-4 min-w-0">
                      <p className="text-sm font-medium text-white mb-1 truncate">
                        Перевод по QR
                      </p>
                      <p className="text-xs text-gray-400">
                        {paymentDate}
                      </p>
                    </div>
                    
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <p className="text-base font-semibold text-green-500 whitespace-nowrap">
                        +{formattedAmount}
                      </p>
                      {isProcessed ? (
                        <button
                          onClick={handleArrowClick}
                          onTouchEnd={handleArrowClick}
                          className="p-1 hover:bg-gray-700 rounded-lg transition-colors cursor-pointer"
                          title="Перейти к заявке"
                        >
                          <svg className="w-5 h-5 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                        </button>
                      ) : (
                        <svg className="w-5 h-5 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            )}
          </div>
          
                </div>
              )}

      {/* Постоянные кнопки подтверждения / отмены выбора (для депозитов) */}
      {/* Показываем кнопки только если заявка не успешна */}
      {request.requestType === 'deposit' && !isSuccessStatus && (
        <div className="mx-4 mb-4 flex space-x-3">
                <button
            onClick={() => {
              setPaymentModalAction('approve')
              setPaymentModalOpen(true)
            }}
                  disabled={confirming}
            className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl transition-colors"
                >
            Подтвердить
                </button>
                <button
                  onClick={() => {
              setPaymentModalAction('reject')
              setPaymentModalOpen(true)
                  }}
                  disabled={confirming}
            className="flex-1 bg-red-500 hover:bg-red-600 disabled:bg-gray-700 text-white font-bold py-3 px-4 rounded-xl transition-colors"
                >
            Отклонить
                </button>
            </div>
      )}

      {/* Кнопки для выводов */}
      {/* Показываем кнопки только если заявка не успешна */}
      {request.requestType === 'withdraw' && !isSuccessStatus && (
        <>
          {/* Кнопка Оплатить */}
          {(() => {
            // Извлекаем ссылку на оплату из statusDetail
            const paymentUrl = request.statusDetail?.startsWith('payment_url:') 
              ? request.statusDetail.replace('payment_url:', '')
              : null
            
            const handleOpenPayment = (url: string) => {
              // На мобильных устройствах используем window.location.href
              // Это должно открыть приложение через universal links (iOS) или app links (Android)
              // Если приложение не установлено, откроется браузер
              if (/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
                // Мобильное устройство - используем прямой переход
                window.location.href = url
              } else {
                // Десктоп - открываем в новой вкладке
                window.open(url, '_blank')
              }
            }
            
            return paymentUrl ? (
              <div className="mx-4 mb-4">
                <button
                  onClick={() => handleOpenPayment(paymentUrl)}
                  className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-xl transition-colors"
                >
                  Оплатить
                </button>
              </div>
            ) : (
              <div className="mx-4 mb-4">
                <button
                  onClick={handleScanQrFromPhoto}
                  disabled={scanningQr || !request.photoFileUrl}
                  className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl transition-colors"
                >
                  {scanningQr ? 'Сканирование QR-кода...' : 'Оплатить'}
                </button>
                {!request.photoFileUrl && (
                  <p className="text-xs text-gray-400 mt-2 text-center">
                    Фото QR-кода не найдено в заявке
                  </p>
                )}
              </div>
            )
          })()}
          
          {/* Кнопки подтверждения / отклонения */}
          <div className="mx-4 mb-4 flex space-x-3">
            <button
              onClick={() => {
                setStatusModalAction('approved')
                setStatusModalOpen(true)
              }}
              disabled={statusModalLoading}
              className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl transition-colors"
            >
              Подтвердить
            </button>
            <button
              onClick={() => {
                setStatusModalAction('rejected')
                setStatusModalOpen(true)
              }}
              disabled={statusModalLoading}
              className="flex-1 bg-red-500 hover:bg-red-600 disabled:bg-gray-700 text-white font-bold py-3 px-4 rounded-xl transition-colors"
            >
              Отклонить
            </button>
          </div>
        </>
      )}

      {/* Ошибка казино (если есть) */}
      {request.casinoError && (
        <div className="mx-4 mb-4 bg-red-900 bg-opacity-30 rounded-2xl p-4 border border-red-700 relative z-[60]">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 mt-0.5">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-red-400 mb-2">Ошибка казино</h3>
              <p className="text-sm text-red-300 whitespace-pre-wrap break-words">{request.casinoError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Детали заявки */}
      <div className="mx-4 mb-4 bg-gray-800 rounded-2xl p-4 border border-gray-700">
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400">Сайт:</span>
            {request.requestType === 'deposit' && request.status === 'pending' ? (
              <div className="relative">
                <select
                  value={selectedBookmaker !== null ? selectedBookmaker : (request.bookmaker || '')}
                  onChange={async (e) => {
                    const newBookmaker = e.target.value
                    setSelectedBookmaker(newBookmaker)
                    setUpdatingBookmaker(true)
                    try {
                      const response = await fetch(`/api/requests/${request.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          bookmaker: newBookmaker,
                        }),
                      })
                      const data = await response.json()
                      if (data.success) {
                        setRequest({ ...request, bookmaker: newBookmaker })
                      } else {
                        pushToast('Ошибка обновления казино: ' + (data.error || 'Неизвестная ошибка'), 'error')
                        setSelectedBookmaker(request.bookmaker)
                      }
                    } catch (error) {
                      console.error('Error updating bookmaker:', error)
                      pushToast('Ошибка обновления казино', 'error')
                      setSelectedBookmaker(request.bookmaker)
                    } finally {
                      setUpdatingBookmaker(false)
                    }
                  }}
                  disabled={updatingBookmaker}
                  className="text-sm font-medium text-white bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed appearance-none cursor-pointer hover:bg-gray-600 transition-colors"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.5rem center',
                    backgroundSize: '12px',
                  }}
                >
                  <option value="">Выберите казино</option>
                  {CASINOS.map((casino) => (
                    <option key={casino.id} value={casino.id} className="bg-gray-800 text-white">
                      {casino.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <span className="text-sm font-medium text-white">{request.bookmaker || 'N/A'}</span>
            )}
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400">ID заявки:</span>
            <span className="text-sm font-medium text-white">{request.id}</span>
          </div>
          {request.accountId && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">ID счета:</span>
              <span className="text-sm font-medium text-white">{request.accountId}</span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400">Дата создания:</span>
            <span className="text-sm font-medium text-white">{formatDate(request.createdAt)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400">Пользователь:</span>
            <span className="text-sm font-medium text-white">{userName}</span>
          </div>
          {request.userNote && (
            <div className="flex justify-between items-start">
              <span className="text-sm text-gray-400">Заметка:</span>
              <span className="text-sm font-medium text-red-400 text-right max-w-[60%]">{request.userNote}</span>
            </div>
          )}
          {request.bank && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">Банк:</span>
              <span className="text-sm font-medium text-white">{request.bank}</span>
            </div>
          )}
          {getPaymentMethod() && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">Способ оплаты:</span>
              <div className="flex items-center space-x-1">
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                <span className="text-sm font-medium text-white">{getPaymentMethod()}</span>
              </div>
            </div>
          )}
          {request.requestType === 'withdraw' && request.withdrawalCode && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">Код вывода:</span>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-white font-mono">{request.withdrawalCode}</span>
                <button
                  onClick={() => copyToClipboard(request.withdrawalCode || '')}
                  className="p-1 hover:bg-gray-700 rounded-lg transition-colors"
                  title="Копировать код"
                >
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400">Статус:</span>
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getStatusColor(request.status)}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${
                getStatusLabel(request.status, request) === 'Успешно' ? 'bg-blue-600' :
                getStatusLabel(request.status, request) === 'Отклонено' ? 'bg-red-600' :
                getStatusLabel(request.status, request) === 'Отложено' ? 'bg-orange-600' :
                'bg-yellow-600'
              }`}></div>
              {getStatusLabel(request.status, request)}
            </span>
          </div>
        </div>
      </div>

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
                className="block bg-gray-900 rounded-xl p-4 border border-gray-800 hover:border-blue-500 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  {/* Иконка банка */}
                  <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border border-gray-600 bg-gray-900">
                    <img
                      src={getBankImage(transaction.bank)}
                      alt={transaction.bank || 'Bank'}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <p className="text-sm font-medium text-white">{transaction.userName}</p>
                    </div>
                    <p className="text-xs text-gray-400 mb-1">
                      {transaction.accountId ? `ID: ${transaction.accountId}` : transaction.bookmaker || '-'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end space-y-2">
                    <p className="text-xs text-gray-400 whitespace-nowrap">{formatDate(transaction.createdAt)}</p>
                    <p className={`text-lg font-bold ${
                      transaction.isDeposit ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {transaction.isDeposit ? '+' : '-'}{transaction.amount}
                    </p>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap ${
                        transaction.status === 'completed' || transaction.status === 'approved' || transaction.status === 'autodeposit_success'
                          ? 'bg-blue-500 text-white'
                          : transaction.status === 'pending'
                          ? 'bg-yellow-500 text-black'
                          : transaction.status === 'rejected' || transaction.status === 'declined'
                          ? 'bg-red-500 text-white'
                          : transaction.status === 'deferred'
                          ? 'bg-orange-500 text-white'
                          : 'bg-gray-700 text-gray-300'
                      }`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        getStatusLabel(transaction.status) === 'Успешно' ? 'bg-blue-600' :
                        getStatusLabel(transaction.status) === 'Отклонено' ? 'bg-red-600' :
                        getStatusLabel(transaction.status) === 'Отложено' ? 'bg-orange-600' :
                        'bg-yellow-600'
                      }`}></div>
                      {getStatusLabel(transaction.status)}
                    </span>
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

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div
            className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg border ${
              toast.type === 'success'
                ? 'bg-green-900/90 border-green-700 text-green-50'
                : toast.type === 'error'
                ? 'bg-red-900/90 border-red-700 text-red-50'
                : 'bg-gray-900/90 border-gray-700 text-gray-50'
            }`}
          >
            <span className="text-sm leading-5">{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="ml-2 text-xs font-semibold opacity-80 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Модалка подтверждения для кнопок Подтвердить/Отклонить */}
      {paymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-6">
            <h3 className="text-xl font-semibold text-white mb-3">
              {paymentModalAction === 'approve' ? 'Подтвердить заявку' : 'Отклонить заявку'}
            </h3>
            <p className="text-sm text-gray-300 mb-4 leading-relaxed">
              Вы уверены, что хотите{' '}
              <span className={paymentModalAction === 'approve' ? 'text-blue-400 font-semibold' : 'text-red-400 font-semibold'}>
                {paymentModalAction === 'approve' ? 'подтвердить' : 'отклонить'}
              </span>{' '}
              заявку на сумму{' '}
              <span className="font-semibold text-white">
                {selectedPaymentId
                  ? formatAmount((similarPayments.find(p => p.id === selectedPaymentId)?.amount)?.toString() || request.amount, isWithdraw)
                  : displayAmount}
              </span>
              ?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setPaymentModalOpen(false)}
                disabled={confirming}
                className="px-4 py-2 rounded-lg border border-gray-600 text-gray-200 hover:bg-gray-800 disabled:opacity-60"
              >
                Отмена
              </button>
              <button
                onClick={async () => {
                  if (paymentModalAction === 'approve') {
                    await handleConfirmPayment()
                  } else if (paymentModalAction === 'reject') {
                    await updateRequestStatus('rejected')
                  }
                  setPaymentModalOpen(false)
                }}
                disabled={confirming}
                className={`px-5 py-2 rounded-lg font-semibold text-white transition-colors ${
                  paymentModalAction === 'approve'
                    ? 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800'
                    : 'bg-red-600 hover:bg-red-700 disabled:bg-red-800'
                } disabled:cursor-not-allowed`}
              >
                {paymentModalAction === 'approve' ? 'Да, подтвердить' : 'Да, отклонить'}
              </button>
            </div>
          </div>
        </div>
      )}

        {/* Модалка удаления пополнения */}
        {deletePaymentModalOpen && paymentToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-6">
              <h3 className="text-xl font-semibold text-white mb-3">Удалить пополнение?</h3>
              <p className="text-sm text-gray-300 mb-4 leading-relaxed">
                Вы уверены, что хотите удалить это пополнение? Это действие нельзя отменить.
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setDeletePaymentModalOpen(false)
                    setPaymentToDelete(null)
                  }}
                  disabled={deletingPayment}
                  className="px-4 py-2 rounded-lg border border-gray-600 text-gray-200 hover:bg-gray-800 disabled:opacity-60"
                >
                  Нет
                </button>
                <button
                  onClick={handleDeletePayment}
                  disabled={deletingPayment}
                  className="px-5 py-2 rounded-lg font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:cursor-not-allowed transition-colors"
                >
                  {deletingPayment ? 'Удаление...' : 'Да, удалить'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Модалка подтверждения/отклонения */}
        {statusModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-6">
              <h3 className="text-xl font-semibold text-white mb-3">Подтвердить операцию</h3>
              <p className="text-sm text-gray-300 mb-4 leading-relaxed">
                Вы уверены, что хотите{' '}
                <span className={statusModalAction === 'approved' ? 'text-blue-400 font-semibold' : 'text-red-400 font-semibold'}>
                  {statusModalAction === 'approved' ? 'принять' : 'отклонить'}
                </span>{' '}
                заявку на {request?.requestType === 'withdraw' ? 'вывод' : 'операцию'} {displayAmount || ''}{' '}
                для {displayName || 'пользователя'}?
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setStatusModalOpen(false)}
                  disabled={statusModalLoading}
                  className="px-4 py-2 rounded-lg border border-gray-600 text-gray-200 hover:bg-gray-800 disabled:opacity-60"
                >
                  Отмена
                </button>
                <button
                  onClick={handleConfirmStatusModal}
                  disabled={statusModalLoading}
                  className={`px-5 py-2 rounded-lg font-semibold text-white transition-colors ${
                    statusModalAction === 'approved'
                      ? 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800'
                      : 'bg-red-600 hover:bg-red-700 disabled:bg-red-800'
                  } disabled:cursor-not-allowed`}
                >
                  {statusModalLoading
                    ? 'Выполняю...'
                    : statusModalAction === 'approved'
                      ? 'Да, принять'
                      : 'Да, отклонить'}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  )
}
