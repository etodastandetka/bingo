import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    requireAuth(request)

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const skip = (page - 1) * limit

    // Получаем данные через SQL, если модель недоступна в Prisma Client
    let history: any[] = []
    let total = 0
    
    try {
      // Пробуем использовать модель, если она доступна
      if ((prisma as any).adminLoginHistory) {
        const [historyData, totalCount] = await Promise.all([
          (prisma as any).adminLoginHistory.findMany({
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  email: true,
                },
              },
            },
          }),
          (prisma as any).adminLoginHistory.count(),
        ])
        history = historyData
        total = totalCount
      } else {
        // Используем прямой SQL запрос
        const historyResult = await prisma.$queryRaw<any[]>`
          SELECT 
            alh.id,
            alh.user_id as "userId",
            alh.username,
            alh.ip_address as "ipAddress",
            alh.user_agent as "userAgent",
            alh.device,
            alh.created_at as "createdAt",
            json_build_object(
              'id', au.id,
              'username', au.username,
              'email', au.email
            ) as user
          FROM admin_login_history alh
          LEFT JOIN admin_users au ON alh.user_id = au.id
          ORDER BY alh.created_at DESC
          LIMIT ${limit} OFFSET ${skip}
        `
        
        const totalResult = await prisma.$queryRaw<[{ count: bigint }]>`
          SELECT COUNT(*) as count FROM admin_login_history
        `
        
        history = historyResult.map((h: any) => ({
          id: Number(h.id),
          userId: Number(h.userId),
          username: h.username,
          ipAddress: h.ipAddress,
          userAgent: h.userAgent,
          device: h.device,
          createdAt: h.createdAt,
          user: h.user,
        }))
        total = Number(totalResult[0]?.count || 0)
      }
    } catch (error: any) {
      // Если таблица не существует, возвращаем пустой массив
      if (error.code === 'P2021' || error.code === '42P01' || error.message?.includes('does not exist') || error.message?.includes('relation') || error.message?.includes('findMany')) {
        console.warn('⚠️ Login history table does not exist yet. Please create it using SQL.')
        console.error('Error details:', error.message, error.code)
        return NextResponse.json(
          createApiResponse({
            history: [],
            pagination: {
              page: 1,
              limit,
              total: 0,
              totalPages: 0,
            },
          })
        )
      }
      throw error
    }

    return NextResponse.json(
      createApiResponse({
        history: history.map(h => ({
          id: h.id,
          userId: h.userId,
          username: h.username,
          ipAddress: h.ipAddress,
          userAgent: h.userAgent,
          device: h.device,
          createdAt: h.createdAt instanceof Date ? h.createdAt.toISOString() : new Date(h.createdAt).toISOString(),
          user: h.user,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      })
    )
  } catch (error: any) {
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to fetch login history'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    requireAuth(request)

    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json(
        createApiResponse(null, 'ID is required'),
        { status: 400 }
      )
    }

    try {
      if ((prisma as any).adminLoginHistory) {
        await (prisma as any).adminLoginHistory.delete({
          where: { id: parseInt(id) },
        })
      } else {
        // Используем прямой SQL запрос
        await prisma.$executeRaw`
          DELETE FROM admin_login_history WHERE id = ${parseInt(id)}
        `
      }
    } catch (error: any) {
      if (error.code === 'P2025' || error.message?.includes('Record to delete does not exist')) {
        return NextResponse.json(
          createApiResponse(null, 'Login history entry not found'),
          { status: 404 }
        )
      }
      throw error
    }

    return NextResponse.json(
      createApiResponse({ message: 'Login history entry deleted successfully' })
    )
  } catch (error: any) {
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to delete login history'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

