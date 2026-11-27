// 引入 zustand 的 create，用于创建轻量的全局状态仓库
import { create } from 'zustand';
// 引入持久化中间件：把指定字段自动写入浏览器存储，并在启动时恢复
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * 用户 / 鉴权 / 系统设置 的全局仓库
 * 设计要点：
 * - 只持久化 token 与 user（见下方 partialize），菜单、权限每次登录重新拉取，避免过期数据；
 * - 折叠状态分两层：settings.siderCollapsed 是系统默认，siderFolded 是本次会话的手动选择。
 */
export const useUserStore = create(
  // 用 persist 包裹，使仓库具备落盘与恢复能力
  persist(
    // 仓库本体：set 用于更新状态
    (set) => ({
      // 当前登录 token（空串表示未登录）
      token: '',
      // 当前用户信息（昵称、头像、角色等）
      user: null,
      // 当前用户可见的菜单树
      menus: [],
      // 当前用户拥有的权限点数组
      permissions: [],
      // 系统设置：登录页与侧栏品牌区都会用到
      settings: {
        // 系统名称（登录页标题、侧栏品牌文字）
        systemName: '电商后台管理系统',
        // 副标题 / slogan
        slogan: '',
        // 公告文案
        notice: '',
        // 品牌主色，决定主题与 CSS 变量
        themeColor: '#F5611D',
        // 侧栏默认是否折叠：1 折叠 / 0 展开
        siderCollapsed: 0,
      },

      /**
       * 登录成功后写入鉴权信息
       * @param {{ token: string, user: object }} payload
       */
      setAuth: ({ token, user }) => set({ token, user }),

      /**
       * 拉取到个人资料后，同步用户、菜单、权限三类数据
       * @param {{ user: object, menus: object[], permissions: string[] }} payload
       */
      setProfile: ({ user, menus, permissions }) =>
        set({ user, menus, permissions }),

      /**
       * 合并式更新系统设置（只覆盖传入的字段，其余保持原值）
       * @param {object} next - 需要变更的设置字段
       */
      setSettings: (next) =>
        set((state) => ({ settings: { ...state.settings, ...next } })),

      /*
       * 侧栏折叠状态：
       * null  = 跟随系统设置里的「默认折叠」；
       * true / false = 本次会话在头部手动切换过的结果
       */
      siderFolded: null,

      /**
       * 切换侧栏折叠状态
       * 首次点击时以「当前生效值」为基准取反，避免与默认设置冲突
       */
      toggleSider: () =>
        set((state) => ({
          // 当前生效值 = 手动值 ?? 系统默认（siderCollapsed === 1 视为折叠）
          siderFolded: !(state.siderFolded ?? state.settings.siderCollapsed === 1),
        })),

      /**
       * 登出：清空所有与会话相关的状态，折叠偏好也一并复位
       */
      logout: () =>
        set({
          token: '',
          user: null,
          menus: [],
          permissions: [],
          siderFolded: null,
        }),
    }),
    // 持久化配置
    {
      // 存储键名
      name: 'houtai-auth',
      // 存 sessionStorage：关闭标签页即失效，降低共用设备上的 token 残留风险
      storage: createJSONStorage(() => sessionStorage),
      // 只持久化必要字段：token 与 user。
      // 菜单 / 权限 / 设置不落盘，避免权限变更后旧缓存继续生效
      partialize: (state) => ({
        token: state.token,
        user: state.user,
      }),
    },
  ),
);
