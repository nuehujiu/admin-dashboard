/**
 * PM2 部署样例：pm2 start deploy/ecosystem.config.cjs
 * 说明：先把 backend/.env 放到服务器上（不入库），下面的 env 只覆盖运行模式
 */
module.exports = {
  apps: [
    {
      name: 'admin-dashboard-api',
      cwd: './backend',
      script: 'app.js',
      // 单实例即可；多实例会各自持有内存限流计数，如需横向扩展请换 Redis 限流
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      // 优雅退出：给正在处理的请求留时间
      kill_timeout: 10000,
      wait_ready: false,
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: 3000,
        LOG_LEVEL: 'info',
      },
      error_file: './logs/api-err.log',
      out_file: './logs/api-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
