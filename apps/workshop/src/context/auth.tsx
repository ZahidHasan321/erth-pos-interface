import * as React from 'react';
import { db } from '@/lib/db';
import { useHeartbeat } from '@/hooks/useSessions';
import type { AuthUser } from '@/lib/rbac';

export type { AuthUser };

export interface AuthContext {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  login: (credentials: { username: string; pin: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContext | null>(null);

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

async function fetchUserFromSession(userId: string): Promise<AuthUser | null> {
  const { data } = await db
    .from('users')
    .select('id, username, name, role, department')
    .eq('id', userId)
    .single();

  if (!data) return null;

  return {
    id: data.id,
    username: data.name,
    role: data.role ?? 'staff',
    department: data.department ?? null,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const isAuthenticated = !!user;

  React.useEffect(() => {
    let cancelled = false;

    // Initial session restore
    db.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return;
      if (session?.user?.app_metadata?.user_id) {
        const restored = await fetchUserFromSession(session.user.app_metadata.user_id);
        if (!cancelled) setUser(restored);
      }
      if (!cancelled) setIsLoading(false);
    });

    // React to all auth state changes
    const { data: { subscription } } = db.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;

      if (event === 'SIGNED_OUT' || !session) {
        setUser(null);
        return;
      }

      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        const userId = session.user.app_metadata?.user_id;
        if (userId) {
          const refreshed = await fetchUserFromSession(userId);
          if (!cancelled) {
            if (refreshed) {
              setUser(refreshed);
            } else {
              await db.auth.signOut();
            }
          }
        }
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // Heartbeat runs while user is logged in
  useHeartbeat(user?.id ?? null);

  const login = async (credentials: { username: string; pin: string }) => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/auth-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: credentials.username, pin: credentials.pin }),
    });

    const result = await res.json();

    if (!res.ok) {
      throw new Error(result.error || 'Login failed');
    }

    if (result.session) {
      await db.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      });
    }

    setUser({
      id: result.user.id,
      username: result.user.name,
      role: result.user.role ?? 'staff',
      department: result.user.department ?? null,
    });
  };

  const logout = async () => {
    await db.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
