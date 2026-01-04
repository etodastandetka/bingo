import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Получение статистики для рассылки (количество пользователей по ботам)
export async function GET(request: NextRequest) {
  try {
    requireAuth(request)

    // Общее количество пользователей
    const totalUsers = await prisma.botUser.count()

    // Количество пользователей по ботам (на основе заявок)
    // Находим уникальных пользователей, которые создавали заявки с определенным botType
    const [mainUsers, xbetUsers, mostbetUsers] = await Promise.all([
      // Основной бот: пользователи с botType = 'main' или null
      prisma.request.findMany({
        where: {
          OR: [
            { botType: 'main' },
            { botType: null }
          ]
        },
        select: { userId: true },
        distinct: ['userId']
      }),
      // 1xbet бот: пользователи с botType = '1xbet'
      prisma.request.findMany({
        where: { botType: '1xbet' },
        select: { userId: true },
        distinct: ['userId']
      }),
      // Mostbet бот: пользователи с botType = 'mostbet'
      prisma.request.findMany({
        where: { botType: 'mostbet' },
        select: { userId: true },
        distinct: ['userId']
      })
    ])

    // Для оператор-бота используем всех пользователей (или можно использовать ChatMessage с botType = 'operator')
    const operatorUsers = await prisma.chatMessage.findMany({
      where: { botType: 'operator' },
      select: { userId: true },
      distinct: ['userId']
    })

    const botStats = {
      main: mainUsers.length,
      '1xbet': xbetUsers.length,
      mostbet: mostbetUsers.length,
      operator: operatorUsers.length || totalUsers // Если нет операторских сообщений, используем всех пользователей
    }

    return NextResponse.json(
      createApiResponse({
        totalUsers,
        botStats,
      })
    )
  } catch (error: any) {
    console.error('Broadcast stats API error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to fetch broadcast stats'),
      { status: 500 }
    )
  }
}

