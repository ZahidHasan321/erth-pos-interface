import type { BRAND_NAMES } from '@/lib/constants'
import { db } from '@/lib/db'
import * as React from 'react'

type BrandName = typeof BRAND_NAMES[keyof typeof BRAND_NAMES]

export interface AuthUser {
  id: string
  username: string
  name: string
  brands: string[]
  userType: BrandName
  role: string | null
  department: string | null
  email: string | null
  phone: string | null
  employee_id: string | null
}

export interface AuthContext {
  isAuthenticated: boolean
  isLoading: boolean
  login: (credentials: { username: string; pin: string; userType: BrandName }) => Promise<void>
  logout: () => Promise<void>
  user: AuthUser | null
}

const AuthContext = React.createContext<AuthContext | null>(null)

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const BRAND_KEY = 'pos.selected_brand'

async function fetchUserFromSession(userId: string): Promise<AuthUser | null> {
  const { data } = await db
    .from('users')
    .select('id, username, name, brands, role, department, email, phone, employee_id')
    .eq('id', userId)
    .single()

  if (!data) return null

  const savedBrand = localStorage.getItem(BRAND_KEY) as BrandName | null
  return {
    id: data.id,
    username: data.username,
    name: data.name,
    brands: data.brands ?? [],
    userType: savedBrand || 'erth',
    role: data.role,
    department: data.department,
    email: data.email,
    phone: data.phone,
    employee_id: data.employee_id,
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
    db.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return
      if (session?.user?.app_metadata?.user_id) {
        const restored = await fetchUserFromSession(session.user.app_metadata.user_id)
        if (!cancelled) setUser(restored)
      }
      if (!cancelled) setIsLoading(false)
    })

    // React to auth state changes (token refresh, external sign-out)
    const { data: { subscription } } = db.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return

      // Skip if login() is handling the session — avoids race condition
      if (loginInProgress.current) return

      if (event === 'SIGNED_OUT' || !session) {
        setUser(null)
        return
      }

      // On token refresh, re-fetch user data (role/brands may have changed)
      if (event === 'TOKEN_REFRESHED') {
        const userId = session.user.app_metadata?.user_id
        if (userId) {
          const refreshed = await fetchUserFromSession(userId)
          if (!cancelled) {
            if (refreshed) {
              setUser(refreshed)
            } else {
              // User deleted or deactivated — force logout
              await db.auth.signOut()
            }
          }
        }
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const login = async (credentials: { username: string; pin: string; userType: BrandName }) => {
    loginInProgress.current = true
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/auth-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: credentials.username, pin: credentials.pin }),
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || 'Login failed')
      }

      // Set the Supabase session so all subsequent db calls carry the JWT
      if (result.session) {
        await db.auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token,
        })
      }

      // Verify brand access
      const userBrands: string[] = result.user.brands ?? []
      if (userBrands.length > 0 && !userBrands.includes(credentials.userType)) {
        await db.auth.signOut()
        throw new Error(`You don't have access to this brand. Your brands: ${userBrands.join(', ')}`)
      }

      // Persist brand choice
      localStorage.setItem(BRAND_KEY, credentials.userType)

      setUser({
        id: result.user.id,
        username: result.user.username,
        name: result.user.name,
        brands: userBrands,
        userType: credentials.userType,
        role: result.user.role ?? null,
        department: result.user.department ?? null,
        email: result.user.email ?? null,
        phone: result.user.phone ?? null,
        employee_id: result.user.employee_id ?? null,
      })
    } finally {
      loginInProgress.current = false
    }
  }

  const logout = async () => {
    await db.auth.signOut()
    localStorage.removeItem(BRAND_KEY)
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
