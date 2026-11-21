/**
 * 后台管理 + 数据看板 —— 后端服务入口
 * Node + Express + MySQL
 *
 * 启动前：
 *   1. 复制 .env.example 为 .env 并填写 MySQL 连接信息与 JWT 密钥
 *   2. 在 MySQL 中创建数据库并导入 sql/init.sql
 *   3. npm install && npm run dev
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { assertEnv } = require('./config/env');
const { connectDB, pool } = require('./config/db');
const logger = require('./utils/logger');
const { securityHeaders } = require('./middleware/security');

// 路由
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const roleRoutes = require('./routes/role');
const menuRoutes = require('./routes/menu');
const dashboardRoutes = require('./routes/dashboard');
const goodsRoutes = require('./routes/goods');
const settingsRoutes = require('./routes/settings');
const salesRoutes = require('./routes/sales');
const notificationRoutes = require('./routes/notification');

const { errorHandler, notFound } = require('./middleware/errorHandler');

const app = express();

// 不暴露 Express 指纹
app.disable('x-powered-by');

// 生产环境跑在 Nginx 后面，需要真实客户端 IP 才能正确限流
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(securityHeaders);

// 跨域：默认放行本地开发来源，生产环境请收紧 CORS_ORIGIN
const corsOrigin = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim());

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  })
);

// 解析 JSON 与表单（头像 dataURL 上限 200KB，这里放到 1MB 留余量）
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ code: 0, message: 'ok', data: { time: new Date().toISOString() } });
});

// 业务路由
app.use('/api/auth', authRoutes); // 认证（注册 / 登录 / 获取当前用户）
app.use('/api/users', userRoutes); // 用户管理
app.use('/api/roles', roleRoutes); // 角色管理
app.use('/api/menus', menuRoutes); // 菜单/权限项（角色管理权限矩阵）
app.use('/api/dashboard', dashboardRoutes); // 数据看板统计
app.use('/api/goods', goodsRoutes); // 商品管理
app.use('/api/settings', settingsRoutes); // 系统设置
app.use('/api/sales', salesRoutes); // 销售明细
app.use('/api/notifications', notificationRoutes); // 通知中心（从业务数据派生）

// 请求异常（如 body 超限、JSON 语法错误）也要走统一 JSON 错误格式
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ code: 413, message: '提交内容过大', data: null });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ code: 400, message: '请求体不是合法的 JSON', data: null });
  }
  next(err);
});

// 404 与统一错误处理
app.use(notFound);
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 3000;
// 默认只监听本机，由 Nginx 反代对外；需要局域网访问时显式设置 HOST=0.0.0.0
const HOST = process.env.HOST || '127.0.0.1';

(async () => {
  assertEnv();
  await connectDB();

  const server = app.listen(PORT, HOST, () => {
    logger.info('server', `后端服务已启动 http://${HOST}:${PORT}`);
  });

  // 优雅退出：停止接新连接 → 关连接池 → 退出；10s 兜底强杀
  let closing = false;
  const shutdown = (signal) => {
    if (closing) return;
    closing = true;
    logger.info('server', `收到 ${signal}，开始优雅退出`);
    server.close(() => {
      pool
        .end()
        .catch(() => {})
        .finally(() => process.exit(0));
    });
    setTimeout(() => {
      logger.error('server', '优雅退出超时，强制结束进程');
      process.exit(1);
    }, 10_000).unref();
  };
  ['SIGTERM', 'SIGINT'].forEach((sig) => process.on(sig, () => shutdown(sig)));

  process.on('unhandledRejection', (reason) => {
    logger.error('server', '未处理的 Promise 拒绝', reason);
  });
})().catch((err) => {
  logger.error('server', `启动失败：${err.message}`, err);
  process.exit(1);
});
