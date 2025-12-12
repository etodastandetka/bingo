'use client'

import { useEffect, useState, useRef } from 'react'

interface Wallet {
  id: number
  name: string | null
  value: string | null
  email: string | null
  password: string | null
  bank: string | null
  hash: string | null
  isActive: boolean
}

export default function WalletPage() {
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Wallet | null>(null)
  const selectRef = useRef<HTMLSelectElement>(null)
  const [formData, setFormData] = useState({
    name: '',
    value: '',
    email: '',
    password: '',
    bank: '',
    hash: '',
    isActive: false,
  })

  useEffect(() => {
    fetchWallets()
  }, [])

  const fetchWallets = async () => {
    try {
      const response = await fetch('/api/requisites')
      const data = await response.json()

      if (data.success) {
        setWallets(data.data || [])
      }
    } catch (error) {
      console.error('Failed to fetch wallets:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Валидация в зависимости от банка
    if (formData.bank === 'Demir Bank') {
      if (!formData.value || !/^\d{16}$/.test(formData.value)) {
        alert('Реквизит должен содержать ровно 16 цифр')
        return
      }
      if (!formData.email) {
        alert('Почта обязательна для Demir Bank')
        return
      }
      if (!editing && !formData.password) {
        alert('Пароль обязателен для Demir Bank')
        return
      }
    } else if (formData.bank === 'Bakai') {
      if (!formData.hash) {
        alert('Hash обязателен для Bakai')
        return
      }
      if (!formData.name) {
        alert('Название обязательно для Bakai')
        return
      }
    } else {
      alert('Выберите банк')
      return
    }

    try {
      if (editing) {
        // Редактирование
        const response = await fetch(`/api/requisites/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        })

        const data = await response.json()
        if (!data.success) {
          alert(data.error || 'Ошибка при обновлении кошелька')
          return
        }
      } else {
        // Создание
        const response = await fetch('/api/requisites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        })

        const data = await response.json()
        if (!data.success) {
          alert(data.error || 'Ошибка при создании кошелька')
          return
        }
      }

      setShowModal(false)
      setEditing(null)
      setFormData({
        name: '',
        value: '',
        email: '',
        password: '',
        bank: '',
        hash: '',
        isActive: false,
      })
      fetchWallets()
    } catch (error) {
      console.error('Failed to save wallet:', error)
      alert('Ошибка при сохранении кошелька')
    }
  }

  const handleEdit = (wallet: Wallet) => {
    setEditing(wallet)
    setFormData({
      name: wallet.name || '',
      value: wallet.value || '',
      email: wallet.email || '',
      password: '', // Не показываем пароль при редактировании
      bank: wallet.bank || '',
      hash: wallet.hash || '',
      isActive: wallet.isActive,
    })
    setShowModal(true)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Вы уверены, что хотите удалить этот кошелек?')) return

    try {
      const response = await fetch(`/api/requisites/${id}`, { method: 'DELETE' })
      const data = await response.json()

      if (data.success) {
        fetchWallets()
      } else {
        alert(data.error || 'Ошибка при удалении кошелька')
      }
    } catch (error) {
      console.error('Failed to delete wallet:', error)
      alert('Ошибка при удалении кошелька')
    }
  }

  const handleAddNew = () => {
    setEditing(null)
    setFormData({
      name: '',
      value: '',
      email: '',
      password: '',
      bank: '',
      hash: '',
      isActive: false,
    })
    setShowModal(true)
  }

  const handleSetActive = async (id: number): Promise<boolean> => {
    const wallet = wallets.find(w => w.id === id)
    if (!wallet) return false

    if (!confirm(`Сделать этот кошелек активным? Все остальные будут отключены.`)) {
      return false
    }

    try {
      // Сначала деактивируем все кошельки
      await Promise.all(
        wallets.map(w => 
          w.isActive && w.id !== id
            ? fetch(`/api/requisites/${w.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: false }),
              })
            : Promise.resolve()
        )
      )

      // Активируем выбранный кошелек
      const response = await fetch(`/api/requisites/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      })

      const data = await response.json()
      if (data.success) {
        alert('Активный кошелек изменен!')
        fetchWallets()
        return true
      } else {
        alert(data.error || 'Ошибка при активации кошелька')
        return false
      }
    } catch (error) {
      console.error('Failed to set active wallet:', error)
      alert('Ошибка при активации кошелька')
      return false
    }
  }

  const activeWallet = wallets.find(w => w.isActive)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="py-4">
      <div className="flex items-center justify-between mb-4">
        <div className="w-10"></div>
        <div className="flex-1 text-center">
          <h1 className="text-xl font-bold text-white">Кошелек</h1>
        </div>
        <button
          onClick={handleAddNew}
          className="p-2 bg-blue-500 rounded-lg hover:bg-blue-600"
        >
          <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Выбор активного кошелька */}
      {wallets.length > 0 && (
        <div className="mb-4 bg-gray-800 bg-opacity-50 rounded-xl p-4 border border-gray-700 backdrop-blur-sm">
          <label className="block text-sm font-medium text-white mb-2">
            Активный кошелек
          </label>
          <select
            ref={selectRef}
            value={activeWallet?.id || ''}
            onChange={async (e) => {
              const id = parseInt(e.target.value)
              if (id) {
                const success = await handleSetActive(id)
                // Сбрасываем выбор если пользователь отменил или произошла ошибка
                if (!success && selectRef.current) {
                  selectRef.current.value = activeWallet?.id?.toString() || ''
                }
              }
            }}
            className="w-full bg-gray-900 text-white border border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
            style={{
              backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6,9 12,15 18,9'%3e%3c/polyline%3e%3c/svg%3e")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              backgroundSize: '16px',
              paddingRight: '40px'
            }}
          >
            <option value="">Выберите активный кошелек</option>
            {wallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.name || `Кошелек #${wallet.id}`} - {wallet.bank || 'Без банка'} {wallet.isActive ? '(Активен)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {wallets.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="mb-4">Кошельки не найдены</p>
          <button
            onClick={handleAddNew}
            className="bg-blue-500 text-white px-6 py-3 rounded-xl hover:bg-blue-600 font-medium"
          >
            Добавить кошелек
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {wallets.map((wallet) => (
            <div
              key={wallet.id}
              className={`bg-gray-800 bg-opacity-50 rounded-xl p-4 border-2 backdrop-blur-sm ${
                wallet.isActive ? 'border-blue-500' : 'border-gray-700'
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-white mb-2">
                    {wallet.name || `Кошелек #${wallet.id}`}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {wallet.isActive && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500 text-white">
                        Активен
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleEdit(wallet)}
                    className="p-2 bg-blue-500 rounded-lg hover:bg-blue-600"
                  >
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(wallet.id)}
                    className="p-2 bg-red-500 rounded-lg hover:bg-red-600"
                  >
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="space-y-2 mt-3">
                {wallet.bank && (
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">
                      Банк
                    </label>
                    <div className="bg-gray-900 p-2 rounded-lg border border-gray-700">
                      <p className="text-sm text-white">{wallet.bank}</p>
                    </div>
                  </div>
                )}
                {wallet.bank === 'Demir Bank' && wallet.value && (
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">
                      Реквизит (16 цифр)
                    </label>
                    <div className="bg-gray-900 p-2 rounded-lg border border-gray-700">
                      <p className="text-sm text-white font-mono">{wallet.value}</p>
                    </div>
                  </div>
                )}
                {wallet.bank === 'Bakai' && wallet.hash && (
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">
                      Hash
                    </label>
                    <div className="bg-gray-900 p-2 rounded-lg border border-gray-700">
                      <p className="text-sm text-white font-mono break-all">{wallet.hash}</p>
                    </div>
                  </div>
                )}
                {wallet.email && (
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">
                      Почта
                    </label>
                    <div className="bg-gray-900 p-2 rounded-lg border border-gray-700">
                      <p className="text-sm text-white">{wallet.email}</p>
                    </div>
                  </div>
                )}
                {wallet.password && (
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">
                      Пароль
                    </label>
                    <div className="bg-gray-900 p-2 rounded-lg border border-gray-700">
                      <p className="text-sm text-white font-mono">••••••••</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Модальное окно для добавления/редактирования */}
      {showModal && (
        <div className="fixed z-50 inset-0 overflow-y-auto flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="relative bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">
              {editing ? 'Редактировать кошелек' : 'Добавить кошелек'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Название {formData.bank === 'Bakai' && '*'}
                </label>
                <input
                  type="text"
                  required={formData.bank === 'Bakai'}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-gray-900 text-white border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Название кошелька"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Банк *
                </label>
                <select
                  value={formData.bank}
                  onChange={(e) => {
                    const bank = e.target.value
                    setFormData({
                      ...formData,
                      bank,
                      // Очищаем поля при смене банка
                      value: bank === 'Demir Bank' ? formData.value : '',
                      email: bank === 'Demir Bank' ? formData.email : '',
                      password: bank === 'Demir Bank' ? formData.password : '',
                      hash: bank === 'Bakai' ? formData.hash : '',
                    })
                  }}
                  className="w-full bg-gray-900 text-white border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                  required
                  style={{
                    backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6,9 12,15 18,9'%3e%3c/polyline%3e%3c/svg%3e")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 12px center',
                    backgroundSize: '16px',
                    paddingRight: '40px'
                  }}
                >
                  <option value="">Выберите банк</option>
                  <option value="Demir Bank">Demir Bank</option>
                  <option value="Bakai">Bakai</option>
                </select>
              </div>

              {formData.bank === 'Demir Bank' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Реквизит (16 цифр) *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.value}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '').slice(0, 16)
                        setFormData({ ...formData, value })
                      }}
                      className="w-full bg-gray-900 text-white border border-gray-700 rounded-xl px-4 py-3 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="1234567890123456"
                      maxLength={16}
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      {formData.value.length}/16 цифр
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Почта *
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full bg-gray-900 text-white border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="email@example.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Пароль {editing && '(оставьте пустым, чтобы не менять)'}
                      {!editing && ' *'}
                    </label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full bg-gray-900 text-white border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={editing ? 'Оставьте пустым, чтобы не менять' : 'Пароль'}
                      required={!editing}
                    />
                  </div>
                </>
              )}

              {formData.bank === 'Bakai' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Hash *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.hash}
                    onChange={(e) => setFormData({ ...formData, hash: e.target.value })}
                    className="w-full bg-gray-900 text-white border border-gray-700 rounded-xl px-4 py-3 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Введите hash"
                  />
                </div>
              )}

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 text-blue-500 bg-gray-900 border-gray-700 rounded focus:ring-blue-500"
                />
                <label htmlFor="isActive" className="ml-2 text-sm text-gray-300">
                  Сделать активным
                </label>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false)
                    setEditing(null)
                    setFormData({
                      name: '',
                      value: '',
                      email: '',
                      password: '',
                      bank: '',
                      hash: '',
                      isActive: false,
                    })
                  }}
                  className="flex-1 px-4 py-3 border border-gray-700 text-gray-300 rounded-xl hover:bg-gray-700 font-medium"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 font-medium"
                >
                  {editing ? 'Сохранить' : 'Добавить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}




