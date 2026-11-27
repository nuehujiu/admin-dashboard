/**
 * 金额格式化（带千分位与固定小数）
 * @param {number|string} n - 原始金额，非法值按 0 处理
 * @param {number} digits - 保留小数位，默认 2 位
 * @returns {string} 形如 ¥1,234.00 的展示字符串
 */
export function money(n, digits = 2) {
  // 先转数字，NaN / 空值统一回退为 0，避免页面出现 ¥NaN
  const v = Number(n) || 0;
  // 使用 zh-CN 本地化输出千分位，并固定小数位数（最少=最多，保证位数一致）
  return '¥' + v.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * 金额缩写（图表轴、图例等空间有限的位置使用）
 * @param {number|string} n - 原始金额
 * @returns {string} ¥1.38亿 / ¥138.62万 / ¥139 这类紧凑写法
 */
export function moneyShort(n) {
  // 统一转数字并兜底 0
  const v = Number(n) || 0;
  // 取绝对值判断量级，负数也能正确进入对应分支
  const abs = Math.abs(v);
  // 亿级：除以 1e8 保留两位
  if (abs >= 1e8) return '¥' + (v / 1e8).toFixed(2) + '亿';
  // 万级：除以 1e4 保留两位
  if (abs >= 1e4) return '¥' + (v / 1e4).toFixed(2) + '万';
  // 万以下：取整展示，避免小数挤占宽度
  return '¥' + v.toFixed(0);
}

/**
 * 整数格式化（带千分位，用于订单数、库存等计数场景）
 * @param {number|string} n - 原始数值
 * @returns {string} 形如 12,345 的字符串
 */
export function int(n) {
  // 同样做 NaN 兜底，再走本地化千分位
  return (Number(n) || 0).toLocaleString('zh-CN');
}

/**
 * 百分比格式化（正数显式加 +，负数自带 -）
 * @param {number|string} n - 百分比数值（如 12.3 表示 12.3%）
 * @param {number} digits - 小数位，默认 1 位
 * @returns {string} 形如 +12.3% / -5.0% / 0.0%
 */
export function percent(n, digits = 1) {
  // 转数字并兜底 0
  const v = Number(n) || 0;
  // 正数补 + 号以体现「增长」语义；负数由 toFixed 自带 -；
  // 0 不补号，保持中性展示
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`;
}
