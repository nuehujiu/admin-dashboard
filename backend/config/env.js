/**
 * 启动时的配置校验：缺关键配置直接失败退出，避免服务带病运行
 * （以前 JWT_SECRET 没配也能起来，等第一个用户登录才 500）
 */
// 引入带分类前缀的日志器
const logger = require('../utils/logger');

// .env.example 里的示例密钥，生产环境出现这个值必须拒绝启动
const PLACEHOLDER_SECRET = 'please_change_this_to_a_long_random_secret';
// 启动前必须存在的环境变量清单（缺一个就退出）
const REQUIRED = ['JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_NAME'];

/**
 * 校验环境变量；不满足要求时打印错误并 process.exit(1)
 * 注意：本函数应在 dotenv 加载之后、创建连接池之前调用
 */
function assertEnv() {
  // 收集缺失项：空字符串也算缺失
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length) {
    logger.error('config', `缺少必需的环境变量：${missing.join(', ')}，请检查 backend/.env`);
    // 直接退出，避免半可用状态
    process.exit(1);
  }

  // 取出密钥与运行环境标记
  const secret = process.env.JWT_SECRET;
  const isProd = process.env.NODE_ENV === 'production';

  // 情况一：仍是示例值
  if (secret === PLACEHOLDER_SECRET) {
    if (isProd) {
      // 生产环境：示例密钥等于公开密钥，必须拦下
      logger.error('config', 'JWT_SECRET 仍是示例值，生产环境必须换成随机强密钥');
      process.exit(1);
    }
    // 开发环境：仅告警
    logger.warn('config', 'JWT_SECRET 仍是示例值，仅限本地开发使用');
  } else if (secret.length < 32) {
    // 情况二：长度不足（32 位以下暴力破解成本过低）
    if (isProd) {
      logger.error('config', 'JWT_SECRET 长度不足 32 位，请使用 openssl rand -hex 32 生成');
      process.exit(1);
    }
    logger.warn('config', 'JWT_SECRET 偏短，建议至少 32 位');
  }

  // 生产环境未配跨域白名单时给出提醒（此时只放行本地开发地址）
  if (!process.env.CORS_ORIGIN && isProd) {
    logger.warn('config', '生产环境未配置 CORS_ORIGIN，将只放行 http://localhost:5173');
  }
}

// 只导出校验函数，由 app.js 在启动流程中调用
module.exports = { assertEnv };
