// 引入所需钩子：Suspense 用于懒加载占位，useEffect/useMemo 处理副作用与派生数据
import { Suspense, useEffect, useMemo } from 'react';
// 引入路由相关：Outlet 渲染子路由，useLocation 取当前路径，useNavigate 做跳转
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
// 引入集中路由配置，用于推导侧栏菜单项
import { routes } from '../router/routes.jsx';
// 引入样式模块
import s from './Layout.module.scss';
// 引入用户仓库（用户信息、菜单、权限、折叠状态）
import { useUserStore } from '../store/useUserStore';
// 引入默认可访问路径推导（403 页「回到可访问页面」用）
import { getDefaultMenuPath } from '../utils/permissions';
// 引入最近访问记录工具（全局搜索空态数据来源）
import { pushRecentPage } from '../utils/recentPages';
// 引入全局页面搜索组件
import GlobalSearch from '../components/GlobalSearch';
// 引入通知铃铛组件
import NoticeBell from '../components/NoticeBell';

// 菜单组件
import { Menu } from 'antd';
// 菜单图标：与 routes 中 meta.icon 的键名一一对应
import {
  DashboardOutlined,
  BarChartOutlined,
  ShoppingOutlined,
  UserOutlined,
  TeamOutlined,
  SettingOutlined,
  LogoutOutlined,
  DownOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  IdcardOutlined,
} from '@ant-design/icons';
// 布局相关组件：面包屑、下拉、头像、主题 token、结果页、按钮、加载指示
import {
  Breadcrumb,
  Dropdown,
  Avatar,
  theme,
  Result,
  Button,
  Spin,
} from 'antd';

/** 懒加载页面的占位视图：侧栏与顶栏已渲染，只等内容区就绪 */
function PageFallback() {
  return (
    <div className={s.pageLoad}>
      {/* 小型加载指示器 */}
      <Spin />
      {/* 辅助文案，说明是内容区在加载而非整页卡死 */}
      <span className={s.pageLoadText}>页面加载中…</span>
    </div>
  );
}

// 图标映射表：路由 meta.icon 字符串 → 图标组件
const ICONS = {
  dashboard: <DashboardOutlined />,
  'bar-chart': <BarChartOutlined />,
  shopping: <ShoppingOutlined />,
  user: <UserOutlined />,
  team: <TeamOutlined />,
  setting: <SettingOutlined />,
  idcard: <IdcardOutlined />,
};
// 路径 → 分组名映射：决定菜单归到哪个分组、面包屑显示什么
const GROUP_BY_PATH = {
  '/dashboard': '概览',
  '/sales': '概览',
  '/goods': '运营',
  '/system/users': '运营',
  '/system/roles': '系统',
  '/settings': '系统',
  '/profile': '系统',
};
// 分组的显示顺序（数组顺序即菜单渲染顺序）
const GROUP_ORDER = ['概览', '运营', '系统'];

/**
 * 页面列表缓存
 * 为什么延迟到首次渲染才读 routes：
 * Layout 本身由 routes.jsx import，若在模块顶层直接访问 routes，
 * 会撞上循环依赖的 TDZ 报错（此时 routes 尚未初始化完成）；
 * 缓存保证只构建一次、引用稳定，useMemo 的依赖比较才有意义
 */
let pagesCache = null;
const getPages = () => {
  // 首次调用时从根路由的 children 里取出所有带 path 的子页面
  if (!pagesCache) {
    pagesCache = (routes.find((r) => r.path === '/')?.children ?? []).filter(
      (r) => r.path,
    );
  }
  return pagesCache;
};

/**
 * 工作台外壳：侧栏 + 顶栏 + 内容区
 * 同时承担：菜单按权限过滤、面包屑、403 兜底、最近访问记录、折叠控制
 */
