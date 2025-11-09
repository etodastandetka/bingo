module.exports = {
  apps: [
    {
      name: 'bingo-admin',
      cwd: '/var/www/bingo/admin_nextjs',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      },
      error_file: '/var/log/pm2/bingo-admin-error.log',
      out_file: '/var/log/pm2/bingo-admin-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '1G'
    },
    {
      name: 'bingo-payment',
      cwd: '/var/www/bingo/payment_site',
      script: 'app.py',
      interpreter: 'python3',
      env: {
        FLASK_ENV: 'production',
        PORT: 3003
      },
      error_file: '/var/log/pm2/bingo-payment-error.log',
      out_file: '/var/log/pm2/bingo-payment-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '500M'
    },
    {
      name: 'bingo-bot',
      cwd: '/var/www/bingo/telegram_bot',
      script: 'bot.py',
      interpreter: 'python3',
      error_file: '/var/log/pm2/bingo-bot-error.log',
      out_file: '/var/log/pm2/bingo-bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '500M'
    }
  ]
};

