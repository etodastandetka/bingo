module.exports = {
  apps: [
    {
      name: 'bingo-admin',
      cwd: './admin',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: './logs/admin-error.log',
      out_file: './logs/admin-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '500M',
      instances: 1,
      exec_mode: 'fork'
    },
    {
      name: 'bingo-bot',
      cwd: './telegram_bot',
      script: './venv/bin/python3',
      args: '-u bot.py',
      env: {
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8'
      },
      error_file: './logs/bot-error.log',
      out_file: './logs/bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '300M',
      instances: 1,
      exec_mode: 'fork'
    },
    {
      name: 'bingo-operator-bot',
      cwd: './telegram_bot',
      script: './venv/bin/python3',
      args: '-u operator_bot.py',
      env: {
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8'
      },
      error_file: './logs/operator-bot-error.log',
      out_file: './logs/operator-bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '300M',
      instances: 1,
      exec_mode: 'fork'
    },
    {
      name: 'bingo-bot-1xbet',
      cwd: './telegram_bot_1xbet',
      script: './venv/bin/python3',
      args: '-u bot.py',
      env: {
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8'
      },
      error_file: './logs/bot-1xbet-error.log',
      out_file: './logs/bot-1xbet-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '300M',
      instances: 1,
      exec_mode: 'fork'
    },
    {
      name: 'bingo-bot-mostbet',
      cwd: './telegram_bot_mostbet',
      script: './venv/bin/python3',
      args: '-u bot.py',
      env: {
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8'
      },
      error_file: './logs/bot-mostbet-error.log',
      out_file: './logs/bot-mostbet-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '300M',
      instances: 1,
      exec_mode: 'fork'
    },
    {
      name: 'bingo-payment',
      cwd: './payment_site',
      script: './venv/bin/python3',
      args: '-m gunicorn -w 4 -b 0.0.0.0:3002 --timeout 120 --access-logfile - --error-logfile - app:app',
      env: {
        FLASK_ENV: 'production',
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8'
      },
      error_file: './logs/payment-error.log',
      out_file: './logs/payment-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '500M',
      instances: 1,
      exec_mode: 'fork'
    }
  ]
};









