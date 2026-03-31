module.exports = {
  apps: [
    {
      name:               'research-library',
      script:             'server.js',
      instances:          1,
      exec_mode:          'fork',
      watch:              false,
      max_memory_restart: '512M',
      min_uptime:         '30s',
      max_restarts:       10,
      kill_timeout:       10000,

      // ── تحميل .env تلقائياً (Node 20.6+) ────────────────
      interpreter_args: '--env-file=.env',

      env_production: {
        NODE_ENV: 'production',
      },

      error_file:      './logs/error.log',
      out_file:        './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name:         'cloudflare-tunnel',
      script:       '/usr/local/bin/cloudflared',
      args:         'tunnel run research-library',
      instances:    1,
      exec_mode:    'fork',
      watch:        false,
      max_restarts: 10,
      min_uptime:   '30s',
      kill_timeout: 5000,
      error_file:   '/home/amr/.pm2/logs/cloudflare-tunnel-error.log',
      out_file:     '/home/amr/.pm2/logs/cloudflare-tunnel-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
