import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

// Временный endpoint для создания таблицы (только для админов)
export async function POST(request: NextRequest) {
  try {
    requireAuth(request)

    // Создаем таблицу через SQL
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS admin_login_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        username VARCHAR(255) NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        device VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `

    // Создаем индексы
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_admin_login_history_user_id ON admin_login_history(user_id)
    `
    
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_admin_login_history_created_at ON admin_login_history(created_at)
    `

    return NextResponse.json(
      createApiResponse({ message: 'Table created successfully' })
    )
  } catch (error: any) {
    // Если таблица уже существует, это нормально
    if (error.message?.includes('already exists') || error.code === '42P07') {
      return NextResponse.json(
        createApiResponse({ message: 'Table already exists' })
      )
    }
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to create table'),
      { status: 500 }
    )
  }
}









