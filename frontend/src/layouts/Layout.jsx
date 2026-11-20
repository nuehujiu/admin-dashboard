import { Suspense, useEffect, useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { routes } from '../router/routes.jsx';
import s from './Layout.module.scss';
import { useUserStore } from '../store/useUserStore';
import { getDefaultMenuPath } from '../utils/permissions';
import { pushRecentPage } from '../utils/recentPages';
import GlobalSearch from '../components/GlobalSearch';
import NoticeBell from '../components/NoticeBell';

import { Menu } from 'antd';
import {
  DashboardOutlined, BarChartOutlined, ShoppingOutlined, UserOutlined,
  TeamOutlined, SettingOutlined,
  LogoutOutlined, DownOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, IdcardOutlined,
} from '@ant-design/icons';
import { Breadcrumb, Dropdown, Avatar, theme, Result, Button, Spin } from 'antd';

/** 懒加载页面的占位：侧栏与顶栏已在，只等内容区 */
function PageFallback() {
  return (
    <div className={s.pageLoad}>
      <Spin />
      <span className={s.pageLoadText}>页面加载中…</span>
    </div>
  );
}

const ICONS = {
  dashboard: <DashboardOutlined />, 'bar-chart': <BarChartOutlined />,
  shopping: <ShoppingOutlined />, user: <UserOutlined />,
  team: <TeamOutlined />, setting: <SettingOutlined />,
  idcard: <IdcardOutlined />,
};
const GROUP_BY_PATH = {
  '/dashboard': '概览', '/sales': '概览', '/goods': '运营',
  '/system/users': '运营', '/system/roles': '系统', '/settings': '系统',
  '/profile': '系统',
};
const GROUP_ORDER = ['概览', '运营', '系统'];

/**
 * 页面列表缓存：延迟到首次渲染时才读 routes
 * Layout 由 routes.jsx import，若在模块顶层直接访问 routes 会撞上循环依赖的 TDZ 报错；
 * 缓存保证只建一次、引用稳定，useMemo 才有效
 */
let pagesCache = null;
const getPages = () => {
  if (!pagesCache) {
    pagesCache = (routes.find((r) => r.path === '/')?.children ?? []).filter(
      (r) => r.path,
    );
  }
  return pagesCache;
};

export default function Layout() {
  const allPages = getPages();
  const { pathname } = useLocation();
  const { token } = theme.useToken();
  const user = useUserStore((s) => s.user);
  const menus = useUserStore((s) => s.menus);
  const permissions = useUserStore((s) => s.permissions);
  // 侧栏折叠：手动切换的会话态优先，否则跟随系统设置里的默认折叠
  const settings = useUserStore((s) => s.settings);
  const siderFolded = useUserStore((s) => s.siderFolded);
  const toggleSider = useUserStore((s) => s.toggleSider);
  const collapsed = siderFolded ?? settings.siderCollapsed === 1;
  const logout = useUserStore((s) => s.logout);
  const navigate = useNavigate();

  const group = GROUP_BY_PATH[pathname];

  /** 侧栏可见页面：后端菜单里有这个 path + 非 hidden + 权限点满足 */
  const visiblePages = useMemo(() => {
    return allPages.filter((r) => {
      if (r.meta?.hidden) return false;
      if (!menus.some((m) => m.path === r.path)) return false;
      const perm = r.meta?.permission;
      return !perm || permissions.includes(perm);
    });
  }, [allPages, menus, permissions]);

  const menuItems = useMemo(() => {
    return GROUP_ORDER.map((g) => ({
      type: 'group',
      label: g,
      children: visiblePages
        .filter((r) => (GROUP_BY_PATH[r.path] ?? '概览') === g)
        .map((r) => ({ key: r.path, icon: ICONS[r.meta?.icon] ?? null, label: r.name })),
    })).filter((g) => g.children.length);
  }, [visiblePages]);

  /** 全局搜索的数据源：有权限访问的页面 */
  const searchItems = useMemo(
    () => visiblePages.map((r) => ({
      path: r.path,
      name: r.name,
      group: GROUP_BY_PATH[r.path] ?? '概览',
      icon: ICONS[r.meta?.icon] ?? null,
    })),
    [visiblePages],
  );

  /** 记录最近访问（全局搜索的空态用） */
  useEffect(() => {
    const known = allPages.some((r) => r.path === pathname);
    if (known) pushRecentPage(pathname);
  }, [pathname, allPages]);

  /** 当前页面是否可访问（手输 URL 也挡） */
  const route = allPages.find((r) => r.path === pathname);
  const denied = !!(route?.meta?.permission && !permissions.includes(route.meta.permission));

  const crumbs = route
    ? group ? [{ title: group }, { title: route.name }] : [{ title: route.name }]
    : [{ title: '概览' }];

  const onUserMenu = ({ key }) => {
    if (key === 'logout') {
      logout();
      navigate('/login');
    }
  };

  return (
    <div className={s.app}>
      <aside className={`${s.sider} ${collapsed ? s.siderCollapsed : ''}`}>
        <div className={s.brand}>
          <div className={s.brandLogo}>H</div>
          {!collapsed && (
            <div className={s.brandText}>
              <div className={s.brandName}>houtai</div>
              {/* 副标题跟随系统设置里的「系统名称」 */}
              <div className={s.brandSub} title={settings.systemName}>
                {settings.systemName}
              </div>
            </div>
          )}
        </div>
        <div className={s.menuWarp}>
          <Menu
            mode="inline"
            inlineCollapsed={collapsed}
            items={menuItems}
            selectedKeys={[pathname]}
            onClick={({ key }) => navigate(key)}
            style={{ borderInlineEnd: 'none', background: 'transparent' }}
          ></Menu>
        </div>
        {!collapsed && (
          <div className={s.roleCard}>
            <p>当前角色</p>
            <strong>
              {user?.role_name || '—'} · {visiblePages.length} 项菜单
            </strong>
          </div>
        )}
      </aside>

      <div className={s.main}>
        <header className={s.header}>
          {/* 折叠开关 */}
          <button
            type="button"
            className={s.iconBtn}
            aria-label={collapsed ? '展开侧栏' : '折叠侧栏'}
            title={collapsed ? '展开侧栏' : '折叠侧栏'}
            onClick={toggleSider}
          >
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </button>
          <Breadcrumb items={crumbs} />
          <div className={s.grow} />
          {/* 全局页面搜索（Ctrl+K） */}
          <GlobalSearch items={searchItems} onSelect={navigate} />
          {/* 通知：内容由后端按权限派生 */}
          <NoticeBell />
          <Dropdown
            placement="bottomRight"
            menu={{
              onClick: onUserMenu,
              items: [
                { key: 'logout', label: '退出登录', icon: <LogoutOutlined />, danger: true },
              ],
            }}
          >
            <div className={s.userChip}>
              <Avatar
                size={30}
                src={user?.avatar || undefined}
                style={{ background: 'var(--primary)', fontSize: 13 }}
              >
                {(user?.nickname || user?.username || '?').slice(0, 1)}
              </Avatar>
              <div>
                <div className={s.userName}>{user?.nickname || user?.username || '未登录'}</div>
                <div className={s.userRole}>{user?.role_name || '—'}</div>
              </div>
              <DownOutlined style={{ fontSize: 10, color: token.colorTextTertiary }} />
            </div>
          </Dropdown>
        </header>

        <div className={s.content}>
          {denied ? (
            <Result
              status="403"
              title="403"
              subTitle={`当前角色（${user?.role_name || '未知'}）没有访问该页面的权限`}
              extra={
                <Button type="primary" onClick={() => navigate(getDefaultMenuPath(menus))}>
                  回到可访问页面
                </Button>
              }
            />
          ) : (
            <Suspense fallback={<PageFallback />}>
              <Outlet />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}
