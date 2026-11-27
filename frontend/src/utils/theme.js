// 引入 antd 主题模块，用于取默认算法（亮色主题）
import { theme as antdTheme } from 'antd';

/** 把数值限制在 0~255 并取整，防止颜色分量越界 */
const rand = (n) => Math.max(0, Math.min(255, Math.round(n)));
/** 转成两位十六进制（不足两位左补 0），供拼接颜色字符串 */
const hex2 = (n) => rand(n).toString(16).padStart(2, '0');

/**
 * 十六进制颜色转 RGB 分量
 * @param {string} hex - 形如 '#F5611D' 或 'F5611D'
 * @returns {{ r: number, g: number, b: number }} 各分量 0~255
 */
export function hexToRgb(hex) {
  // 去掉可能存在的 # 前缀，兼容大小写与简写外的常规 6 位写法
  const v = String(hex || '').replace('#', '');
  // 逐两位按 16 进制解析出 R/G/B
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  };
}

/**
 * 把颜色压暗
 * @param {string} hex - 原色
 * @param {number} ratio - 0~1，0.10 表示各分量压暗 10%
 * @returns {string} 新的大写十六进制颜色
 */
export function shadeColor(hex, ratio) {
  // 取出 RGB 分量
  const { r, g, b } = hexToRgb(hex);
  // 各分量按比例衰减后转十六进制拼接（用于 hover 态、深色文字）
  return `#${hex2(r * (1 - ratio))}${hex2(g * (1 - ratio))}${hex2(b * (1 - ratio))}`.toUpperCase();
}

/**
 * 与白色混合，得到更浅的色阶
 * @param {string} hex - 原色
 * @param {number} ratio - 0~1，0.92 表示只保留 8% 原色（大面积浅底用）
 * @returns {string} 新的十六进制颜色
 */
export function mixWhite(hex, ratio) {
  // 取出 RGB 分量
  const { r, g, b } = hexToRgb(hex);
  // 每个分量向 255 靠拢：result = 原色*(1-ratio) + 白*ratio
  return `#${hex2(r * (1 - ratio) + 255 * ratio)}${hex2(g * (1 - ratio) + 255 * ratio)}${hex2(b * (1 - ratio) + 255 * ratio)}`.toUpperCase();
}

/**
 * 按主题色生成完整的 antd ConfigProvider 主题配置
 * @param {string} color - 主色，默认暖橙 #F5611D
 * @returns {object} 含 algorithm / token / components 的主题对象
 */
export function createTheme(color = '#F5611D') {
  // 解析主色的 RGB，用于生成半透明阴影、光晕
  const { r, g, b } = hexToRgb(color);
  // 深色衍生色（选中文字、强调文字）
  const ink = shadeColor(color, 0.28);
  // 浅色衍生色（选中背景、浅底标签）
  const soft = mixWhite(color, 0.92);
  // 便捷函数：按主色生成任意透明度的 rgba 字符串
  const rgba = (a) => `rgba(${r},${g},${b},${a})`;

  return {
    // 使用 antd 默认亮色算法（不启用暗色模式）
    algorithm: antdTheme.defaultAlgorithm,
    // 全局设计 token：颜色、圆角、字号、控件高度
    token: {
      // 主色跟随系统设置里的品牌色
      colorPrimary: color,
      // 成功色（启用状态、正向指标）
      colorSuccess: '#1F9D55',
      // 警告色（偏暖的橙棕，避免与主色冲突）
      colorWarning: '#C77A28',
      // 错误色
      colorError: '#D33A32',
      // 信息色与主色一致
      colorInfo: color,
      // 主文本色（暖黑）
      colorText: '#1C1917',
      // 次级文本
      colorTextSecondary: '#5D5751',
      // 三级文本 / 占位
      colorTextTertiary: '#A8A29C',
      // 页面底色（暖白）
      colorBgLayout: '#F7F5F2',
      // 卡片 / 容器底色
      colorBgContainer: '#FFFFFF',
      // 常规描边
      colorBorder: '#EDE8E2',
      // 次级描边（表格分隔线）
      colorBorderSecondary: '#F4F1ED',
      // 基础圆角
      borderRadius: 8,
      // 大圆角（卡片、抽屉）
      borderRadiusLG: 14,
      // 小圆角（标签、输入框内元素）
      borderRadiusSM: 6,
      // 基础字号（略小于默认 14，界面更紧凑）
      fontSize: 13.5,
      // 字体栈：优先系统字体与中文黑体
      fontFamily:
        '-apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif',
      // 常规控件高度
      controlHeight: 34,
      // 大号控件高度（主按钮、搜索框）
      controlHeightLG: 42,
    },
    // 组件级定制：覆盖 antd 各组件默认样式
    components: {
      // 按钮：主按钮带主色阴影、字重 500
      Button: { primaryShadow: `0 1px 2px ${rgba(0.25)}`, fontWeight: 500 },
      // 表格：暖白表头、悬浮行浅暖底、细分隔线、加大单元内边距
      Table: {
        headerBg: '#FBFAF8',
        rowHoverBg: '#FFFBF8',
        borderColor: '#F4F1ED',
        cellPaddingBlock: 12,
        // 去掉表头右侧的竖向分割线
        headerSplitColor: 'transparent',
      },
      // 菜单：选中项用浅主色底 + 深主色字，去掉左侧 active 竖条
      Menu: {
        itemSelectedBg: soft,
        itemSelectedColor: ink,
        itemHeight: 40,
        itemMarginInline: 8,
        // 分组标题用小号灰字
        groupTitleColor: '#A8A29C',
        groupTitleFontSize: 11,
        // 0 表示不显示左侧激活条（视觉更干净）
        activeBarWidth: 0,
      },
      // 卡片：统一大内边距
      Card: { paddingLG: 20 },
      // 输入框：聚焦时主色光晕而非默认蓝色
      Input: { activeShadow: `0 0 0 3px ${rgba(0.10)}` },
      // 分页：激活页码实心主色底
      Pagination: { itemActiveBg: color, itemSize: 30 },
      // 开关：开启态用成功绿，与「启用」语义一致
      Switch: { colorPrimary: '#1F9D55' },
    },
  };
}

/** 兼容旧引用：默认暖橙主题的现成对象（组件里可直接传给 ConfigProvider） */
export const Theme = createTheme('#F5611D');

/**
 * 把主题色同步写入 CSS 变量
 * 用途：SCSS / 内联样式里无法拿到 antd token，用 var(--primary) 这类变量统一取色
 * @param {string} color - 主色，默认暖橙
 */
export function applyCssVars(color = '#F5611D') {
  // 根节点上写入变量，全站样式都能继承
  const root = document.documentElement;
  // 主色
  root.style.setProperty('--primary', color);
  // 悬停态主色（略压暗）
  root.style.setProperty('--primary-hover', shadeColor(color, 0.10));
  // 深主色（强调文字）
  root.style.setProperty('--primary-ink', shadeColor(color, 0.28));
  // 浅主色底（选中背景）
  root.style.setProperty('--primary-soft', mixWhite(color, 0.92));
  // 主色描边（浅色边框）
  root.style.setProperty('--primary-line', mixWhite(color, 0.72));
}
