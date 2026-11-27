/**
 * 后台管理 + 数据看板 —— 后端服务入口
 * Node + Express + MySQL
 *
 * 启动前：
 *   1. 复制 .env.example 为 .env 并填写 MySQL 连接信息与 JWT 密钥
 *   2. 在 MySQL 中创建数据库并导入 sql/init.sql
 *   3. npm install && npm run dev
 *
 * 中间件顺序（重要）：安全头 → 跨域 → body 解析 → 静态资源 → 健康检查 →
 *                    业务路由 → body 异常转换 → 404 → 统一错误处理
 */
// 最先加载 .env：后续 config 模块都要读 process.env
require('dotenv').config();

// HTTP 框架
const express = require('express');
// 跨域
const cors = require('cors');
// 路径处理
const path = require('path');
// 启动期配置校验（缺关键变量直接退出）
const { assertEnv } = require('./config/env');
// 连接池与建连探测
const { connectDB, pool } = require('./config/db');
// 首次启动时创建头像目录
const { ensureAvatarDir } = require('./config/upload');
// 结构化日志
const logger = require('./utils/logger');
// 安全响应头
const { securityHeaders } = require('./middleware/security');

// 路由
const authRoutes = require('./routes/auth'); // 认证
const userRoutes = require('./routes/user'); // 用户
const roleRoutes = require('./routes/role'); // 角色
const menuRoutes = require('./routes/menu'); // 菜单 / 权限项
const dashboardRoutes = require('./routes/dashboard'); // 看板
const goodsRoutes = require('./routes/goods'); // 商品
const settingsRoutes = require('./routes/settings'); // 设置
const salesRoutes = require('./routes/sales'); // 销售
const notificationRoutes = require('./routes/notification'); // 通知

// 末尾兜底中间件
const { errorHandler, notFound } = require('./middleware/errorHandler');

// 创建应用实例
const app = express();

// 不暴露 Express 指纹
app.disable('x-powered-by');

// 生产环境跑在 Nginx 后面，需要真实客户端 IP 才能正确限流
if (process.env.NODE_ENV === 'production') {
  // 1 表示信任最近一层代理的 X-Forwarded-For
  app.set('trust proxy', 1);
}

// 安全响应头（放最前，保证所有响应都有）
app.use(securityHeaders);

// 跨域：默认放行本地开发来源，生产环境请收紧 CORS_ORIGIN
// 支持逗号分隔多个来源
const corsOrigin = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim());

app.use(
  cors({
    // 白名单数组（cors 库会对数组做包含判断）
    origin: corsOrigin,
    // 允许携带 Cookie / 认证信息
    credentials: true,
  })
);

// 解析 JSON 与表单（头像 base64 上传也走 JSON，这里放到 1MB 留余量）
app.use(express.json({ limit: '1mb' }));
// extended:true 允许嵌套对象与数组语法
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 上传文件（头像等）静态访问：/uploads/avatars/xxx.jpg
ensureAvatarDir();
app.use(
  '/uploads',
  express.static(path.join(__dirname, process.env.UPLOAD_DIR || 'uploads'), {
    // 浏览器缓存 7 天（文件名含随机串，不怕脏读）
    maxAge: '7d',
    // 禁止目录索引
    index: false,
    // 禁止访问 . 开头的隐藏文件
    dotfiles: 'deny',
  })
);

// 健康检查：给负载均衡 / 部署脚本探活用
app.get('/api/health', (req, res) => {
  res.json({ code: 0, message: 'ok', data: { time: new Date().toISOString() } });
});

// 业务路由（每个模块自己再挂 authRequired / requirePerm）
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
// 注意：Express 内置解析器抛出的错误在这之前，所以这个错误中间件要放在路由之前
app.use((err, req, res, next) => {
  // body 超过 limit
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ code: 413, message: '提交内容过大', data: null });
  }
  // JSON 语法错误
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ code: 400, message: '请求体不是合法的 JSON', data: null });
  }
  // 其它错误继续往下传
  next(err);
});

// 404 与统一错误处理
app.use(notFound);
app.use(errorHandler);

// 监听端口：环境变量转数字，默认 3000
const PORT = Number(process.env.PORT) || 3000;
// 默认只监听本机，由 Nginx 反代对外；需要局域网访问时显式设置 HOST=0.0.0.0
const HOST = process.env.HOST || '127.0.0.1';

// 启动流程：校验配置 → 建连 → 监听 → 注册退出钩子
(async () => {
  // 缺配置直接退出，不进入半可用状态
  assertEnv();
  // 建连探测失败会 throw，被最外层 catch 接住
  await connectDB();

  const server = app.listen(PORT, HOST, () => {
    logger.info('server', `后端服务已启动 http://${HOST}:${PORT}`);
  });

  // 优雅退出：停止接新连接 → 关连接池 → 退出；10s 兜底强杀
  let closing = false;
  const shutdown = (signal) => {
    // 幂等：重复信号（如连按两次 Ctrl+C）只处理一次
    if (closing) return;
    closing = true;
    logger.info('server', `收到 ${signal}，开始优雅退出`);
    // close 回调在现有连接都结束后触发
    server.close(() => {
      pool
        .end()
        .catch(() => {})
        .finally(() => process.exit(0));
    });
    // 兜底：10 秒还没退干净就强杀（unref 保证正常退出不受它影响）
    setTimeout(() => {
      logger.error('server', '优雅退出超时，强制结束进程');
      process.exit(1);
    }, 10_000).unref();
  };
  // 同时监听容器编排常用信号与终端中断信号
  ['SIGTERM', 'SIGINT'].forEach((sig) => process.on(sig, () => shutdown(sig)));

  // 未捕获的 Promise 拒绝只记录，不直接退出（避免偶发外部调用拖垮服务）
  process.on('unhandledRejection', (reason) => {
    logger.error('server', '未处理的 Promise 拒绝', reason);
  });
})().catch((err) => {
  // 启动阶段任何失败都以 1 退出，交由进程管理器（pm2/systemd）重启
  logger.error('server', `启动失败：${err.message}`, err);
  process.exit(1);
});
