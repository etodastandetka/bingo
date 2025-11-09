module.exports = {
  apps: [
    {
      name: 'luxon-email-watcher',
      cwd: '/var/www/luxon/admin_nextjs',
      script: 'npm',
      args: 'run watcher',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/var/log/pm2/luxon-watcher-error.log',
      out_file: '/var/log/pm2/luxon-watcher-out.log',
      log_file: '/var/log/pm2/luxon-watcher.log',
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

