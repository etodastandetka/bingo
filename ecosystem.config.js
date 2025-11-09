module.exports = {
  apps: [
    {
      name: 'bingo-admin',
      cwd: './admin_nextjs',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      },
      error_file: './logs/bingo-admin-error.log',
      out_file: './logs/bingo-admin-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '1G'
    },
    {
      name: 'bingo-payment',
      cwd: './payment_site',
      script: 'python',
      args: 'app.py',
      interpreter: 'python3',
      env: {
        FLASK_ENV: 'production',
        PORT: 3003
      },
      error_file: './logs/bingo-payment-error.log',
      out_file: './logs/bingo-payment-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '500M'
    },
    {
      name: 'bingo-bot',
      cwd: './telegram_bot',
      script: 'python',
      args: 'bot.py',
      interpreter: 'python3',
      error_file: './logs/bingo-bot-error.log',
      out_file: './logs/bingo-bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '500M'
    }
  ]
};

