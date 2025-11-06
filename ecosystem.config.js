module.exports = {
  apps: [
    {
      name: 'bingo-admin',
      cwd: '/var/www/bingo/admin_nextjs',
      script: 'npm',
      args: 'start',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      },
      error_file: '/var/log/pm2/bingo-admin-error.log',
      out_file: '/var/log/pm2/bingo-admin-out.log',
      log_file: '/var/log/pm2/bingo-admin.log',
      time: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '10s',
      instances: 1,
      exec_mode: 'fork'
    },
    {
      name: 'bingo-email-watcher',
      cwd: '/var/www/bingo/admin_nextjs',
      script: 'npm',
      args: 'run watcher',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/var/log/pm2/bingo-watcher-error.log',
      out_file: '/var/log/pm2/bingo-watcher-out.log',
      log_file: '/var/log/pm2/bingo-watcher.log',
      time: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
}

