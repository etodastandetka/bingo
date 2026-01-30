import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export const dynamic = 'force-dynamic'

// Управление PM2 процессами
export async function POST(request: NextRequest) {
  try {
    requireAuth(request)

    const body = await request.json()
    const { action } = body

    if (!action || !['stop', 'restart', 'start'].includes(action)) {
      return NextResponse.json(
        createApiResponse(null, 'Invalid action. Use: stop, restart, or start'),
        { status: 400 }
      )
    }

    // Список процессов для управления (исключаем админ-бота, чтобы он всегда работал)
    const processesToManage = [
      'bingo-admin',
      'bingo-bot',
      'bingo-bot-1xbet',
      'bingo-bot-mostbet',
      'bingo-email-watcher',
      'bingo-operator-bot',
      'bingo-payment'
    ]
    
    let command: string
    switch (action) {
      case 'stop':
        // Останавливаем каждый процесс отдельно, исключая админ-бота
        command = processesToManage.map(name => `pm2 stop ${name}`).join(' && ')
        break
      case 'restart':
        // Перезапускаем каждый процесс отдельно, исключая админ-бота
        command = processesToManage.map(name => `pm2 restart ${name}`).join(' && ')
        break
      case 'start':
        // Запускаем каждый процесс отдельно, исключая админ-бота
        command = processesToManage.map(name => `pm2 start ${name}`).join(' && ')
        break
      default:
        return NextResponse.json(
          createApiResponse(null, 'Invalid action'),
          { status: 400 }
        )
    }

    try {
      // Выполняем команду PM2
      const { stdout, stderr } = await execAsync(command, {
        timeout: 30000, // 30 секунд таймаут
        maxBuffer: 1024 * 1024 * 10 // 10MB буфер
      })

      return NextResponse.json(
        createApiResponse({
          success: true,
          action,
          stdout: stdout || '',
          stderr: stderr || '',
        })
      )
    } catch (error: any) {
      console.error(`PM2 ${action} error:`, error)
      return NextResponse.json(
        createApiResponse(null, error.message || `Failed to ${action} PM2 processes`),
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('PM2 management API error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to manage PM2'),
      { status: 500 }
    )
  }
}

