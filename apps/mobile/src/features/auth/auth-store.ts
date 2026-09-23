import { create } from 'zustand';
import { secureStorage } from '@/shared/storage/secure-storage';
import type { User } from '@/shared/api-client/api';

const TOKEN_KEY = 'memora_access_token';
const REFRESH_TOKEN_KEY = 'memora_refresh_token';
const USER_KEY = 'memora_user';

type AuthState = {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  hydrated: boolean;
  restore: () => Promise<void>;
  signIn: (token: string, refreshToken: string, user: User) => Promise<void>;
  setTokens: (token: string, refreshToken: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  refreshToken: null,
  user: null,
  hydrated: false,

  restore: async () => {
    try {
      const [token, refreshToken, rawUser] = await Promise.all([
        secureStorage.getItem(TOKEN_KEY),
        secureStorage.getItem(REFRESH_TOKEN_KEY),
        secureStorage.getItem(USER_KEY),
      ]);

      set({
        token,
        refreshToken,
        user: rawUser ? JSON.parse(rawUser) : null,
        hydrated: true,
      });
    } catch {
      set({ token: null, refreshToken: null, user: null, hydrated: true });
    }
  },

  signIn: async (token, refreshToken, user) => {
    await Promise.all([
      secureStorage.setItem(TOKEN_KEY, token),
      secureStorage.setItem(REFRESH_TOKEN_KEY, refreshToken),
      secureStorage.setItem(USER_KEY, JSON.stringify(user)),
    ]);
    set({ token, refreshToken, user });
  },

  setTokens: async (token, refreshToken) => {
    await Promise.all([
      secureStorage.setItem(TOKEN_KEY, token),
      secureStorage.setItem(REFRESH_TOKEN_KEY, refreshToken),
    ]);
    set({ token, refreshToken });
  },

  signOut: async () => {
    await Promise.all([
      secureStorage.deleteItem(TOKEN_KEY),
      secureStorage.deleteItem(REFRESH_TOKEN_KEY),
      secureStorage.deleteItem(USER_KEY),
    ]);
    set({ token: null, refreshToken: null, user: null });
  },
}));
