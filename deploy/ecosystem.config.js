// PM2 process manager config
// Usage:
//   pm2 start ecosystem.config.js
//   pm2 save && pm2 startup   ← auto-restart on server reboot

module.exports = {
  apps: [
    {
      name: 'widow-spider',
      script: './server/index.js',
      cwd: '/var/www/widow-spider',
      instances: 1,           // single instance (Socket.io state must be shared if scaling)
      exec_mode: 'fork',
      watch: false,
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      // Auto-restart on crash
      restart_delay: 3000,
      max_restarts: 10,
      // Logs
      out_file: '/var/log/widow-spider/out.log',
      error_file: '/var/log/widow-spider/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};
