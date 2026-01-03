import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

/**
 * GET - Get list of shifts with filters
 */
export async function GET(request: NextRequest) {
  try {
    requireAuth(request)

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const isClosed = searchParams.get('isClosed')

    const where: any = {}
    if (date) {
      where.date = new Date(date)
    }
    if (isClosed !== null) {
      where.isClosed = isClosed === 'true'
    }

    const shifts = await prisma.shift.findMany({
      where,
      orderBy: { date: 'desc' },
    })

    return NextResponse.json(
      createApiResponse(
        shifts.map((shift) => ({
          ...shift,
          totalDeposits: shift.totalDeposits.toString(),
          totalWithdrawals: shift.totalWithdrawals.toString(),
          totalProfit: shift.totalProfit.toString(),
        }))
      )
    )
  } catch (error: any) {
    console.error('Error fetching shifts:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to fetch shifts'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

/**
 * POST - Create/open shift for a date
 */
export async function POST(request: NextRequest) {
  try {
    requireAuth(request)

    const body = await request.json()
    const { date } = body

    if (!date) {
      return NextResponse.json(
        createApiResponse(null, 'Date is required'),
        { status: 400 }
      )
    }

    const dateOnly = new Date(date)
    dateOnly.setHours(0, 0, 0, 0)

    const shift = await prisma.shift.upsert({
      where: { date: dateOnly },
      create: {
        date: dateOnly,
        isClosed: false,
      },
      update: {},
    })

    return NextResponse.json(
      createApiResponse({
        ...shift,
        totalDeposits: shift.totalDeposits.toString(),
        totalWithdrawals: shift.totalWithdrawals.toString(),
        totalProfit: shift.totalProfit.toString(),
      })
    )
  } catch (error: any) {
    console.error('Error creating shift:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to create shift'),
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

