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
}

export interface AuthContext {
  isAuthenticated: boolean
  login: (credentials: { username: string; password: string; userType: BrandName }) => Promise<void>
  logout: () => Promise<void>
  user: AuthUser | null
}

const AuthContext = React.createContext<AuthContext | null>(null)

const key = 'tanstack.auth.user'

function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed.id && parsed.username && parsed.userType) return parsed as AuthUser
    return null
  } catch {
    return null
  }
}

function setStoredUser(user: AuthUser | null) {
  if (user) {
    localStorage.setItem(key, JSON.stringify(user))
  } else {
    localStorage.removeItem(key)
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(getStoredUser)
  const isAuthenticated = !!user

  const logout = async () => {
    setStoredUser(null)
    setUser(null)
  }

  const login = async (credentials: { username: string; password: string; userType: BrandName }) => {
    if (credentials.password !== '123') {
      throw new Error('Invalid credentials')
    }

    // Look up user in the database by username
    const { data, error } = await db
      .from('users')
      .select('id, username, name, role, department, brands')
      .ilike('username', credentials.username)
      .eq('is_active', true)
      .limit(1)
      .single()

    if (error || !data) {
      throw new Error('User not found. Ask an admin to create your account.')
    }

    // Verify the user has access to the selected brand
    const userBrands: string[] = data.brands ?? []
    if (userBrands.length > 0 && !userBrands.includes(credentials.userType)) {
      throw new Error(`You don't have access to this brand. Your brands: ${userBrands.join(', ')}`)
    }

    const newUser: AuthUser = {
      id: data.id,
      username: data.username,
      name: data.name,
      brands: userBrands,
      userType: credentials.userType,
    }
    setStoredUser(newUser)
    setUser(newUser)
  }

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
