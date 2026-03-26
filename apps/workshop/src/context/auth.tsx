import * as React from 'react';
import { db } from '@/lib/db';
import type { AuthUser } from '@/lib/rbac';

export type { AuthUser };

export interface AuthContext {
  isAuthenticated: boolean;
  user: AuthUser | null;
  login: (credentials: { username: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContext | null>(null);

const STORAGE_KEY = 'workshop.auth.user';

function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.id && parsed.username && parsed.role && parsed.department) return parsed as AuthUser;
    return null;
  } catch {
    return null;
  }
}

function setStoredUser(user: AuthUser | null) {
  if (user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(getStoredUser);
  const isAuthenticated = !!user;

  const login = async (credentials: { username: string; password: string }) => {
    if (credentials.password !== '123') {
      throw new Error('Invalid credentials');
    }

    // Look up user in the database by username
    const { data, error } = await db
      .from('users')
      .select('id, username, name, role, department')
      .ilike('username', credentials.username)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (error || !data) {
      throw new Error('User not found. Ask an admin to create your account.');
    }

    const newUser: AuthUser = {
      id: data.id,
      username: data.name,
      role: data.role ?? 'staff',
      department: data.department ?? 'workshop',
    };
    setStoredUser(newUser);
    setUser(newUser);
  };

  const logout = async () => {
    setStoredUser(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
