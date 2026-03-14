import * as React from 'react';

export interface AuthUser {
  username: string;
}

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
  return raw ? (JSON.parse(raw) as AuthUser) : null;
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
    await new Promise((r) => setTimeout(r, 300));
    if (credentials.password !== '123') {
      throw new Error('Invalid credentials');
    }
    const newUser: AuthUser = { username: credentials.username };
    setStoredUser(newUser);
    setUser(newUser);
  };

  const logout = async () => {
    await new Promise((r) => setTimeout(r, 200));
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
