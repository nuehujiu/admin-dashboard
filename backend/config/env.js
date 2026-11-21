/**
 * 启动时的配置校验：缺关键配置直接失败退出，避免服务带病运行
 * （以前 JWT_SECRET 没配也能起来，等第一个用户登录才 500）
 */
const logger = require('../utils/logger');

const PLACEHOLDER_SECRET = 'please_change_this_to_a_long_random_secret';
const REQUIRED = ['JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_NAME'];

function assertEnv() {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length) {
    logger.error('config', `缺少必需的环境变量：${missing.join(', ')}，请检查 backend/.env`);
    process.exit(1);
  }

  const secret = process.env.JWT_SECRET;
  const isProd = process.env.NODE_ENV === 'production';

  if (secret === PLACEHOLDER_SECRET) {
    if (isProd) {
      logger.error('config', 'JWT_SECRET 仍是示例值，生产环境必须换成随机强密钥');
      process.exit(1);
    }
    logger.warn('config', 'JWT_SECRET 仍是示例值，仅限本地开发使用');
  } else if (secret.length < 32) {
    if (isProd) {
      logger.error('config', 'JWT_SECRET 长度不足 32 位，请使用 openssl rand -hex 32 生成');
      process.exit(1);
    }
    logger.warn('config', 'JWT_SECRET 偏短，建议至少 32 位');
  }

  if (!process.env.CORS_ORIGIN && isProd) {
    logger.warn('config', '生产环境未配置 CORS_ORIGIN，将只放行 http://localhost:5173');
  }
}

module.exports = { assertEnv };
