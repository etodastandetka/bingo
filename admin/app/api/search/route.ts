import { NextRequest, NextResponse } from 'next/server'
import { createApiResponse } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') as 'casino_id' | 'telegram_id' | 'name'
    const query = searchParams.get('query')

    if (!type || !query) {
      return NextResponse.json(
        createApiResponse(null, 'Type and query are required'),
        { status: 400 }
      )
    }

    let requests: any[] = []

    switch (type) {
      case 'casino_id':
        // Поиск по ID казино (accountId)
        requests = await prisma.request.findMany({
          where: {
            accountId: {
              contains: query,
              mode: 'insensitive',
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 50,
        })
        break

      case 'telegram_id':
        // Поиск по ID телеграм (userId)
        try {
          const userId = BigInt(query)
          requests = await prisma.request.findMany({
            where: {
              userId: userId,
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: 50,
          })
        } catch (err) {
          // Если не удалось преобразовать в BigInt, возвращаем пустой результат
          requests = []
        }
        break

      case 'name':
        // Поиск по имени (firstName, lastName, username)
        // Используем OR для поиска по всем полям
        requests = await prisma.request.findMany({
          where: {
            OR: [
              {
                firstName: {
                  contains: query,
                  mode: 'insensitive',
                },
              },
              {
                lastName: {
                  contains: query,
                  mode: 'insensitive',
                },
              },
              {
                username: {
                  contains: query,
                  mode: 'insensitive',
                },
              },
            ],
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 50,
        })
        break

      default:
        return NextResponse.json(
          createApiResponse(null, 'Invalid search type'),
          { status: 400 }
        )
    }

    // Форматируем результаты
    const formattedResults = requests.map((req) => {
      return {
        id: req.id,
        userId: req.userId.toString(),
        username: req.username || null,
        firstName: req.firstName || null,
        lastName: req.lastName || null,
        accountId: req.accountId,
        requestType: req.requestType,
        amount: req.amount ? req.amount.toString() : '0',
        status: req.status,
        bookmaker: req.bookmaker,
        createdAt: req.createdAt.toISOString(),
      }
    })

    return NextResponse.json(
      createApiResponse(formattedResults)
    )
  } catch (error: any) {
    console.error('Search error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to search'),
      { status: 500 }
    )
  }
}

