/**
 * 最近访问的页面（全局搜索的空态用）
 * 只存 path 数组，最多 5 条，不做持久化同步
 */
const KEY = 'houtai-recent-pages';
const MAX = 5;

export function readRecentPages() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((p) => typeof p === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecentPage(path) {
  if (!path) return readRecentPages();
  const list = [path, ...readRecentPages().filter((p) => p !== path)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* 隐私模式下写不进去，忽略即可 */
  }
  return list;
}
