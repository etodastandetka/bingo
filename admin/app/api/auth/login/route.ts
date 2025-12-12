import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser } from '@/lib/auth'
import { createApiResponse } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'

// Функция для определения устройства из User-Agent
function getDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown'
  
  const ua = userAgent.toLowerCase()
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    return 'Mobile'
  }
  if (ua.includes('tablet') || ua.includes('ipad')) {
    return 'Tablet'
  }
  return 'Desktop'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, password } = body

    if (!username || !password) {
      return NextResponse.json(
        createApiResponse(null, 'Username and password are required'),
        { status: 400 }
      )
    }

    const result = await authenticateUser(username, password)

    if (!result) {
      return NextResponse.json(
        createApiResponse(null, 'Invalid credentials'),
        { status: 401 }
      )
    }

    // Логируем вход
    try {
      const ipAddress = request.headers.get('x-forwarded-for') || 
                       request.headers.get('x-real-ip') || 
                       request.ip ||
                       'unknown'
      const userAgent = request.headers.get('user-agent') || null
      const device = getDevice(userAgent)

      console.log('📝 Logging login history:', {
        userId: result.user.id,
        username: result.user.username,
        ipAddress: ipAddress.split(',')[0].trim(),
        device: device,
      })

      // Логируем вход (используем модель или SQL)
      try {
        if ((prisma as any).adminLoginHistory) {
          await (prisma as any).adminLoginHistory.create({
            data: {
              userId: result.user.id,
              username: result.user.username,
              ipAddress: ipAddress.split(',')[0].trim(), // Берем первый IP если их несколько
              userAgent: userAgent,
              device: device,
            },
          })
        } else {
          // Используем прямой SQL запрос
          await prisma.$executeRaw`
            INSERT INTO admin_login_history (user_id, username, ip_address, user_agent, device, created_at)
            VALUES (${result.user.id}, ${result.user.username}, ${ipAddress.split(',')[0].trim()}, ${userAgent}, ${device}, NOW())
          `
        }
        
        console.log('✅ Login history logged successfully')
      } catch (sqlError: any) {
        // Если таблица не существует, просто логируем предупреждение
        if (sqlError.code === '42P01' || sqlError.message?.includes('does not exist') || sqlError.message?.includes('relation')) {
          console.warn('⚠️ Login history table does not exist. Please create it using SQL from prisma/migrations/create_login_history.sql')
        } else {
          throw sqlError
        }
      }
      
      console.log('✅ Login history logged successfully')
    } catch (logError: any) {
      // Не прерываем процесс входа, если логирование не удалось
      console.error('❌ Failed to log login history:', {
        error: logError.message,
        stack: logError.stack,
        code: logError.code,
      })
    }

    const response = NextResponse.json(
      createApiResponse({ user: result.user, message: 'Login successful' })
    )

    response.cookies.set('auth_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    })

    return response
  } catch (error: any) {
    return NextResponse.json(
      createApiResponse(null, error.message || 'Login failed'),
      { status: 500 }
    )
  }
}

