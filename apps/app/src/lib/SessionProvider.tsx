import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, auth, setSessionLostHandler, type Me } from './api';
import { getRefreshToken } from './session';

type SessionState = {
  user: Me | null;
  /** True until the stored refresh token has been checked, so screens can wait. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signInAnonymously: (displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Staff, i.e. may reach /admin. Convenience only — RLS is the real boundary. */
  isStaff: boolean;
  canEnterResults: boolean;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore a session on launch. A stored refresh token is exchanged for a live one by
  // the api client, so this is just "ask who I am and see if it works".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (await getRefreshToken()) {
          const me = await api.me();
          if (!cancelled) setUser(me);
        }
      } catch {
        // Expired or revoked — start logged out. Not an error worth showing.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The api client calls this when a refresh fails mid-session, so the UI drops to
  // logged-out rather than silently failing every subsequent request.
  useEffect(() => {
    setSessionLostHandler(() => setUser(null));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setUser(await auth.login(email, password));
  }, []);

  const signInAnonymously = useCallback(async (displayName: string) => {
    setUser(await auth.anonymous(displayName));
  }, []);

  const logout = useCallback(async () => {
    await auth.logout();
    setUser(null);
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      user,
      loading,
      login,
      signInAnonymously,
      logout,
      isStaff:
        user != null && ['moderator', 'admin', 'super_admin'].includes(user.role),
      // Mirrors the database's can_enter_results(): admins always, moderators only when
      // explicitly granted. The server enforces it; this only decides what to show.
      canEnterResults:
        user != null &&
        (['admin', 'super_admin'].includes(user.role) ||
          (user.role === 'moderator' && user.match_entry_rights)),
    }),
    [user, loading, login, signInAnonymously, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>.');
  return ctx;
}
