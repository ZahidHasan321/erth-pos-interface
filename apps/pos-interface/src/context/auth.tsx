import { db } from '@/lib/db'
import * as React from 'react'
import type { AuthUser } from '@/lib/rbac'

export type { AuthUser }

export interface AuthContext {
  isAuthenticated: boolean
  isLoading: boolean
  login: (credentials: { username: string; pin: string }) => Promise<void>
  logout: () => Promise<void>
  user: AuthUser | null
}

const AuthContext = React.createContext<AuthContext | null>(null)

async function fetchUserFromSession(userId: string): Promise<AuthUser | null> {
  const { data, error } = await db
    .from('users')
    .select('id, username, name, brands, role, department, job_functions, is_active, email, phone, employee_id')
    .eq('id', userId)
    .single()

  if (error) {
    // PGRST116 = `.single()` got zero rows. Either the row was deleted, or
    // RLS hid it because `is_active = false` (see is_active_user() / users_select
    // policy in triggers.sql). Either way the session is no longer valid —
    // return null so the caller signs out.
    if (error.code === 'PGRST116') return null
    throw new Error(`Failed to load user profile: ${error.message}`)
  }
  if (!data) return null

  // Belt-and-braces: if RLS ever stops filtering, this client-side check still
  // forces logout for inactive users.
  if (data.is_active === false) return null

  return {
    id: data.id,
    username: data.username,
    name: data.name,
    brands: data.brands ?? null,
    role: data.role ?? 'staff',
    department: data.department ?? null,
    job_functions: Array.isArray(data.job_functions) ? data.job_functions : [],
    is_active: data.is_active ?? true,
    email: data.email ?? null,
    phone: data.phone ?? null,
    employee_id: data.employee_id ?? null,
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  // Track whether login() is in progress so onAuthStateChange doesn't interfere
  const loginInProgress = React.useRef(false)
  const isAuthenticated = !!user

  React.useEffect(() => {
    let cancelled = false

    // Initial session restore
    ;(async () => {
      try {
        const { data: { session } } = await db.auth.getSession()
        if (cancelled) return
        // Propagate the restored JWT to the Realtime client. supabase-js v2 only
        // auto-sets realtime auth on SIGNED_IN / TOKEN_REFRESHED events — it does
        // NOT react to INITIAL_SESSION, which is the only event fired when a
        // cookie session is rehydrated on page reload. Without this line,
        // postgres_changes channels would connect using the anon key and RLS
        // policies that rely on auth.uid() (e.g. get_my_department()) silently
        // filter out every event.
        if (session?.access_token) {
          try { db.realtime.setAuth(session.access_token) } catch (e) {
            console.warn('[Auth] realtime.setAuth failed', e)
          }
        }
        if (session?.user?.app_metadata?.user_id) {
          try {
            const restored = await fetchUserFromSession(session.user.app_metadata.user_id)
            if (cancelled) return
            if (restored) {
              setUser(restored)
            } else {
              // Deactivated or deleted mid-session — terminate the JWT.
              await db.auth.signOut().catch(() => {})
            }
          } catch {
            // JWT may be expired — token refresh will fire SIGNED_IN/TOKEN_REFRESHED
            // and the onAuthStateChange handler below will retry. Don't block loading.
            console.warn('[Auth] Session restore failed — waiting for token refresh')
          }
        }
      } catch (e) {
        console.warn('[Auth] getSession failed', e)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()

    // React to auth state changes (token refresh, external sign-out).
    //
    // CRITICAL: onAuthStateChange callbacks must NOT make async supabase
    // calls inline — supabase-js v2 holds an internal lock during the
    // callback, so any nested db call deadlocks the entire client (every
    // subsequent request hangs forever). Defer all async work via
    // setTimeout(..., 0). See:
    // https://supabase.com/docs/guides/troubleshooting/why-is-my-supabase-api-call-not-returning-PGzXw0
    const { data: { subscription } } = db.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      if (loginInProgress.current) return

      if (event === 'SIGNED_OUT' || !session) {
        setUser(null)
        return
      }

      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        // Sync work is safe inside the callback.
        if (session.access_token) {
          try { db.realtime.setAuth(session.access_token) } catch (e) {
            console.warn('[Auth] realtime.setAuth failed', e)
          }
        }
        const userId = session.user.app_metadata?.user_id
        if (!userId) return

        // Defer the async DB call out of the auth-lock context.
        setTimeout(async () => {
          if (cancelled) return
          try {
            const refreshed = await fetchUserFromSession(userId)
            if (cancelled) return
            if (refreshed) {
              setUser(refreshed)
            } else {
              await db.auth.signOut()
            }
          } catch {
            console.warn('[Auth] Failed to load user on', event)
          }
        }, 0)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const login = async (credentials: { username: string; pin: string }) => {
    loginInProgress.current = true
    try {
      const { data: result, error: fnError } = await db.functions.invoke<{
        session: { access_token: string; refresh_token: string } | null
        user: { id: string }
      }>('auth-login', {
        body: { username: credentials.username, pin: credentials.pin },
      })

      if (fnError) {
        // FunctionsHttpError exposes the raw Response on .context — parse the
        // server's {error: "..."} body so the user sees the real reason
        // (e.g. "Invalid PIN", "Account locked") instead of "non-2xx".
        let serverMsg: string | null = null
        const ctx = (fnError as { context?: Response }).context
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.json()
            serverMsg = body?.error ?? null
          } catch { /* ignore */ }
        }
        throw new Error(serverMsg || fnError.message || 'Login failed')
      }
      if (!result) throw new Error('Login failed: empty response')

      // Set the Supabase session so all subsequent db calls carry the JWT
      if (result.session) {
        await db.auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token,
        })
        // Propagate JWT to realtime — onAuthStateChange handler skips while
        // loginInProgress is true, so realtime would otherwise stay on anon key
        // and postgres_changes subscriptions time out under RLS.
        try { db.realtime.setAuth(result.session.access_token) } catch (e) {
          console.warn('[Auth] realtime.setAuth failed after login', e)
        }
      }

      const fullUser = await fetchUserFromSession(result.user.id)
      if (!fullUser) {
        // Deactivated or profile missing — scrub the just-set JWT.
        await db.auth.signOut().catch(() => {})
        throw new Error('Account is not active or user profile not found')
      }
      setUser(fullUser)
    } finally {
      loginInProgress.current = false
    }
  }

  const logout = async () => {
    await db.auth.signOut()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = React.useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
