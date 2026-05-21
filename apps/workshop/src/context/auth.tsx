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
    .select('id, username, name, role, department, job_functions, brands, is_active, email, phone, employee_id')
    .eq('id', userId)
    .single();

  if (error) {
    // PGRST116 = `.single()` got zero rows. Either the row was deleted, or
    // RLS hid it because `is_active = false` (see is_active_user() / users_select
    // policy in triggers.sql). Either way the session is no longer valid —
    // return null so the caller signs out.
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
      // Login bridge moved out of the auth-login Edge Function — its Deno
      // isolate dropped ~40% of requests at cold boot. login_with_pin does
      // PIN verify + GoTrue user sync inside Postgres and returns a one-time
      // credential; the session is minted via /auth/v1/token (healthy).
      const { data: rpcData, error: rpcError } = await db.rpc('login_with_pin', {
        p_username: credentials.username,
        p_pin: credentials.pin,
      });
      if (rpcError) {
        // PostgREST surfaces verify_pin's RAISE message verbatim
        // (e.g. "Invalid PIN. 3 attempts remaining.").
        console.error('[Auth] login_with_pin failed', rpcError);
        throw new Error(`Login failed: ${rpcError.message || 'unknown error'}`);
      }
      const creds = rpcData as {
        email: string;
        password: string;
        user: { id: string };
      } | null;
      if (!creds) throw new Error('Login failed: empty response');

      const { data: signIn, error: signInError } =
        await db.auth.signInWithPassword({
          email: creds.email,
          password: creds.password,
        });
      if (signInError || !signIn.session) {
        throw new Error(`Login failed: ${signInError?.message ?? 'no session'}`);
      }
      try { db.realtime.setAuth(signIn.session.access_token); } catch (e) {
        console.warn('[Auth] realtime.setAuth failed after login', e);
      }

      const fullUser = await fetchUserFromSession(creds.user.id);
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
