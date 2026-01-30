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
    
    // Выполняем команды для каждого процесса отдельно, чтобы игнорировать ошибки для несуществующих
    const results: Array<{ process: string; success: boolean; stdout: string; stderr: string; error?: string }> = []
    
    for (const processName of processesToManage) {
      let command: string
      switch (action) {
        case 'stop':
          command = `pm2 stop ${processName} || true` // || true игнорирует ошибки
          break
        case 'restart':
          command = `pm2 restart ${processName} || true`
          break
        case 'start':
          command = `pm2 start ${processName} || true`
          break
        default:
          return NextResponse.json(
            createApiResponse(null, 'Invalid action'),
            { status: 400 }
          )
      }
      
      try {
        const { stdout, stderr } = await execAsync(command, {
          timeout: 10000, // 10 секунд на каждый процесс
          maxBuffer: 1024 * 1024 // 1MB буфер
        })
        
        results.push({
          process: processName,
          success: true,
          stdout: stdout || '',
          stderr: stderr || '',
        })
      } catch (error: any) {
        // Игнорируем ошибки для отдельных процессов (могут быть не запущены)
        results.push({
          process: processName,
          success: false,
          stdout: '',
          stderr: '',
          error: error.message || 'Unknown error'
        })
      }
    }
    
    // Считаем успешными, если хотя бы один процесс обработан
    const successCount = results.filter(r => r.success).length
    const allOutput = results.map(r => 
      `${r.process}: ${r.success ? 'OK' : 'SKIPPED' + (r.error ? ` (${r.error})` : '')}`
    ).join('\n')
    
    const combinedStdout = results.map(r => r.stdout).filter(s => s).join('\n')
    const combinedStderr = results.map(r => r.stderr).filter(s => s).join('\n')

    return NextResponse.json(
      createApiResponse({
        success: successCount > 0,
        action,
        processed: successCount,
        total: processesToManage.length,
        results: allOutput,
        stdout: combinedStdout || allOutput,
        stderr: combinedStderr || '',
      })
    )
  } catch (error: any) {
    console.error('PM2 management API error:', error)
    return NextResponse.json(
      createApiResponse(null, error.message || 'Failed to manage PM2'),
      { status: 500 }
    )
  }
}

