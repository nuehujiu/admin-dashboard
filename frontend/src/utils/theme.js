import { theme as antdTheme } from 'antd';

// 开发文档 9.7 的 token + 组件级覆盖
export const Theme = {
  algorithm: antdTheme.defaultAlgorithm,
  token: {
    colorPrimary: '#F5611D',
    colorSuccess: '#1F9D55',
    colorWarning: '#C77A28',
    colorError: '#D33A32',
    colorInfo: '#F5611D',
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
    Button: { primaryShadow: '0 1px 2px rgba(244,97,29,.25)', fontWeight: 500 },
    Table: {
      headerBg: '#FBFAF8',
      rowHoverBg: '#FFFBF8',
      borderColor: '#F4F1ED',
      cellPaddingBlock: 12,
      headerSplitColor: 'transparent',
    },
    Menu: {
      itemSelectedBg: '#FFF2EA',
      itemSelectedColor: '#B9400A',
      itemHeight: 40,
      itemMarginInline: 8,
      groupTitleColor: '#A8A29C',
      groupTitleFontSize: 11,
      activeBarWidth: 0, // 去掉选中项左侧那条竖线
    },
    Card: { paddingLG: 20 },
    Input: { activeShadow: '0 0 0 3px rgba(245,97,29,.10)' },
    Pagination: { itemActiveBg: '#F5611D', itemSize: 30 },
    Switch: { colorPrimary: '#1F9D55' }, // 设计稿开关是绿色，不是橙色
  },
};
