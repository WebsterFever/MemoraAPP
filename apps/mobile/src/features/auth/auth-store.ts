import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
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
      const [token, rawUser] = await Promise.all([SecureStore.getItemAsync(TOKEN_KEY), SecureStore.getItemAsync(USER_KEY)]);
      set({ token, user: rawUser ? JSON.parse(rawUser) : null, hydrated: true });
    } catch { set({ token: null, user: null, hydrated: true }); }
  },
  signIn: async (token, user) => {
    await Promise.all([SecureStore.setItemAsync(TOKEN_KEY, token), SecureStore.setItemAsync(USER_KEY, JSON.stringify(user))]);
    set({ token, user });
  },
  signOut: async () => {
    await Promise.all([SecureStore.deleteItemAsync(TOKEN_KEY), SecureStore.deleteItemAsync(USER_KEY)]);
    set({ token: null, user: null });
  },
}));
