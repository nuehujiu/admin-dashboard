import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useUserStore = create(
  persist(
    (set) => ({
      token: '',
      user: null,
      menus: [],
      permissions: [],
      settings: {
        systemName: '电商后台管理系统',
        slogan: '',
        notice: '',
        themeColor: '#F5611D',
        siderCollapsed: 0,
      },
      setAuth: ({ token, user }) => set({ token, user }),
      setProfile: ({ user, menus, permissions }) =>
        set({ user, menus, permissions }),
      setSettings: (next) =>
        set((state) => ({ settings: { ...state.settings, ...next } })),
      /*
       * 侧栏折叠：null = 跟随系统设置里的「默认折叠」，
       * true / false = 本次会话在头部手动切换过
       */
      siderFolded: null,
      toggleSider: () =>
        set((state) => ({
          siderFolded: !(state.siderFolded ?? state.settings.siderCollapsed === 1),
        })),
      logout: () =>
        set({
          token: '',
          user: null,
          menus: [],
          permissions: [],
          siderFolded: null,
        }),
    }),
    {
      name: 'houtai-auth',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
      }),
    },
  ),
);
