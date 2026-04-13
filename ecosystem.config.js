// pm2 ecosystem config — run `npm run build` first, then `pm2 start ecosystem.config.js`
// to launch. Run `pm2 save && pm2 startup` to persist across reboots.
module.exports = {
  apps: [
    {
      name: 'movie-chat',
      script: 'npm',
      args: 'run start',          // production server — stable for 24/7 uptime
      watch: false,
      autorestart: true,          // restart on crash
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '400M', // force restart if process grows beyond 400 MB
      // Co-locate pm2's stdout/stderr capture with the app's logger files
      // so /api/diagnostics/bundle can find both in one directory scan.
      // pm2 rewrites these files on each `pm2 restart`, so they self-bound.
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
