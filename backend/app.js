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
const { connectDB } = require('./config/db');

// 路由
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const roleRoutes = require('./routes/role');
const dashboardRoutes = require('./routes/dashboard');
const goodsRoutes = require('./routes/goods');
const settingsRoutes = require('./routes/settings');

const { errorHandler, notFound } = require('./middleware/errorHandler');

const app = express();

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

// 解析 JSON 与表单
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ code: 0, message: 'ok', data: { time: new Date().toISOString() } });
});

// 业务路由
app.use('/api/auth', authRoutes); // 认证（注册 / 登录 / 获取当前用户）
app.use('/api/users', userRoutes); // 用户管理
app.use('/api/roles', roleRoutes); // 角色管理
app.use('/api/dashboard', dashboardRoutes); // 数据看板统计
app.use('/api/goods', goodsRoutes); // 商品管理
app.use('/api/settings', settingsRoutes); // 系统设置

// 404 与统一错误处理
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

(async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`[server] 后端服务已启动: http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('[server] 数据库连接失败，请检查 .env 配置: ', err.message);
    process.exit(1);
  }
})();
