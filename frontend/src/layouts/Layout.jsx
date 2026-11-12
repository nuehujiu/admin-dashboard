import { useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { routes } from '../router/routes.jsx';
import s from './Layout.module.scss';
import '../styles/index.scss';

import { Menu } from 'antd';
import {
  DashboardOutlined,
  BarChartOutlined,
  ShoppingOutlined,
  UserOutlined,
  TeamOutlined,
  SettingOutlined,
  SearchOutlined,
  BellOutlined,
  ProfileOutlined,
  LogoutOutlined,
  DownOutlined,
} from '@ant-design/icons';
import { Breadcrumb, Dropdown, Avatar, theme } from 'antd';

const ICONS = {
  dashboard: <DashboardOutlined />,
  'bar-chart': <BarChartOutlined />,
  shopping: <ShoppingOutlined />,
  user: <UserOutlined />,
  team: <TeamOutlined />,
  setting: <SettingOutlined />,
};
const GROUP_BY_PATH = {
  '/dashboard': '概览',
  '/sales': '概览',
  '/goods': '运营',
  '/system/users': '运营',
  '/system/roles': '系统',
  '/settings': '系统',
};
const GROUP_ORDER = ['概览', '运营', '系统'];

/**
 * Layout组件
 * 作为应用程序的主要布局容器，包含页面标题和内容区域
 */
export default function Layout() {
  // 获取当前路径
  const { pathname } = useLocation();
  const { token } = theme.useToken();
  const group = GROUP_BY_PATH[pathname];
  // 获取导航函数
  const navigate = useNavigate();
  // 使用 useMemo 缓存菜单项，避免不必要的重复计算
  // 获取所有页面路由，过滤掉隐藏的路由
  const allPages = (routes.find((r) => r.path === '/')?.children ?? []).filter(
    (r) => r.path,
  );
  const menuItems = useMemo(() => {
    // 根据分组顺序映射菜单项
    return GROUP_ORDER.map((group) => ({
      type: 'group', // 菜单项类型为分组
      label: group, // 分组标签
      children: allPages
        .filter(
          // 过滤掉隐藏的路由，并根据路径分组
          (r) => !r.meta?.hidden && (GROUP_BY_PATH[r.path] ?? '概览') === group,
        )
        .map((r) => ({
          key: r.path, // 菜单项的键为路径
          icon: ICONS[r.meta?.icon] ?? null, // 菜单项图标
          label: r.name, // 菜单项标签
        })),
    })).filter((g) => g.children.length); // 过滤掉没有子项的分组
  }, []); // 依赖数组为空，表示只在组件挂载时计算一次
  const active = allPages.find((r) => r.path === pathname);
  const crumbs = active
    ? group
      ? [{ title: group }, { title: active.name }]
      : [{ title: active.name }]
    : [{ tilte: '概览' }];

  /**
   * 处理用户菜单点击事件的函数
   * @param {Object} param - 包含菜单项key的对象
   * @param {string} param.key - 菜单项的标识值
   */
  const onUserMenu = ({ key }) => {
    // 如果点击的是个人资料菜单项
    if (key === 'profile') {
      // 导航到个人资料页面
      navigate('/profile');
    }
    // 如果点击的是退出登录菜单项
    if (key === 'logout') {
      // 导航到登录页面
      navigate('/login');
    }
  };
  return (
    <div className={s.app}>
      {/* 侧边栏 */}
      <aside className={s.sider}>
        {/* 侧边栏logo */}
        <div className={s.brand}>
          <div className={s.brandLogo}>H</div>
          <div>
            <div className={s.brandName}>houtai</div>
            <div className={s.brandSub}>商城后台</div>
          </div>
        </div>
        {/* 侧边栏菜单 */}
        <div className={s.menuWarp}>
          <Menu
            mode="inline"
            items={menuItems}
            selectedKeys={[pathname]}
            onClick={({ key }) => navigate(key)}
            style={{ borderInlineEnd: 'none', background: 'transparent' }}
          ></Menu>
        </div>
        <div className={s.roleCard}>
          <p>当前角色</p>
          <strong>超级管理员 · 全部权限</strong>
        </div>
      </aside>
      {/* 主内容区域 */}
      <div className={s.main}>
        <header className={s.header}>
          <Breadcrumb items={crumbs} />
          <div className={s.grow} />
          <div className={s.iconBtn}>
            <SearchOutlined />
          </div>
          <div className={s.iconBtn}>
            <BellOutlined />
          </div>
          <Dropdown
            placement="bottomRight"
            menu={{
              onClick: onUserMenu,
              items: [
                {
                  key: 'profile',
                  label: '个人中心',
                  icon: <ProfileOutlined />,
                },
                {
                  type: 'divider',
                },
                {
                  key: 'logout',
                  label: '退出登录',
                  icon: <LogoutOutlined />,
                  danger: true,
                },
              ],
            }}
          >
            <div className={s.userChip}>
              <Avatar
                size={30}
                style={{ background: 'var(--primary)', fontSize: 13 }}
              >
                陈
              </Avatar>
              <div>
                <div className={s.userName}>陈嘉禾</div>
                <div className={s.userRole}>超级管理员</div>
              </div>
              <DownOutlined
                style={{ fontSize: 10, color: token.colorTextTertiary }}
              />
            </div>
          </Dropdown>
        </header>
        <div className={s.content}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
