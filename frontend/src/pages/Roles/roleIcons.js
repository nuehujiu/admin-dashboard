/**
 * 角色卡图标与配色
 *
 * 这里只定义「可选什么」：
 *   - 某个角色具体用哪个图标 / 哪个颜色，存在数据库 roles.icon / roles.color 里
 *   - 页面上「编辑角色」弹窗会从下面的清单里让你选，选完保存到后端
 * 想增加可选项，只往 ICON_OPTIONS / COLOR_OPTIONS 里加一条即可。
 */
// 可选的 12 个图标组件（与下方 ICON_OPTIONS 一一对应）
import {
  SafetyOutlined, // 安全盾
  CrownOutlined, // 皇冠
  BarChartOutlined, // 数据
  ShopOutlined, // 商品
  TeamOutlined, // 团队
  UserOutlined, // 用户
  KeyOutlined, // 钥匙
  LockOutlined, // 权限
  SettingOutlined, // 设置
  AppstoreOutlined, // 应用
  StarOutlined, // 星标
  EyeOutlined, // 访客
} from '@ant-design/icons';

/** 可选图标：name 存进 roles.icon，component 用于渲染 */
export const ICON_OPTIONS = [
  { name: 'Safety', label: '安全盾', component: SafetyOutlined },
  { name: 'Crown', label: '皇冠', component: CrownOutlined },
  { name: 'BarChart', label: '数据', component: BarChartOutlined },
  { name: 'Shop', label: '商品', component: ShopOutlined },
  { name: 'Team', label: '团队', component: TeamOutlined },
  { name: 'User', label: '用户', component: UserOutlined },
  { name: 'Key', label: '钥匙', component: KeyOutlined },
  { name: 'Lock', label: '权限', component: LockOutlined },
  { name: 'Setting', label: '设置', component: SettingOutlined },
  { name: 'Appstore', label: '应用', component: AppstoreOutlined },
  { name: 'Star', label: '星标', component: StarOutlined },
  { name: 'Eye', label: '访客', component: EyeOutlined },
];

/** 可选主色：存进 roles.color，图标底色由它自动派生 */
export const COLOR_OPTIONS = [
  { value: '#F5611D', label: '品牌橙' },
  { value: '#2F8F86', label: '青色' },
  { value: '#C77A28', label: '土黄' },
  { value: '#1F9D55', label: '绿色' },
  { value: '#D33A32', label: '红色' },
  { value: '#5B6B8C', label: '蓝灰' },
  { value: '#8B5CF6', label: '紫色' },
  { value: '#A8A29C', label: '中性灰' },
];

// 图标名 → 图标组件 的查找表；渲染时按名字 O(1) 取组件
const ICON_MAP = new Map(ICON_OPTIONS.map((item) => [item.name, item.component]));

/** 老数据里没有 icon / color 时，按 code 兜底，视觉和原来一致 */
const CODE_FALLBACK = {
  admin: 'Safety', // 管理员 → 安全盾
  operator: 'BarChart', // 运营 → 数据
  'goods-editor': 'Shop', // 商品编辑 → 商品
  guest: 'Eye', // 访客 → 眼睛
};

// 兜底颜色：中性灰（未配置配色时使用）
const FALLBACK_COLOR = '#A8A29C';

/**
 * 主色 → 图标底色（同色系 12% 透明度）
 * 这样只需要存一个 color，不用额外存 bg
 */
export const softBg = (hex, alpha = 0.12) => {
  const clean = String(hex || '').replace('#', '');
  if (clean.length !== 6) return 'rgba(168, 162, 156, 0.12)';
  const n = parseInt(clean, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/**
 * 取角色卡要用的图标组件和配色
 * @param {{icon?: string, color?: string, code?: string}} role 角色对象
 * @returns {{Icon: React.ComponentType, color: string, bg: string}}
 */
export const getRoleIcon = (role) => {
  const iconName = role?.icon || CODE_FALLBACK[role?.code];
  const Icon = ICON_MAP.get(iconName) || EyeOutlined;
  const color = role?.color || FALLBACK_COLOR;
  return { Icon, color, bg: softBg(color) };
};
