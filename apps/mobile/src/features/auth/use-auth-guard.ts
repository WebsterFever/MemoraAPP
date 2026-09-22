import { useEffect } from 'react';
import { router } from 'expo-router';
import { useAuthStore } from './auth-store';

/**
 * Screens that read `token` directly off the store race the async
 * `restore()` call in the root layout: on a fresh page load (refresh, deep
 * link, or a test driving `page.goto` instead of in-app navigation),
 * `token` starts out `null` until SecureStore/localStorage finishes
 * resolving, so an unguarded screen fires its first API call unauthenticated
 * and gets a 401 before the real session ever loads. This hook makes screens
 * wait for `hydrated` before treating the user as logged out.
 */
export function useAuthGuard() {
  // Two primitive selectors rather than one object-returning selector — an
  // object literal is a new reference every render, which would defeat
  // Zustand's default reference-equality check and re-render on every store
  // update regardless of whether token/hydrated actually changed.
  const token = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);

  useEffect(() => {
    if (hydrated && !token) router.replace('/login' as any);
  }, [hydrated, token]);

  return { token, ready: hydrated && !!token };
}
