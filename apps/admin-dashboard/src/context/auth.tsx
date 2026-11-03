import * as React from 'react';
import { db } from '@/lib/db';
import type { AuthUser } from '@/lib/rbac';

export type { AuthUser };

export interface AuthContext {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  login: (credentials: { username: string; pin: string; turnstileToken?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContext | null>(null);

async function fetchUserFromSession(userId: string): Promise<AuthUser | null> {
  const { data, error } = await db
    .from('users')
    .select('id, username, name, role, department, job_functions, brands, is_active, email, phone, employee_id')
    .eq('id', userId)
    .single();

  if (error) {
    // PGRST116 = `.single()` got zero rows. Either the row was deleted, or
    // RLS hid it because `is_active = false`. Either way the session is no
    // longer valid — return null so the caller signs out.
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to load user profile: ${error.message}`);
  }
  if (!data) return null;

  // Belt-and-braces: if RLS ever stops filtering, this client-side check still
  // forces logout for inactive users.
  if (data.is_active === false) return null;

  return {
    id: data.id,
    username: data.username,
    name: data.name,
    role: data.role ?? 'staff',
    department: data.department ?? null,
    job_functions: Array.isArray(data.job_functions) ? data.job_functions : [],
    brands: data.brands ?? null,
    is_active: data.is_active ?? true,
    email: data.email ?? null,
    phone: data.phone ?? null,
    employee_id: data.employee_id ?? null,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  // Track whether login() is in progress so onAuthStateChange doesn't interfere
  const loginInProgress = React.useRef(false);
  const isAuthenticated = !!user;

  React.useEffect(() => {
    let cancelled = false;

    // Initial session restore
    ;(async () => {
      try {
        const { data: { session } } = await db.auth.getSession();
        if (cancelled) return;
        if (session?.access_token) {
          try { db.realtime.setAuth(session.access_token); } catch (e) {
            console.warn('[Auth] realtime.setAuth failed', e);
          }
        }
        if (session?.user?.app_metadata?.user_id) {
          try {
            const restored = await fetchUserFromSession(session.user.app_metadata.user_id);
            if (cancelled) return;
            if (restored) {
              setUser(restored);
            } else {
              await db.auth.signOut().catch(() => {});
            }
          } catch {
            console.warn('[Auth] Session restore failed — waiting for token refresh');
          }
        }
      } catch (e) {
        console.warn('[Auth] getSession failed', e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    // React to auth state changes (token refresh, external sign-out).
    // CRITICAL: onAuthStateChange callbacks must NOT make async supabase calls
    // inline — supabase-js v2 holds an internal lock during the callback, so any
    // nested db call deadlocks the client. Defer async work via setTimeout(,0).
    const { data: { subscription } } = db.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (loginInProgress.current) return;

      if (event === 'SIGNED_OUT' || !session) {
        setUser(null);
        return;
      }

      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        if (session.access_token) {
          try { db.realtime.setAuth(session.access_token); } catch (e) {
            console.warn('[Auth] realtime.setAuth failed', e);
          }
        }
        const userId = session.user.app_metadata?.user_id;
        if (!userId) return;

        setTimeout(async () => {
          if (cancelled) return;
          try {
            const refreshed = await fetchUserFromSession(userId);
            if (cancelled) return;
            if (refreshed) {
              setUser(refreshed);
            } else {
              await db.auth.signOut();
            }
          } catch {
            console.warn('[Auth] Failed to load user on', event);
          }
        }, 0);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (credentials: { username: string; pin: string; turnstileToken?: string }) => {
    loginInProgress.current = true;
    try {
      // PIN verify (Postgres verify_pin) + try limits run behind the api's
      // /auth/v1/login; failures come back as one generic message, flagged
      // captchaRequired once the next try needs a Turnstile token.
      const { data: signIn, error: signInError } = await db.auth.signInWithPin(credentials);
      if (signInError || !signIn.session) {
        console.error('[Auth] login failed', signInError);
        throw Object.assign(new Error(signInError?.message || 'Login failed: no session'), {
          captchaRequired: signInError?.captcha_required === true,
        });
      }

      const fullUser = await fetchUserFromSession(signIn.session.user.app_metadata.user_id);
      if (!fullUser) {
        await db.auth.signOut().catch(() => {});
        throw new Error('Account is not active or user profile not found');
      }
      setUser(fullUser);
    } finally {
      loginInProgress.current = false;
    }
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
