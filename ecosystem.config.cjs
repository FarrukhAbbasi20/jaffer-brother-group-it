/** PM2 process file — keep a single portal instance alive on port 3850. */
module.exports = {
  apps: [
    {
      name: 'projecttracker',
      cwd: '/var/www/projecttrack_usr/data/www/projecttracker.jaffer.com',
      script: './server/index.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 20,
      min_uptime: '5s',
      restart_delay: 2000,
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'production',
        PORT: '3850',
      },
      error_file: '/var/www/projecttrack_usr/data/logs/projecttracker-pm2-error.log',
      out_file: '/var/www/projecttrack_usr/data/logs/projecttracker-pm2-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
