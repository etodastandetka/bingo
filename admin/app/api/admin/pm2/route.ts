import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Увеличиваем максимальное время выполнения до 60 секунд

// Управление PM2 процессами
export async function POST(request: NextRequest) {
  try {
    // Проверяем аутентификацию: либо через cookie (для веб-интерфейса), либо через API ключ (для админ-бота)
    const authToken = request.cookies.get('auth_token')?.value
    const apiKey = request.headers.get('X-API-Key') || request.headers.get('Authorization')?.replace('Bearer ', '')
    const adminApiKey = process.env.ADMIN_API_KEY
    
    // Логирование для отладки (только в development)
    if (process.env.NODE_ENV !== 'production') {
      console.log('[PM2 API] Auth check:', {
        hasAuthToken: !!authToken,
        hasApiKey: !!apiKey,
        hasAdminApiKey: !!adminApiKey,
        apiKeyMatch: apiKey && adminApiKey ? apiKey === adminApiKey : false
      })
    }
    
    // Если есть API ключ и он совпадает с ADMIN_API_KEY - разрешаем доступ
    if (apiKey && adminApiKey && apiKey === adminApiKey) {
      // Доступ разрешен через API ключ
      if (process.env.NODE_ENV !== 'production') {
        console.log('[PM2 API] Access granted via API key')
      }
    } else if (authToken) {
      // Проверяем обычную аутентификацию через cookie
      try {
        requireAuth(request)
        if (process.env.NODE_ENV !== 'production') {
          console.log('[PM2 API] Access granted via auth token')
        }
      } catch {
        console.error('[PM2 API] Auth token validation failed')
        return NextResponse.json(
          createApiResponse(null, 'Unauthorized'),
          { status: 401 }
        )
      }
    } else {
      console.error('[PM2 API] No authentication provided', {
        hasApiKey: !!apiKey,
        hasAdminApiKey: !!adminApiKey,
        hasAuthToken: !!authToken
      })
      return NextResponse.json(
        createApiResponse(null, 'Unauthorized'),
        { status: 401 }
      )
    }

    const body = await request.json()
    const { action } = body

    if (!action || !['stop', 'restart', 'start'].includes(action)) {
      return NextResponse.json(
        createApiResponse(null, 'Invalid action. Use: stop, restart, or start'),
        { status: 400 }
      )
    }

    // Список процессов для управления (исключаем админ-бота, чтобы он всегда работал)
    // ВАЖНО: Все процессы должны быть в этом списке, иначе они не будут управляться
    const processesToManage = [
      'bingo-admin',
      'bingo-bot',
      'bingo-bot-1xbet',
      'bingo-bot-mostbet',
      'bingo-email-watcher',
      'bingo-operator-bot',
      'bingo-payment'
    ]
    
    // Логируем список процессов для отладки
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[PM2 API] Managing ${processesToManage.length} processes:`, processesToManage)
    }
    
    // Выполняем команды для каждого процесса параллельно для ускорения
    const results: Array<{ process: string; success: boolean; stdout: string; stderr: string; error?: string }> = []
    
    // Создаем промисы для всех процессов
    const processPromises = processesToManage.map(async (processName) => {
      let command: string
      switch (action) {
        case 'stop':
          // Убираем || true, чтобы видеть реальные ошибки
          command = `pm2 stop ${processName}`
          break
        case 'restart':
          command = `pm2 restart ${processName}`
          break
        case 'start':
          command = `pm2 start ${processName}`
          break
        default:
          return {
            process: processName,
            success: false,
            stdout: '',
            stderr: '',
            error: 'Invalid action'
          }
      }
      
      try {
        console.log(`[PM2 API] Executing: ${command}`)
        const { stdout, stderr } = await execAsync(command, {
          timeout: 20000, // 20 секунд на каждый процесс
          maxBuffer: 1024 * 1024 * 2 // 2MB буфер
        })
        
        console.log(`[PM2 API] ${processName} ${action} result:`, { stdout: stdout?.substring(0, 100), stderr: stderr?.substring(0, 100) })
        
        return {
          process: processName,
          success: true,
          stdout: stdout || '',
          stderr: stderr || '',
        }
      } catch (error: any) {
        // Логируем ошибки, но не прерываем выполнение других процессов
        const errorMessage = error.message || 'Unknown error'
        const errorStderr = error.stderr || ''
        console.error(`[PM2 API] Error ${action} ${processName}:`, errorMessage, errorStderr)
        
        // Если процесс не существует или уже остановлен, это не критично
        const isNonCritical = errorMessage.includes('not found') || 
                              errorMessage.includes('doesn\'t exist') ||
                              errorStderr.includes('not found') ||
                              (action === 'stop' && errorMessage.includes('already stopped'))
        
        return {
          process: processName,
          success: isNonCritical, // Считаем успешным, если процесс не найден (уже остановлен)
          stdout: error.stdout || '',
          stderr: errorStderr,
          error: isNonCritical ? undefined : errorMessage
        }
      }
    })
    
    // Ждем выполнения всех команд параллельно
    const processResults = await Promise.all(processPromises)
    results.push(...processResults)
    
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

