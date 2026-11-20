import { theme as antdTheme } from 'antd';

/** 0~255 取整并转两位十六进制 */
const rand = (n) => Math.max(0, Math.min(255, Math.round(n)));
const hex2 = (n) => rand(n).toString(16).padStart(2, '0');

/** '#F5611D' → { r: 245, g: 97, b: 29 } */
export function hexToRgb(hex) {
  const v = String(hex || '').replace('#', '');
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  };
}

/** 变暗：ratio 0~1（0.10 = 压暗 10%） */
export function shadeColor(hex, ratio) {
  const { r, g, b } = hexToRgb(hex);
  return `#${hex2(r * (1 - ratio))}${hex2(g * (1 - ratio))}${hex2(b * (1 - ratio))}`.toUpperCase();
}

/** 与白色混合：ratio 0~1（0.92 = 只留 8% 原色） */
export function mixWhite(hex, ratio) {
  const { r, g, b } = hexToRgb(hex);
  return `#${hex2(r * (1 - ratio) + 255 * ratio)}${hex2(g * (1 - ratio) + 255 * ratio)}${hex2(b * (1 - ratio) + 255 * ratio)}`.toUpperCase();
}

/** 按主题色生成完整 antd 主题（派生 soft / ink 与阴影） */
export function createTheme(color = '#F5611D') {
  const { r, g, b } = hexToRgb(color);
  const ink = shadeColor(color, 0.28);
  const soft = mixWhite(color, 0.92);
  const rgba = (a) => `rgba(${r},${g},${b},${a})`;

  return {
    algorithm: antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: color,
      colorSuccess: '#1F9D55',
      colorWarning: '#C77A28',
      colorError: '#D33A32',
      colorInfo: color,
      colorText: '#1C1917',
      colorTextSecondary: '#5D5751',
      colorTextTertiary: '#A8A29C',
      colorBgLayout: '#F7F5F2',
      colorBgContainer: '#FFFFFF',
      colorBorder: '#EDE8E2',
      colorBorderSecondary: '#F4F1ED',
      borderRadius: 8,
      borderRadiusLG: 14,
      borderRadiusSM: 6,
      fontSize: 13.5,
      fontFamily:
        '-apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif',
      controlHeight: 34,
      controlHeightLG: 42,
    },
    components: {
      Button: { primaryShadow: `0 1px 2px ${rgba(0.25)}`, fontWeight: 500 },
      Table: {
        headerBg: '#FBFAF8',
        rowHoverBg: '#FFFBF8',
        borderColor: '#F4F1ED',
        cellPaddingBlock: 12,
        headerSplitColor: 'transparent',
      },
      Menu: {
        itemSelectedBg: soft,
        itemSelectedColor: ink,
        itemHeight: 40,
        itemMarginInline: 8,
        groupTitleColor: '#A8A29C',
        groupTitleFontSize: 11,
        activeBarWidth: 0,
      },
      Card: { paddingLG: 20 },
      Input: { activeShadow: `0 0 0 3px ${rgba(0.10)}` },
      Pagination: { itemActiveBg: color, itemSize: 30 },
      Switch: { colorPrimary: '#1F9D55' },
    },
  };
}

/** 兼容旧引用（默认暖橙） */
export const Theme = createTheme('#F5611D');

/** 同步 CSS 变量（给 var(--primary) 这类内联样式用，如头像底色） */
export function applyCssVars(color = '#F5611D') {
  const root = document.documentElement;
  root.style.setProperty('--primary', color);
  root.style.setProperty('--primary-hover', shadeColor(color, 0.10));
  root.style.setProperty('--primary-ink', shadeColor(color, 0.28));
  root.style.setProperty('--primary-soft', mixWhite(color, 0.92));
  root.style.setProperty('--primary-line', mixWhite(color, 0.72));
}
