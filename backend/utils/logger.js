/**
 * 极简结构化日志
 * 输出形如：[2026-11-21T03:00:00.000Z] [INFO] [server] 后端服务已启动 http://127.0.0.1:3000
 * LOG_LEVEL=debug|info|warn|error 可控制级别，生产默认 info，开发默认 debug
 */
// 级别数值化：值越大越严重，用于「低于阈值就不输出」的比较
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

// 读取显式配置的级别（未配置或写错则为 undefined）
const configured = LEVELS[String(process.env.LOG_LEVEL || '').toLowerCase()];
// 最终阈值：未配置时生产用 info（少打日志）、开发用 debug（便于排查）
const MIN = configured === undefined
  ? (process.env.NODE_ENV === 'production' ? LEVELS.info : LEVELS.debug)
  : configured;

/**
 * 统一输出入口
 * @param {'debug'|'info'|'warn'|'error'} level - 日志级别
 * @param {string} scope - 模块标识（如 server / auth / db）
 * @param {string} message - 日志正文
 * @param {*} [extra] - 附加信息，Error 实例会打完整栈
 */
function emit(level, scope, message, extra) {
  // 级别低于阈值直接丢弃
  if (LEVELS[level] < MIN) return;
  // 固定格式前缀：ISO 时间 + 大写级别 + 模块名
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${scope}] ${message}`;
  // 无附加信息时简单输出
  if (extra === undefined) {
    console.log(line);
    return;
  }
  // 错误对象打完整栈，其余打序列化后的附加信息
  if (extra instanceof Error) console.error(line, extra.stack || extra);
  else console.log(line, extra);
}

// 按级别导出便捷方法，调用处无需再传 level
module.exports = {
  debug: (scope, msg, extra) => emit('debug', scope, msg, extra),
  info: (scope, msg, extra) => emit('info', scope, msg, extra),
  warn: (scope, msg, extra) => emit('warn', scope, msg, extra),
  error: (scope, msg, extra) => emit('error', scope, msg, extra),
};
