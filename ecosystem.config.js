// pm2 ecosystem config — run `pm2 start ecosystem.config.js` to launch,
// then `pm2 save && pm2 startup` to persist across reboots.
module.exports = {
  apps: [
    {
      name: 'movie-chat',
      script: 'npm',
      args: 'run dev',
      watch: false,       // don't let pm2 watch files — Next.js HMR handles that
      autorestart: true,  // restart if the process crashes
      max_restarts: 10,
      min_uptime: '10s',  // don't count a restart if it crashes within 10s of start
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
    },
  ],
};
