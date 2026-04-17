import * as React from 'react';
import { db } from '@/lib/db';
import { useHeartbeat } from '@/hooks/useSessions';
import { endSession } from '@/api/sessions';
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

async function fetchUserFromSession(userId: string): Promise<AuthUser | null> {
  const { data, error } = await db
    .from('users')
    .select('id, username, name, role, department, job_function, brands, is_active, email, phone, employee_id')
    .eq('id', userId)
    .single();

  if (error) {
    throw new Error(`Failed to load user profile: ${error.message}`);
  }
  if (!data) return null;

  // Deactivated account — caller forces logout. Returning null here keeps the
  // pattern consistent with "user not found".
  if (data.is_active === false) return null;

  return {
    id: data.id,
    username: data.username,
    name: data.name,
    role: data.role ?? 'staff',
    department: data.department ?? null,
    job_function: data.job_function ?? null,
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
        // Propagate the restored JWT to the Realtime client. supabase-js v2 only
        // auto-sets realtime auth on SIGNED_IN / TOKEN_REFRESHED events — it does
        // NOT react to INITIAL_SESSION, which is the only event fired when a
        // cookie session is rehydrated on page reload. Without this line,
        // postgres_changes channels would connect using the anon key and RLS
        // policies that rely on auth.uid() (e.g. get_my_department()) silently
        // filter out every event.
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
              // Deactivated or deleted mid-session — terminate.
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
    //
    // CRITICAL: onAuthStateChange callbacks must NOT make async supabase
    // calls inline — supabase-js v2 holds an internal lock during the
    // callback, so any nested db call deadlocks the entire client (every
    // subsequent request hangs forever). Defer all async work via
    // setTimeout(..., 0). See:
    // https://supabase.com/docs/guides/troubleshooting/why-is-my-supabase-api-call-not-returning-PGzXw0
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

  // Heartbeat runs while user is logged in
  useHeartbeat(user?.id ?? null);

  const login = async (credentials: { username: string; pin: string }) => {
    loginInProgress.current = true;
    try {
      const { data: result, error: fnError } = await db.functions.invoke<{
        session: { access_token: string; refresh_token: string } | null;
        user: { id: string };
      }>('auth-login', {
        body: { username: credentials.username, pin: credentials.pin },
      });

      if (fnError) {
        // FunctionsHttpError exposes the raw Response on .context — parse the
        // server's {error: "..."} body so the user sees the real reason
        // (e.g. "Invalid PIN", "Account locked") instead of "non-2xx".
        let serverMsg: string | null = null;
        const ctx = (fnError as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.json();
            serverMsg = body?.error ?? null;
          } catch { /* ignore */ }
        }
        throw new Error(`Login failed: ${serverMsg || fnError.message || 'no error message from server'}`);
      }
      if (!result) throw new Error('Login failed: empty response');

      if (result.session) {
        await db.auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token,
        });
        try { db.realtime.setAuth(result.session.access_token); } catch (e) {
          console.warn('[Auth] realtime.setAuth failed after login', e);
        }
      }

      const fullUser = await fetchUserFromSession(result.user.id);
      if (!fullUser) {
        // fetchUserFromSession returns null for deactivated accounts OR missing
        // rows. Either way we can't proceed — scrub the just-set session so the
        // user isn't stuck with a JWT that has no matching profile.
        await db.auth.signOut().catch(() => {});
        throw new Error('Account is not active or user profile not found');
      }
      setUser(fullUser);
    } finally {
      loginInProgress.current = false;
    }
  };

  const logout = async () => {
    if (user?.id) await endSession(user.id).catch(() => {});
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