export default function Layout() {
  // 全量页面配置（已缓存）
  const allPages = getPages();
  // 当前路径，用于选中菜单、面包屑、403 判定
  const { pathname } = useLocation();
  // 取主题 token（这里用三级文本色给下拉箭头着色）
  const { token } = theme.useToken();
  // 当前用户信息
  const user = useUserStore((s) => s.user);
  // 当前用户菜单（后端返回，含 path）
  const menus = useUserStore((s) => s.menus);
  // 当前用户权限点
  const permissions = useUserStore((s) => s.permissions);
  // 系统设置（品牌名、slogan、默认折叠等）
  const settings = useUserStore((s) => s.settings);
  // 本次会话手动切换的折叠态（null 表示未手动切换过）
  const siderFolded = useUserStore((s) => s.siderFolded);
  // 折叠切换动作
  const toggleSider = useUserStore((s) => s.toggleSider);
  // 实际生效的折叠态：手动值优先，其次看系统设置（siderCollapsed === 1 即折叠）
  const collapsed = siderFolded ?? settings.siderCollapsed === 1;
  // 登出动作
  const logout = useUserStore((s) => s.logout);
  // 路由跳转函数
  const navigate = useNavigate();

  // 当前页面所属分组，用于面包屑第一级
  const group = GROUP_BY_PATH[pathname];

  /** 侧栏可见页面：三重过滤 —— 后端菜单里有该 path + 非 hidden + 权限点满足 */
  const visiblePages = useMemo(() => {
    return allPages.filter((r) => {
      // 1) 明示隐藏的路由不进菜单
      if (r.meta?.hidden) return false;
      // 2) 后端下发的菜单里没有这个路径，说明当前角色不可见
      if (!menus.some((m) => m.path === r.path)) return false;
      // 3) 路由声明了权限点时，必须命中当前用户权限，
      //    未声明权限视为公开页面直接放行
      const perm = r.meta?.permission;
      return !perm || permissions.includes(perm);
    });
    // 依赖全量页面、菜单与权限，任一变化都重算
  }, [allPages, menus, permissions]);

  /** 组装 antd Menu 的 items：按分组顺序输出 group，再放入该组的页面 */
  const menuItems = useMemo(() => {
    return GROUP_ORDER.map((g) => ({
      // group 类型在 antd Menu 中渲染为不可点击的分组标题
      type: 'group',
      // 分组标题文案
      label: g,
      // 该分组下的页面项；未在映射表里的路径默认归到「概览」
      children: visiblePages
        .filter((r) => (GROUP_BY_PATH[r.path] ?? '概览') === g)
        .map((r) => ({
          // key 用 path，便于 selectedKeys 与点击跳转直接复用
          key: r.path,
          // 按 meta.icon 取图标，未知类型给 null（antd 会忽略）
          icon: ICONS[r.meta?.icon] ?? null,
          // 菜单文字用路由 name
          label: r.name,
        })),
    })).filter((g) => g.children.length); // 空分组不渲染，避免出现无内容的分组标题
  }, [visiblePages]);

  /** 全局搜索的数据源：当前有权限访问的页面（含分组名，便于结果里显示归属） */
  const searchItems = useMemo(
    () =>
      visiblePages.map((r) => ({
        path: r.path,
        name: r.name,
        group: GROUP_BY_PATH[r.path] ?? '概览',
        icon: ICONS[r.meta?.icon] ?? null,
      })),
    [visiblePages],
  );

  /** 记录最近访问：只在命中已知路由时写入，避免把 404 之类的脏路径记进去 */
  useEffect(() => {
    // 判断当前路径是否属于配置内的页面
    const known = allPages.some((r) => r.path === pathname);
    // 命中则写入本地最近访问（供全局搜索空态展示）
    if (known) pushRecentPage(pathname);
  }, [pathname, allPages]);

  /** 当前路径对应的路由配置；找不到说明是 404 或未声明页面 */
  const route = allPages.find((r) => r.path === pathname);
  /** 是否越权访问：路由声明了权限点但当前用户不具备（手输 URL 也能挡住） */
  const denied = !!(
    route?.meta?.permission && !permissions.includes(route.meta.permission)
  );

  /** 面包屑：有分组时显示「分组 / 页面」，否则只显示页面名，兜底显示「概览」 */
  const crumbs = route
    ? group
      ? [{ title: group }, { title: route.name }]
      : [{ title: route.name }]
    : [{ title: '概览' }];

  /** 用户下拉菜单点击：目前只有退出登录一项 */
  const onUserMenu = ({ key }) => {
    if (key === 'logout') {
      // 先清空登录态（token / 用户 / 菜单 / 权限）
      logout();
      // 再跳到登录页
      navigate('/login');
    }
  };

  return (
    // 整体两栏布局：左侧固定侧栏 + 右侧主区域
    <div className={s.app}>
      {/* 侧栏：折叠时追加 collapsed 类名，宽度与文字显隐由样式控制 */}
      <aside className={`${s.sider} ${collapsed ? s.siderCollapsed : ''}`}>
        {/* 品牌区：logo 方块 + 系统名 / slogan */}
        <div className={s.brand}>
          {/* 固定字形的 logo 占位（真实项目可换成图片） */}
          <div className={s.brandLogo}>H</div>
          {/* 品牌文字始终渲染，折叠时靠 brandTextCollapsed 淡出，过渡动画才有效果 */}
          <div className={`${s.brandText} ${collapsed ? s.brandTextCollapsed : ''}`}>
            {/* 系统名：超长时 title 提供悬浮完整提示 */}
            <div className={s.brandName} title={settings.systemName}>
              {settings.systemName}
            </div>
            {/* slogan 为空时不占位，避免空白行 */}
            {settings.slogan && (
              <div className={s.brandSub} title={settings.slogan}>
                {settings.slogan}
              </div>
            )}
          </div>
        </div>
        {/* 菜单区：包一层容器便于独立滚动 */}
        <div className={s.menuWarp}>
          <Menu
            // inline 模式：垂直菜单
            mode="inline"
            // 折叠时 antd 会自动只显示图标
            inlineCollapsed={collapsed}
            // 上面按分组组装好的菜单项
            items={menuItems}
            // 选中态跟着当前路径走，刷新后仍高亮正确项
            selectedKeys={[pathname]}
            // 点击菜单直接跳转对应 path
            onClick={({ key }) => navigate(key)}
            // 去掉右侧分隔边框，背景透明以融入侧栏底色
            style={{ borderInlineEnd: 'none', background: 'transparent' }}
          ></Menu>
        </div>
        {/* 角色信息卡：折叠时隐藏（空间不足，且属于次要信息） */}
        {!collapsed && (
          <div className={s.roleCard}>
            <p>当前角色</p>
            <strong>
              {/* 角色展示名 + 当前可见菜单数量，便于快速确认权限范围 */}
              {user?.role_name || '—'} · {visiblePages.length} 项菜单
            </strong>
          </div>
        )}
      </aside>

      {/* 右侧主区域 */}
      <div className={s.main}>
        {/* 顶栏：折叠开关 + 面包屑 + 搜索 + 通知 + 用户下拉 */}
        <header className={s.header}>
          {/* 折叠开关：图标随状态切换，触发 store 的 toggleSider */}
          <button
            type="button"
            className={s.iconBtn}
            // 无障碍标签与悬浮提示随状态变化，避免读屏器文案失真
            aria-label={collapsed ? '展开侧栏' : '折叠侧栏'}
            title={collapsed ? '展开侧栏' : '折叠侧栏'}
            onClick={toggleSider}
          >
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </button>
          {/* 当前位置的面包屑 */}
          <Breadcrumb items={crumbs} />
          {/* 弹性占位，把右侧操作组推到行尾 */}
          <div className={s.grow} />
          {/* 全局页面搜索（Ctrl+K） */}
          <GlobalSearch items={searchItems} onSelect={navigate} />
          {/* 通知铃铛：内容由后端按权限派生 */}
          <NoticeBell />
          {/* 用户下拉：点击头像区域展开，目前只含退出登录 */}
          <Dropdown
            placement="bottomRight"
            menu={{
              onClick: onUserMenu,
              items: [
                {
                  key: 'logout',
                  label: '退出登录',
                  icon: <LogoutOutlined />,
                  // danger 让该项显示为红色，提示是破坏性操作
                  danger: true,
                },
              ],
            }}
          >
            {/* 用户信息胶囊：头像 + 昵称 + 角色 + 下拉箭头 */}
            <div className={s.userChip}>
              <Avatar
                size={30}
                // 有头像地址才传 src，undefined 时退回文字头像
                src={user?.avatar || undefined}
                // 文字头像的底色用主色 CSS 变量，跟随主题
                style={{ background: 'var(--primary)', fontSize: 13 }}
              >
                {/* 取昵称或用户名的首字符作为文字头像 */}
                {(user?.nickname || user?.username || '?').slice(0, 1)}
              </Avatar>
              <div>
                {/* 显示名：昵称优先，其次用户名，兜底「未登录」 */}
                <div className={s.userName}>
                  {user?.nickname || user?.username || '未登录'}
                </div>
                {/* 角色名，缺失时用破折号占位 */}
                <div className={s.userRole}>{user?.role_name || '—'}</div>
              </div>
              {/* 下拉箭头：用主题三级文本色，弱化存在感 */}
              <DownOutlined
                style={{ fontSize: 10, color: token.colorTextTertiary }}
              />
            </div>
          </Dropdown>
        </header>

        {/* 内容区：越权时展示 403 页面，否则渲染子路由 */}
        <div className={s.content}>
          {denied ? (
            <Result
              status="403"
              title="403"
              // 说明具体角色，便于用户理解为何被拦截
              subTitle={`当前角色（${user?.role_name || '未知'}）没有访问该页面的权限`}
              extra={
                // 提供一键回到「自己有权访问的页面」的出口
                <Button
                  type="primary"
                  onClick={() => navigate(getDefaultMenuPath(menus))}
                >
                  回到可访问页面
                </Button>
              }
            />
          ) : (
            // 懒加载页面就绪前展示占位，避免内容区空白闪烁
            <Suspense fallback={<PageFallback />}>
              <Outlet />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}
