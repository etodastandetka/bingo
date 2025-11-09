'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

interface UserDetail {
  userId: string
  username: string | null
  firstName: string | null
  lastName: string | null
  language: string
  selectedBookmaker: string | null
  note: string | null
  isActive: boolean
  createdAt: string
  transactions: Array<{
    id: number
    transType: string
    amount: string
    status: string
    bookmaker: string | null
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
  const [note, setNote] = useState<string>('')
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [savingActive, setSavingActive] = useState(false)

  const fetchUser = useCallback(async () => {
    try {
      const [userRes, photoRes] = await Promise.all([
        fetch(`/api/users/${params.userId}`),
        fetch(`/api/users/${params.userId}/profile-photo`)
      ])

      const userData = await userRes.json()
      const photoData = await photoRes.json()

      if (userData.success) {
        setUser(userData.data)
        setNote(userData.data.note || '')
        setIsActive(userData.data.isActive !== false) // По умолчанию true, если не указано
      }

      if (photoData.success && photoData.data.photoUrl) {
        setPhotoUrl(photoData.data.photoUrl)
      }
    } catch (error) {
      console.error('Failed to fetch user:', error)
    } finally {
      setLoading(false)
    }
  }, [params.userId])

  useEffect(() => {
    if (params.userId) {
      fetchUser()
    }
  }, [params.userId, fetchUser])

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

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
      case 'approved':
        return 'Успешно'
      case 'pending':
        return 'Ожидает'
      case 'rejected':
        return 'Отклонено'
      default:
        return status
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-white text-lg font-medium">Пользователь не найден</p>
        <button
          onClick={() => router.back()}
          className="mt-4 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
        >
          Назад
        </button>
      </div>
    )
  }

  const displayName = user.firstName || user.username || `ID: ${user.userId}`
  const displayUsername = user.username ? `@${user.username}` : null
  
  // Статистика по пополнениям и выводам
  const deposits = user.transactions.filter(t => t.transType === 'deposit')
  const withdrawals = user.transactions.filter(t => t.transType === 'withdraw')
  const totalDeposits = deposits.reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0)
  const totalWithdrawals = withdrawals.reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0)

  return (
    <div className="py-4">
      {/* Хедер */}
      <div className="flex items-center justify-between mb-4 px-4">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
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
          className="relative p-2 hover:bg-gray-800 rounded-lg transition-colors"
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </Link>
      </div>

      {/* Карточка пользователя */}
      <div className="mx-4 mb-4 bg-gray-800 rounded-2xl p-6 border border-gray-700">
        <div className="flex items-center space-x-4 mb-4">
          {photoUrl ? (
            <div className="w-16 h-16 rounded-full overflow-hidden relative flex-shrink-0 border-2 border-blue-500">
              <Image
                src={photoUrl}
                alt={displayName}
                fill
                className="object-cover"
              />
            </div>
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
              <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
              <span className="text-xs text-blue-400 font-medium">Активен</span>
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
      <div className="mx-4 mb-4 bg-gray-800 rounded-2xl p-4 border border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-white">Заметка</h3>
          <button
            onClick={() => setIsEditingNote(!isEditingNote)}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </div>
        {isEditingNote ? (
          <div className="space-y-2">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Введите заметку о пользователе..."
              className="w-full bg-gray-900 text-white rounded-lg p-3 text-sm border border-gray-700 focus:border-blue-500 focus:outline-none resize-none"
              rows={4}
            />
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setSavingNote(true)
                  try {
                    const response = await fetch(`/api/users/${params.userId}/note`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ note: note.trim() || null }),
                    })
                    const data = await response.json()
                    if (data.success) {
                      setIsEditingNote(false)
                      if (user) {
                        setUser({ ...user, note: data.data.note })
                      }
                    } else {
                      alert('Ошибка при сохранении заметки')
                    }
                  } catch (error) {
                    console.error('Failed to save note:', error)
                    alert('Ошибка при сохранении заметки')
                  } finally {
                    setSavingNote(false)
                  }
                }}
                disabled={savingNote}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
              >
                {savingNote ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button
                onClick={() => {
                  setIsEditingNote(false)
                  setNote(user?.note || '')
                }}
                disabled={savingNote}
                className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
              >
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400 whitespace-pre-wrap">
            {note || 'Нажмите на иконку редактирования, чтобы добавить заметку о пользователе'}
          </p>
        )}
      </div>

      {/* Статус безопасности */}
      <div className="mx-4 mb-4 bg-gray-800 rounded-2xl p-4 border border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <svg className={`w-5 h-5 ${isActive ? 'text-blue-400' : 'text-red-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-white">{isActive ? 'Активен' : 'Заблокирован'}</p>
              <p className="text-xs text-gray-400">{isActive ? 'Все операции доступны' : 'Пользователь заблокирован'}</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={async (e) => {
                const newValue = e.target.checked
                setSavingActive(true)
                try {
                  const response = await fetch(`/api/users/${params.userId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ isActive: newValue }),
                  })
                  const data = await response.json()
                  if (data.success) {
                    setIsActive(newValue)
                    if (user) {
                      setUser({ ...user, isActive: newValue })
                    }
                  } else {
                    alert('Ошибка при обновлении статуса')
                    setIsActive(!newValue) // Откатываем изменение
                  }
                } catch (error) {
                  console.error('Failed to update active status:', error)
                  alert('Ошибка при обновлении статуса')
                  setIsActive(!newValue) // Откатываем изменение
                } finally {
                  setSavingActive(false)
                }
              }}
              disabled={savingActive}
              className="sr-only peer"
            />
            <div className={`w-11 h-6 rounded-full peer peer-focus:outline-none transition-colors ${
              isActive ? 'bg-blue-500' : 'bg-gray-700'
            } ${savingActive ? 'opacity-50' : ''}`}>
              <div className={`absolute top-[2px] left-[2px] bg-white rounded-full h-5 w-5 transition-all ${
                isActive ? 'translate-x-full' : ''
              }`}></div>
            </div>
          </label>
        </div>
      </div>

      {/* Список транзакций */}
      <div className="mx-4">
        <h3 className="text-lg font-semibold text-white mb-3">Транзакции</h3>
        {user.transactions.length > 0 ? (
          <div className="space-y-2">
            {user.transactions.slice(0, 10).map((tx) => (
              <div
                key={tx.id}
                className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-blue-500 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                    tx.transType === 'deposit' ? 'bg-purple-600' : 'bg-pink-600'
                  }`}>
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {tx.transType === 'deposit' ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      )}
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <p className="text-sm font-medium text-white">{displayName}</p>
                      <span className="text-xs text-gray-400">ID: {user.userId}</span>
                    </div>
                    {tx.bookmaker && (
                      <span className="inline-block px-2 py-0.5 text-xs font-medium bg-blue-600 text-white rounded mb-1">
                        {tx.transType === 'deposit' ? 'Авто пополнение' : 'profile-6'}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400 mb-1">{formatDate(tx.createdAt)}</p>
                    <p className={`text-lg font-bold ${
                      tx.transType === 'deposit' ? 'text-blue-400' : 'text-red-500'
                    }`}>
                      {tx.transType === 'deposit' ? '+' : '-'}{parseFloat(tx.amount || '0').toFixed(2).replace('.', ',')}
                    </p>
                    <div className="flex items-center space-x-1 mt-1">
                      <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                      <span className="text-xs text-blue-400">{getStatusLabel(tx.status)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 text-center">
            <p className="text-gray-400">Нет транзакций</p>
          </div>
        )}
      </div>
    </div>
  )
}
