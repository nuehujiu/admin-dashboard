import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useUserStore = create(
  persist(
    (set) => ({
      token: '',
      user: null,
      menus: [],
      permissions: [],
      setAuth: ({ token, user }) => set({ token, user }),
      setProfile: ({ user, menus, permissions }) =>
        set({ user, menus, permissions }),
      logout: () => set({ token: '', user: null, menus: [], permissions: [] }),
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
