/**
 * 最近访问的页面记录（全局搜索框的空态展示用）
 * 设计取舍：只存 path 数组、最多 5 条；不做跨 tab 同步，也不与服务端关联，
 * 属于纯本地辅助信息，丢了不影响功能
 */
// localStorage 键名，加项目前缀避免与其它本地站点数据冲突
const KEY = 'houtai-recent-pages';
// 最多保留条数，控制搜索空态长度
const MAX = 5;

/**
 * 读取最近访问路径列表
 * @returns {string[]} 过滤掉非字符串的脏数据，并按上限截断；解析失败返回空数组
 */
export function readRecentPages() {
  try {
    // 取原始字符串，缺省用 '[]' 保证 JSON.parse 不抛错
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    // 防御性校验：必须是数组，再过滤非字符串项并截断到上限
    return Array.isArray(list) ? list.filter((p) => typeof p === 'string').slice(0, MAX) : [];
  } catch {
    // 数据损坏或被手动改坏时静默降级为空列表
    return [];
  }
}

/**
 * 记录一次页面访问（放在路由切换处调用）
 * @param {string} path - 当前页面路径
 * @returns {string[]} 更新后的列表，调用方可直接用于渲染
 */
export function pushRecentPage(path) {
  // 空路径不记录，直接返回现有数据
  if (!path) return readRecentPages();
  // 新路径置于队首，旧的同名项先剔除（保证去重），再截断到上限
  const list = [path, ...readRecentPages().filter((p) => p !== path)].slice(0, MAX);
  try {
    // 写回本地存储
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* 隐私模式 / 配额满时写入会失败，属于非关键数据，忽略即可 */
  }
  // 无论是否写入成功都返回内存中的最新列表
  return list;
}
