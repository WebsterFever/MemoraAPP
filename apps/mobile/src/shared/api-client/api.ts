import { useAuthStore } from '@/features/auth/auth-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export type User = { id: string; email: string; displayName: string; preferredLanguage: string };
export type AuthResponse = { user: User; accessToken: string; refreshToken: string };
type RefreshResponse = { accessToken: string; refreshToken: string };
export type Family = { id: string; name: string; ownerUserId: string; profiles?: MemoryProfile[] };
export type Memory = { id: string; familyId: string; profileId?: string; title: string; story: string; occurredAt?: string; createdAt: string; updatedAt: string; profile?: MemoryProfile };
export type MemoryProfile = { id: string; familyId: string; displayName: string; relationship?: string; preferredLanguage: string; spokenLanguages: string[]; biography?: string; status: string };

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof data === 'object' && data !== null && 'message' in data
        ? String((data as { message?: unknown }).message || 'Something went wrong')
        : 'Something went wrong';
    throw new Error(message);
  }
  return data as T;
}

function fetchWithToken(path: string, options: RequestInit, token?: string) {
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

let refreshPromise: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const { refreshToken, setTokens, signOut } = useAuthStore.getState();

  if (!refreshToken) {
    await signOut();
    return null;
  }

  const response = await fetchWithToken('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });

  if (response.status === 401) {
    await signOut();
    return null;
  }

  const data = await parseResponse<RefreshResponse>(response);
  await setTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const storeToken = useAuthStore.getState().token;
  const authToken = token ? storeToken ?? token : undefined;

  let response = await fetchWithToken(path, options, authToken);

  if (response.status === 401 && authToken && path !== '/auth/refresh') {
    const refreshedToken = await refreshAccessToken();

    if (!refreshedToken) {
      throw new Error('Your session expired. Please sign in again.');
    }

    response = await fetchWithToken(path, options, refreshedToken);
  }

  return parseResponse<T>(response);
}

export const api = {
  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (displayName: string, email: string, password: string) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ displayName, email, password }),
    }),

  families: (token: string) => request<Family[]>('/families', {}, token),
  createFamily: (token: string, name: string) =>
    request<Family>('/families', { method: 'POST', body: JSON.stringify({ name }) }, token),
  profiles: (token: string, familyId: string) =>
    request<MemoryProfile[]>(`/families/${familyId}/profiles`, {}, token),
  createProfile: (token: string, familyId: string, body: object) =>
    request<MemoryProfile>(
      `/families/${familyId}/profiles`,
      { method: 'POST', body: JSON.stringify(body) },
      token,
    ),
  memories: (token: string, familyId: string) =>
    request<Memory[]>(`/families/${familyId}/memories`, {}, token),
  createMemory: (token: string, familyId: string, body: object) =>
    request<Memory>(
      `/families/${familyId}/memories`,
      { method: 'POST', body: JSON.stringify(body) },
      token,
    ),
  updateMemory: (token: string, id: string, body: object) =>
    request<Memory>(
      `/memories/${id}`,
      { method: 'PATCH', body: JSON.stringify(body) },
      token,
    ),
  deleteMemory: (token: string, id: string) =>
    request<{ deleted: boolean }>(`/memories/${id}`, { method: 'DELETE' }, token),
};
