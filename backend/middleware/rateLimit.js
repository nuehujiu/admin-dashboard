/**
 * 内存滑动窗口限流（单实例够用；多实例部署请换 Redis 版本）
 */
const logger = require('../utils/logger');

function rateLimit({ windowMs = 60_000, max = 10, message = '请求过于频繁，请稍后再试', scope = 'rate' } = {}) {
  const buckets = new Map();

  // 每分钟清理一次过期桶，避免长时间运行内存只增不减
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, b] of buckets) {
      if (now - b.start >= windowMs) buckets.delete(key);
    }
    if (buckets.size > 5000) logger.warn(scope, `限流表条目偏多：${buckets.size}`);
  }, windowMs);
  if (typeof sweeper.unref === 'function') sweeper.unref();

  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || now - bucket.start >= windowMs) {
      bucket = { start: now, count: 0 };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.start + windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      logger.warn(scope, `触发限流 ip=${key} 次数=${bucket.count}`);
      return res.status(429).json({ code: 429, message, data: null });
    }
    next();
  };
}

/**
 * 登录限流：生产默认开启，本地开发/自动化测试默认关闭
 * （测试脚本会连续多次登录，开着会把用例打成 429）
 * 需要本地验证时：LOGIN_RATE_LIMIT=on，或设置 LOGIN_RATE_LIMIT_MAX 调整阈值
 */
const LOGIN_MAX = Number(process.env.LOGIN_RATE_LIMIT_MAX || 8);
const loginEnabled = process.env.LOGIN_RATE_LIMIT === 'on'
  || (process.env.NODE_ENV === 'production' && process.env.LOGIN_RATE_LIMIT !== 'off');

const rawLoginLimiter = rateLimit({
  windowMs: 60_000,
  max: LOGIN_MAX,
  scope: 'login',
  message: '登录尝试过于频繁，请一分钟后再试',
});

const loginLimiter = (req, res, next) => (loginEnabled ? rawLoginLimiter(req, res, next) : next());

module.exports = { rateLimit, loginLimiter };
