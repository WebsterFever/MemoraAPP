const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export type User = { id: string; email: string; displayName: string; preferredLanguage: string };
export type AuthResponse = { user: User; accessToken: string; refreshToken?: string };
export type Family = { id: string; name: string; ownerUserId: string; profiles?: MemoryProfile[] };
export type Memory = { id: string; familyId: string; profileId?: string; title: string; story: string; occurredAt?: string; createdAt: string; updatedAt: string; profile?: MemoryProfile };
export type MemoryProfile = { id: string; familyId: string; displayName: string; relationship?: string; preferredLanguage: string; spokenLanguages: string[]; biography?: string; status: string };

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Something went wrong');
  return data as T;
}
export const api = {
  login: (email: string, password: string) => request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (displayName: string, email: string, password: string) => request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify({ displayName, email, password }) }),
  families: (token: string) => request<Family[]>('/families', {}, token),
  createFamily: (token: string, name: string) => request<Family>('/families', { method: 'POST', body: JSON.stringify({ name }) }, token),
  profiles: (token: string, familyId: string) => request<MemoryProfile[]>(`/families/${familyId}/profiles`, {}, token),
  createProfile: (token: string, familyId: string, body: object) => request<MemoryProfile>(`/families/${familyId}/profiles`, { method: 'POST', body: JSON.stringify(body) }, token),
  memories: (token: string, familyId: string) => request<Memory[]>(`/families/${familyId}/memories`, {}, token),
  createMemory: (token: string, familyId: string, body: object) => request<Memory>(`/families/${familyId}/memories`, { method: 'POST', body: JSON.stringify(body) }, token),
  updateMemory: (token: string, id: string, body: object) => request<Memory>(`/memories/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token),
  deleteMemory: (token: string, id: string) => request<{deleted:boolean}>(`/memories/${id}`, { method: 'DELETE' }, token),
};
