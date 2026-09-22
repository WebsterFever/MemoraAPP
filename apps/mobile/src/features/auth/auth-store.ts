import { create } from 'zustand';
import { secureStorage } from '@/shared/storage/secure-storage';
import type { User } from '@/shared/api-client/api';

const TOKEN_KEY = 'memora_access_token';
const USER_KEY = 'memora_user';

type AuthState = {
  token: string | null; user: User | null; hydrated: boolean;
  restore: () => Promise<void>; signIn: (token: string, user: User) => Promise<void>; signOut: () => Promise<void>;
};
export const useAuthStore = create<AuthState>((set) => ({
  token: null, user: null, hydrated: false,
  restore: async () => {
    try {
      const [token, rawUser] = await Promise.all([secureStorage.getItem(TOKEN_KEY), secureStorage.getItem(USER_KEY)]);
      set({ token, user: rawUser ? JSON.parse(rawUser) : null, hydrated: true });
    } catch { set({ token: null, user: null, hydrated: true }); }
  },
  signIn: async (token, user) => {
    await Promise.all([secureStorage.setItem(TOKEN_KEY, token), secureStorage.setItem(USER_KEY, JSON.stringify(user))]);
    set({ token, user });
  },
  signOut: async () => {
    await Promise.all([secureStorage.deleteItem(TOKEN_KEY), secureStorage.deleteItem(USER_KEY)]);
    set({ token: null, user: null });
  },
}));
