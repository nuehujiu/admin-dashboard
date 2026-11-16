export function money(n, digits = 2) {
  const v = Number(n) || 0;
  return '¥' + v.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

// 图表/图例里用的缩写（¥138.62万）
export function moneyShort(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  if (abs >= 1e8) return '¥' + (v / 1e8).toFixed(2) + '亿';
  if (abs >= 1e4) return '¥' + (v / 1e4).toFixed(2) + '万';
  return '¥' + v.toFixed(0);
}

export function int(n) {
  return (Number(n) || 0).toLocaleString('zh-CN');
}

// 正数带 +，负数自带 -
export function percent(n, digits = 1) {
  const v = Number(n) || 0;
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`;
}
