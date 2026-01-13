'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'

interface User {
  id: number
  username: string
  email: string | null
  isSuperAdmin: boolean
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [unreadChatsCount, setUnreadChatsCount] = useState(0)

  useEffect(() => {
    fetchUser()
    fetchUnreadChats()
    // Обновляем счетчик каждые 15 секунд (увеличено для снижения нагрузки)
    const interval = setInterval(() => {
      fetchUnreadChats()
    }, 15000)
    return () => clearInterval(interval)
    // Мы намеренно не добавляем fetchUser/fetchUnreadChats в зависимости,
    // чтобы не пересоздавать интервал и не дергать авторизацию лишний раз
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchUnreadChats = async () => {
    try {
      const response = await fetch('/api/operator-chats?status=open')
      const data = await response.json()
      if (data.success) {
        setUnreadChatsCount(data.data.totalUnread || 0)
      }
    } catch (error) {
      // Игнорируем ошибки при получении счетчика
    }
  }

  const fetchUser = async () => {
    try {
      const response = await fetch('/api/auth/me')
      const data = await response.json()

      if (data.success && data.data) {
        setUser(data.data)
      } else {
        router.push('/login')
      }
    } catch (error) {
      router.push('/login')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      // Очищаем все данные перед выходом
      const response = await fetch('/api/auth/logout', { 
        method: 'POST',
        credentials: 'include'
      })
      
      // Убеждаемся, что запрос выполнен
      if (response.ok || response.status === 200) {
        // Очищаем localStorage и sessionStorage
        if (typeof window !== 'undefined') {
          localStorage.clear()
          sessionStorage.clear()
        }
        
        // Перенаправляем на страницу логина
        window.location.href = '/login'
      } else {
        // Даже если запрос не удался, все равно перенаправляем
        if (typeof window !== 'undefined') {
          localStorage.clear()
          sessionStorage.clear()
          window.location.href = '/login'
        }
      }
    } catch (error) {
      console.error('Logout error:', error)
      // В случае ошибки все равно перенаправляем на логин
      if (typeof window !== 'undefined') {
        localStorage.clear()
        sessionStorage.clear()
        window.location.href = '/login'
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Загрузка...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  const bottomNavItems: Array<{
    href: string
    label: string
    icon: React.ReactNode
    badge?: number | null
  }> = [
    { 
      href: '/dashboard', 
      label: 'ГЛАВНАЯ', 
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      )
    },
    { 
      href: '/dashboard/history', 
      label: 'ИСТОРИЯ', 
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.9 1.57h1.52c0-1.5-1.08-2.86-3.42-2.86-2.07 0-3.62 1.17-3.62 3.06 0 1.92 1.47 2.71 3.29 3.16 1.95.47 2.33 1.11 2.33 1.8 0 .8-.63 1.5-1.95 1.5-1.64 0-2.17-.68-2.17-1.55H8.04c0 1.63 1.18 2.77 3.94 2.77 2.23 0 3.88-1.14 3.88-3.19 0-2.06-1.51-2.78-3.55-3.19z"/>
        </svg>
      )
    },
    { 
      href: '/dashboard/settings', 
      label: 'НАСТРОЙКИ', 
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    },
    { 
      href: '/dashboard/operator-chats', 
      label: 'ЧАТ', 
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
      badge: unreadChatsCount > 0 ? unreadChatsCount : null,
    },
    { 
      href: '/dashboard/menu', 
      label: 'МЕНЮ', 
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      )
    },
  ]

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard' || pathname === '/'
    }
    return pathname.startsWith(href)
  }

  // Скрываем нижнее меню только на странице конкретного чата (не на списке чатов)
  const isChatPage = pathname?.includes('/chat') && !pathname?.includes('/operator-chats')

  return (
    <div className="h-screen bg-gradient-to-b from-slate-950 to-slate-900 flex justify-center items-center overflow-hidden">
      <div className="mobile-container w-full max-w-[414px] h-full">
        {/* Основной контент */}
        <main className={`px-4 py-4 bg-transparent overflow-y-auto h-full ${isChatPage ? 'pb-4' : 'pb-20'}`}>
          {children}
        </main>

        {/* Нижнее меню навигации */}
        {!isChatPage && (
        <nav className="fixed bottom-0 left-1/2 transform -translate-x-1/2 w-full max-w-[414px] bg-gray-900 border-t border-gray-800 rounded-t-3xl z-50 shadow-2xl">
          <div className="flex justify-around items-center py-2 px-2">
            {bottomNavItems.map((item) => {
              const active = isActive(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center justify-center px-2 py-2 rounded-xl transition-all duration-200 relative ${
                    active
                      ? 'text-blue-500 bg-blue-500 bg-opacity-20'
                      : 'text-gray-400'
                  }`}
                >
                  <div className={`mb-1 relative ${active ? 'transform scale-110' : ''}`}>
                    {item.icon}
                    {item.badge && item.badge > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                        {item.badge > 9 ? '9+' : item.badge}
                      </span>
                    )}
                  </div>
                  <span className={`text-[9px] font-medium uppercase tracking-wider ${
                    active ? 'text-blue-500' : 'text-gray-400'
                  }`}>
                    {item.label}
                  </span>
                  {active && (
                    <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                  )}
                </Link>
              )
            })}
          </div>
        </nav>
        )}
      </div>
    </div>
  )
}

