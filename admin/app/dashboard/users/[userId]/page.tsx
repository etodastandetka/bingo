'use client'
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface UserDetail {
  userId: string
  username: string | null
  firstName: string | null
  lastName: string | null
  language: string
  selectedBookmaker: string | null
  createdAt: string
  isActive?: boolean
  transactions: Array<{
    id: number
    transType: string
    amount: string
    status: string
    status_detail: string | null
    processedByUsername: string | null
    bookmaker: string | null
    bank: string | null
    accountId: string | null
    createdAt: string
  }>
  referralMade: Array<{
    referred: {
      userId: string
      username: string | null
      firstName: string | null
    }
    createdAt: string
  }>
  referralEarnings: Array<{
    amount: string
    commissionAmount: string
    bookmaker: string | null
    status: string
    createdAt: string
  }>
  _count: {
    transactions: number
    referralMade: number
    referralEarnings: number
  }
}

export default function UserDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [user, setUser] = useState<UserDetail | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string>('')
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [isActive, setIsActive] = useState<boolean>(true)
  const [updatingActive, setUpdatingActive] = useState(false)

  useEffect(() => {
    if (params.userId) {
      fetchUser()
      fetchNote()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.userId])

  const fetchUser = async () => {
    try {
      setError(null)
      const [userRes, photoRes] = await Promise.all([
        fetch(`/api/users/${params.userId}`),
        fetch(`/api/users/${params.userId}/profile-photo`)
      ])

      if (!userRes.ok) {
        if (userRes.status === 404) {
          setError('Пользователь не найден')
          setUser(null)
          return
        }
        throw new Error(`HTTP error! status: ${userRes.status}`)
      }

      const userData = await userRes.json().catch(() => ({ success: false, error: 'Ошибка парсинга ответа' }))
      const photoData = await photoRes.json().catch(() => ({ success: false }))

      if (userData.success && userData.data) {
        // Убеждаемся, что transactions всегда массив
        const user = {
          ...userData.data,
          transactions: userData.data.transactions || []
        }
        setUser(user)
        setIsActive(user.isActive !== undefined ? user.isActive : true)
      } else {
        const errorMsg = userData.error || 'Не удалось загрузить данные пользователя'
        setError(errorMsg)
        console.error('Failed to fetch user:', errorMsg)
      }

      if (photoData.success && photoData.data?.photoUrl) {
        setPhotoUrl(photoData.data.photoUrl)
      }
    } catch (error: any) {
      console.error('Failed to fetch user:', error)
      setError(error?.message || 'Ошибка при загрузке данных пользователя')
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleActive = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.checked
    const oldValue = isActive
    setUpdatingActive(true)
    
    // Оптимистично обновляем UI
    setIsActive(newValue)
    if (user) {
      setUser({ ...user, isActive: newValue })
    }
    
    try {
      const response = await fetch(`/api/users/${params.userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: newValue }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json().catch(() => ({ success: false, error: 'Ошибка парсинга ответа' }))

      if (!data.success) {
        // Если ошибка, возвращаем переключатель в исходное состояние
        setIsActive(oldValue)
        if (user) {
          setUser({ ...user, isActive: oldValue })
        }
        alert(data.error || 'Не удалось обновить статус пользователя')
      }
    } catch (error: any) {
      console.error('Failed to update user active status:', error)
      // Возвращаем переключатель в исходное состояние
      setIsActive(oldValue)
      if (user) {
        setUser({ ...user, isActive: oldValue })
      }
      alert(error?.message || 'Ошибка при обновлении статуса пользователя')
    } finally {
      setUpdatingActive(false)
    }
  }

  const fetchNote = async () => {
    try {
      const response = await fetch(`/api/users/${params.userId}/note`)
      if (!response.ok) {
        console.warn('Failed to fetch note:', response.status)
        return
      }
      const data = await response.json().catch(() => ({ success: false }))
      if (data.success) {
        setNote(data.data?.note || '')
      }
    } catch (error) {
      console.error('Failed to fetch note:', error)
    }
  }

  const saveNote = async () => {
    setSavingNote(true)
    try {
      const response = await fetch(`/api/users/${params.userId}/note`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note }),
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json().catch(() => ({ success: false, error: 'Ошибка парсинга ответа' }))
      if (data.success) {
        setIsEditingNote(false)
        alert('Заметка сохранена')
      } else {
        alert(data.error || 'Ошибка при сохранении заметки')
      }
    } catch (error: any) {
      console.error('Failed to save note:', error)
      alert(error?.message || 'Ошибка при сохранении заметки')
    } finally {
      setSavingNote(false)
    }
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

  const getTypeLabel = (type: string) => {
    return type === 'deposit' ? 'Пополнение' : 'Вывод'
  }

  const getTransactionType = (tx: { transType: string; status: string; status_detail: string | null; processedByUsername?: string | null }) => {
    // Если статус "Ожидает", показываем "-"
    if (tx.status === 'pending' || tx.status === 'processing') {
      return '-'
    }
    
    // Для выводов может быть profile-*
    if (tx.transType === 'withdraw') {
      return tx.status_detail?.match(/profile-\d+/)?.[0] || 'profile-1'
    }
    
    // Для депозитов
    if (tx.transType === 'deposit') {
      const isRejected = tx.status === 'rejected' || tx.status === 'declined'
      // Авто пополнение - если статус явно указывает на автопополнение и заявка не отклонена
      if (!isRejected && (tx.status === 'autodeposit_success' || tx.status === 'auto_completed' || tx.status_detail?.includes('autodeposit'))) {
        return 'Автопополнение'
      }
      
      // Если админ вручную обработал заявку - показываем его логин
      if (tx.processedByUsername) {
        return tx.processedByUsername
      }
      
      // Проверяем наличие profile-* в status_detail
      if (tx.status_detail?.match(/profile-\d+/)) {
        return tx.status_detail.match(/profile-(\d+)/)?.[0] || 'profile-1'
      }
      
      // Для всех остальных депозитов показываем profile-1
      return 'profile-1'
    }
    
    return tx.transType === 'deposit' ? 'Пополнение' : 'Вывод'
  }

  const getStatusLabel = (status: string, status_detail: string | null = null) => {
    // Если есть status_detail с profile-*, показываем его вместо статуса
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
        // Если есть status_detail, показываем его
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
        // Для неизвестного статуса возвращаем "Ожидает" вместо "Неизвестно"
        return 'Ожидает'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
      case 'approved':
      case 'auto_completed':
      case 'autodeposit_success':
        return 'bg-blue-500 text-white border border-blue-400'
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

  const getBankImage = (bank: string | null) => {
    // Дефолтная иконка банка, если банк не указан
    const defaultBank = '/images/mbank.png'
    
    if (!bank || bank.trim() === '') return defaultBank
    
    const normalized = bank.toLowerCase().trim()
    
    // Маппинг банков на изображения (проверяем ID банков и различные варианты написания)
    // Сначала проверяем точные совпадения с ID банков
    if (normalized === 'mbank' || normalized === 'm-bank' || normalized.includes('mbank')) {
      return '/images/mbank.png'
    }
    if (normalized === 'omoney' || normalized === 'o!money' || normalized.includes('omoney') || normalized.includes('о деньги') || normalized.includes('o!money')) {
      return '/images/omoney.jpg'
    }
    if (normalized === 'demirbank' || normalized === 'demir' || normalized.includes('demirbank') || normalized.includes('demir')) {
      return '/images/demirbank.jpg'
    }
    if (normalized === 'balance' || normalized === 'balance.kg' || normalized.includes('balance')) {
      return '/images/balance.jpg'
    }
    if (normalized === 'bakai' || normalized.includes('bakai')) {
      return '/images/bakai.jpg'
    }
    if (normalized === 'megapay' || normalized.includes('megapay')) {
      return '/images/megapay.jpg'
    }
    if (normalized === 'optima' || normalized.includes('optima') || normalized.includes('оптима')) {
      return '/images/optima.jpg'
    }
    if (normalized === 'companion' || normalized === 'kompanion' || normalized.includes('companion') || normalized.includes('компаньон')) {
      return '/images/companion.png'
    }
    
    // Если банк указан, но не распознан - возвращаем дефолтную иконку
    return defaultBank
  }

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    // Если изображение не загрузилось, заменяем на дефолтное
    const target = e.target as HTMLImageElement
    try {
      if (target.src && !target.src.includes('/images/mbank.png')) {
      target.src = '/images/mbank.png'
        target.onerror = null // Предотвращаем бесконечный цикл
      }
    } catch (err) {
      console.warn('Error handling image error:', err)
    }
  }

  const handleProfilePhotoError = () => {
    // Если фото профиля не загрузилось, просто скрываем его
    setPhotoUrl(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (!user && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 max-w-md w-full text-center">
          <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-white text-lg font-medium mb-2">
            {error || 'Пользователь не найден'}
          </p>
          <div className="flex gap-3 justify-center mt-6">
        <button
          onClick={() => router.back()}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
        >
          Назад
        </button>
            <button
              onClick={() => {
                setLoading(true)
                setError(null)
                fetchUser()
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Повторить
            </button>
          </div>
        </div>
      </div>
    )
  }

  // В этом месте user гарантированно не null (если был null, мы бы вернулись выше)
  if (!user) {
    return null // Это не должно произойти, но для TypeScript
  }

  const displayName = user.firstName || user.username || `ID: ${user.userId}`
  const displayUsername = user.username ? `@${user.username}` : null
  
  // Статистика по пополнениям и выводам
  const transactions = user.transactions || []
  const deposits = transactions.filter(t => t.transType === 'deposit')
  const withdrawals = transactions.filter(t => t.transType === 'withdraw')
  const totalDeposits = deposits.reduce((sum, t) => {
    const amount = parseFloat(t.amount || '0')
    return isNaN(amount) ? sum : sum + amount
  }, 0)
  const totalWithdrawals = withdrawals.reduce((sum, t) => {
    const amount = parseFloat(t.amount || '0')
    return isNaN(amount) ? sum : sum + amount
  }, 0)

  return (
    <div className="py-4">
      {/* Хедер */}
      <div className="flex items-center justify-between mb-4 px-4">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-gray-900 rounded-lg transition-colors"
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 text-center">
          <h1 className="text-xl font-bold text-white">Профиль</h1>
        </div>
        <Link
          href={`/dashboard/users/${user.userId}/chat`}
          className="relative p-2 hover:bg-gray-900 rounded-lg transition-colors"
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </Link>
      </div>

      {/* Карточка пользователя */}
      <div className="mx-4 mb-4 bg-gray-900 rounded-2xl p-6 border border-gray-800">
        <div className="flex items-center space-x-4 mb-4">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={displayName}
              className="w-16 h-16 rounded-full object-cover border-2 border-blue-500"
              onError={handleProfilePhotoError}
              loading="lazy"
            />
          ) : (
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center border-2 border-blue-500">
              <span className="text-white text-2xl font-bold">{displayName.charAt(0).toUpperCase()}</span>
            </div>
          )}
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white mb-1">{displayName}</h2>
            {displayUsername && (
              <p className="text-sm text-gray-400 mb-1">{displayUsername}</p>
            )}
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span className="text-xs text-blue-500 font-medium">Активен</span>
            </div>
          </div>
        </div>

        {/* Статистика */}
        <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-gray-700">
          <div>
            <p className="text-xs text-gray-400 mb-1">Пополнений</p>
            <p className="text-sm font-semibold text-white">
              {deposits.length} / {totalDeposits.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Выводов</p>
            <p className="text-sm font-semibold text-white">
              {withdrawals.length} / {totalWithdrawals.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Заметка */}
      <div className="mx-4 mb-4 bg-gray-900 rounded-2xl p-4 border border-gray-800">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-white">Заметка</h3>
          {!isEditingNote ? (
            <button 
              onClick={() => setIsEditingNote(true)}
              className="p-1 hover:bg-gray-800 rounded transition-colors"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          ) : (
            <div className="flex items-center space-x-2">
              <button
                onClick={saveNote}
                disabled={savingNote}
                className="p-1 hover:bg-gray-800 rounded transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </button>
              <button
                onClick={() => {
                  setIsEditingNote(false)
                  fetchNote() // Восстанавливаем исходное значение
                }}
                className="p-1 hover:bg-gray-800 rounded transition-colors"
              >
                <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>
        {isEditingNote ? (
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Введите заметку о пользователе..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            rows={3}
          />
        ) : (
          <p className="text-xs text-gray-400">
            {note ? (
              <span className="text-red-300">{note}</span>
            ) : (
              'Нажмите на иконку редактирования, чтобы добавить заметку о пользователе'
            )}
          </p>
        )}
      </div>

      {/* Статус безопасности */}
      <div className="mx-4 mb-4 bg-gray-900 rounded-2xl p-4 border border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-white">{isActive ? 'Активен' : 'Заблокирован'}</p>
              <p className="text-xs text-gray-400">{isActive ? 'Все операции доступны' : 'Все операции заблокированы'}</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={handleToggleActive}
              disabled={updatingActive}
              className="sr-only peer"
            />
            <div className={`w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500 ${updatingActive ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
          </label>
        </div>
      </div>

      {/* Список транзакций */}
      <div className="mx-4">
        <h3 className="text-lg font-semibold text-white mb-3">Транзакции</h3>
        {transactions.length > 0 ? (
          <div className="space-y-2">
            {transactions.slice(0, 10).map((tx) => (
              <div
                key={tx.id}
                onClick={() => router.push(`/dashboard/requests/${tx.id}`)}
                className="bg-gray-900 rounded-xl p-4 border border-gray-800 hover:border-blue-500 transition-colors cursor-pointer"
              >
                <div className="flex items-center space-x-3">
                  {/* Иконка банка */}
                  <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border border-gray-600 bg-gray-900">
                    <img
                      src={getBankImage(tx.bank)}
                      alt={tx.bank || 'Bank'}
                      className="w-full h-full object-cover"
                      onError={handleImageError}
                      loading="lazy"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <p className="text-sm font-medium text-white">{displayName}</p>
                    </div>
                    <p className="text-xs text-gray-400 mb-1">
                      {tx.accountId ? `ID: ${tx.accountId}` : tx.bookmaker || '-'}
                    </p>
                    {(() => {
                      const transactionType = getTransactionType(tx)
                      return transactionType !== '-' && (
                        <span className="inline-block px-2 py-0.5 text-xs font-medium bg-blue-500 bg-opacity-20 text-blue-300 rounded-md mb-1 border border-blue-500 border-opacity-30">
                          {transactionType}
                        </span>
                      )
                    })()}
                  </div>
                  <div className="flex flex-col items-end space-y-2">
                    <p className="text-xs text-gray-400 whitespace-nowrap">{formatDate(tx.createdAt)}</p>
                    <p className={`text-lg font-bold ${
                      tx.transType === 'deposit' ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {tx.transType === 'deposit' ? '+' : '-'}{parseFloat(tx.amount || '0').toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap ${getStatusColor(tx.status)}`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        getStatusLabel(tx.status, tx.status_detail) === 'Успешно' ? 'bg-blue-600' :
                        getStatusLabel(tx.status, tx.status_detail) === 'Отклонено' ? 'bg-red-600' :
                        getStatusLabel(tx.status, tx.status_detail) === 'Отложено' ? 'bg-orange-600' :
                        'bg-yellow-600'
                      }`}></div>
                      {getStatusLabel(tx.status, tx.status_detail)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 text-center">
            <p className="text-gray-400">Нет транзакций</p>
          </div>
        )}
      </div>
    </div>
  )
}
