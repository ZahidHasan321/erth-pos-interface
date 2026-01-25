import type { BRAND_NAMES } from '@/lib/constants'
import * as React from 'react'

export interface AuthUser {
  userId?: string
  username?: string
  userType: typeof BRAND_NAMES[keyof typeof BRAND_NAMES]
}

export interface AuthContext {
  isAuthenticated: boolean
  login: (credentials: { userId?: string; username?: string; password: string; userType: typeof BRAND_NAMES[keyof typeof BRAND_NAMES] }) => Promise<void>
  logout: () => Promise<void>
  user: AuthUser | null
}

export default async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const AuthContext = React.createContext<AuthContext | null>(null)

const key = 'tanstack.auth.user'

function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(key)
  return raw ? (JSON.parse(raw) as AuthUser) : null
}

function setStoredUser(user: AuthUser | null) {
  if (user) {
    localStorage.setItem(key, JSON.stringify(user))
  } else {
    localStorage.removeItem(key)
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(getStoredUser())
  const isAuthenticated = !!user

  const logout = async () => {
    await sleep(250)
    setStoredUser(null)
    setUser(null)
  }

  const login = async (credentials: { userId?: string; username?: string; password: string; userType: typeof BRAND_NAMES[keyof typeof BRAND_NAMES] }) => {
    await sleep(500)

    // Check that at least one identifier is provided
    if (!credentials.userId && !credentials.username) {
      throw new Error('Either userId or username is required')
    }

    // 🔑 Example validation logic — replace with real API call
    if (credentials.password === '123') {
      const newUser: AuthUser = {
        userId: credentials.userId,
        username: credentials.username,
        userType: credentials.userType,
      }
      setStoredUser(newUser)
      setUser(newUser)
    } else {
      throw new Error('Invalid credentials')
    }
  }



  React.useEffect(() => {
    setUser(getStoredUser())
  }, [])

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout }}>
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