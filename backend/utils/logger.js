/**
 * 极简结构化日志
 * 输出形如：[2026-11-21T03:00:00.000Z] [INFO] [server] 后端服务已启动 http://127.0.0.1:3000
 * LOG_LEVEL=debug|info|warn|error 可控制级别，生产默认 info，开发默认 debug
 */
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

const configured = LEVELS[String(process.env.LOG_LEVEL || '').toLowerCase()];
const MIN = configured === undefined
  ? (process.env.NODE_ENV === 'production' ? LEVELS.info : LEVELS.debug)
  : configured;

function emit(level, scope, message, extra) {
  if (LEVELS[level] < MIN) return;
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${scope}] ${message}`;
  if (extra === undefined) {
    console.log(line);
    return;
  }
  // 错误对象打完整栈，其余打序列化后的附加信息
  if (extra instanceof Error) console.error(line, extra.stack || extra);
  else console.log(line, extra);
}

module.exports = {
  debug: (scope, msg, extra) => emit('debug', scope, msg, extra),
  info: (scope, msg, extra) => emit('info', scope, msg, extra),
  warn: (scope, msg, extra) => emit('warn', scope, msg, extra),
  error: (scope, msg, extra) => emit('error', scope, msg, extra),
};
