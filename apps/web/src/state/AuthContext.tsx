import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from 'react';

import { api, clearToken, getToken, setToken, UNAUTHORIZED_EVENT } from '../lib/api';
import type { User } from '../lib/types';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-fetch the current user from the server (e.g. after editing the profile). */
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const me = await api.me();
        if (!cancelled) {
          setUser(me);
        }
      } catch {
        clearToken();
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleUnauthorized() {
      setUser(null);
    }
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, []);

  async function login(username: string, password: string) {
    const { token, user: loggedIn } = await api.login(username, password);
    setToken(token);
    setUser(loggedIn);
  }

  async function logout() {
    try {
      await api.logout();
    } catch {
      // Ignore network errors on logout; we clear locally regardless.
    }
    clearToken();
    setUser(null);
  }

  const refreshUser = useCallback(async () => {
    const me = await api.me();
    setUser(me);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an <AuthProvider>.');
  }
  return context;
}
