import type {
  CreateFamilyInput,
  Family,
  LoginResponse,
  ProfileAccountInput,
  ProfileInput,
  Reservation,
  ReservationRangeInput,
  Settings,
  UpdateFamilyInput,
  User
} from './types';

type ReservationsResponse = { reservations: Reservation[] };

const TOKEN_KEY = 'simuni_token';

/** Returns the stored token regardless of which storage it lives in. */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
}

/**
 * Persist the token.
 * @param remember `true` → localStorage (survives browser restart);
 *                 `false` → sessionStorage (cleared when the tab/browser closes).
 */
export function setToken(token: string, remember: boolean): void {
  if (remember) {
    localStorage.setItem(TOKEN_KEY, token);
    sessionStorage.removeItem(TOKEN_KEY);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

/** Broadcast so the auth provider can drop the session when the token is rejected. */
export const UNAUTHORIZED_EVENT = 'simuni:unauthorized';

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const response = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers
    }
  });

  if (response.status === 401) {
    clearToken();
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }

  if (!response.ok) {
    let message = `Zahteva ni uspela (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) {
        message = body.error;
      }
    } catch {
      // Ignore: keep the default message.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  // Auth
  login: (username: string, password: string) =>
    request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  me: () => request<User>('/api/auth/me'),

  // Families (admin only)
  listFamilies: () => request<{ families: Family[] }>('/api/families'),
  createFamily: (input: CreateFamilyInput) =>
    request<Family>('/api/families', { method: 'POST', body: JSON.stringify(input) }),
  updateFamily: (id: number, input: UpdateFamilyInput) =>
    request<Family>(`/api/families/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteFamily: (id: number) => request<void>(`/api/families/${id}`, { method: 'DELETE' }),

  // Own profile (any authenticated user)
  getProfile: () => request<User>('/api/profile'),
  updateProfile: (input: ProfileInput) =>
    request<User>('/api/profile', { method: 'PUT', body: JSON.stringify(input) }),
  updateAccount: (input: ProfileAccountInput) =>
    request<User>('/api/profile/account', { method: 'PUT', body: JSON.stringify(input) }),

  // Pricing settings
  getSettings: () => request<Settings>('/api/settings'),
  updateSettings: (settings: Settings) =>
    request<Settings>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    }),

  // Reservations
  getReservations: () => request<ReservationsResponse>('/api/reservations'),
  createReservation: (input: ReservationRangeInput) =>
    request<ReservationsResponse>('/api/reservations', {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  updateReservation: (id: number, input: ReservationRangeInput) =>
    request<ReservationsResponse>(`/api/reservations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input)
    }),
  deleteReservation: (id: number) =>
    request<ReservationsResponse>(`/api/reservations/${id}`, { method: 'DELETE' })
};
