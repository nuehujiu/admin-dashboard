/**
 * 内存滑动窗口限流（单实例够用；多实例部署请换 Redis 版本）
 * 原理：按「客户端 IP」维护一个 { start, count } 桶，窗口内计数超过上限即 429
 * 注意：这是「固定窗口」实现（窗口起点固定，不随请求滑动），足够防暴力登录
 */
// 日志
const logger = require('../utils/logger');

/**
 * 生成一个限流中间件
 * @param {object} [opts]
 * @param {number} [opts.windowMs] 窗口长度（毫秒），默认 60s
 * @param {number} [opts.max] 窗口内最大请求数
 * @param {string} [opts.message] 超限提示文案
 * @param {string} [opts.scope] 日志模块名
 * @returns {import('express').RequestHandler}
 */
function rateLimit({ windowMs = 60_000, max = 10, message = '请求过于频繁，请稍后再试', scope = 'rate' } = {}) {
  // IP → 计数桶 的映射（每个中间件实例独立，互不干扰）
  const buckets = new Map();

  // 每分钟清理一次过期桶，避免长时间运行内存只增不减
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, b] of buckets) {
      if (now - b.start >= windowMs) buckets.delete(key);
    }
    // 条目异常多说明可能在遭受攻击或存在大量 NAT 出口
    if (buckets.size > 5000) logger.warn(scope, `限流表条目偏多：${buckets.size}`);
  }, windowMs);
  // unref：定时器不阻止进程退出（测试结束能正常关掉服务）
  if (typeof sweeper.unref === 'function') sweeper.unref();

  return (req, res, next) => {
    // 取客户端标识：优先 express 的 req.ip（已考虑 trust proxy）
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let bucket = buckets.get(key);

    // 首次访问或窗口已过期 → 重建桶
    if (!bucket || now - bucket.start >= windowMs) {
      bucket = { start: now, count: 0 };
      buckets.set(key, bucket);
    }
    // 计数 +1
    bucket.count += 1;

    // 超过上限：返回 429 并告知多久后可重试
    if (bucket.count > max) {
      // 剩余时间按秒向上取整，至少 1 秒
      const retryAfter = Math.max(1, Math.ceil((bucket.start + windowMs - now) / 1000));
      // 标准头，前端/网关可读
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
// 窗口内允许的登录次数，默认 8 次/分钟
const LOGIN_MAX = Number(process.env.LOGIN_RATE_LIMIT_MAX || 8);
// 开关：显式 on 就开；生产环境除非显式 off 默认开；开发环境默认关
const loginEnabled = process.env.LOGIN_RATE_LIMIT === 'on'
  || (process.env.NODE_ENV === 'production' && process.env.LOGIN_RATE_LIMIT !== 'off');

// 预先创建真实限流器（即使关闭也会创建，保证热切换时状态一致）
const rawLoginLimiter = rateLimit({
  windowMs: 60_000,
  max: LOGIN_MAX,
  scope: 'login',
  message: '登录尝试过于频繁，请一分钟后再试',
});

// 对外导出的包装：关闭时直接放行
const loginLimiter = (req, res, next) => (loginEnabled ? rawLoginLimiter(req, res, next) : next());

// 导出通用工厂与登录专用限流
module.exports = { rateLimit, loginLimiter };
