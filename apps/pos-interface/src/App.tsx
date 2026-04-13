import { useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";

// Import the generated route tree
import { router } from "./router";
import "./index.css";
import { RouterProvider } from "@tanstack/react-router";
import { AuthProvider, useAuth } from "./context/auth";
import { db } from "./lib/db";

function isJwtError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === 'PGRST301' || e.code === '401') return true;
  return typeof e.message === 'string' && /jwt|expired|invalid token/i.test(e.message);
}

let refreshInFlight: Promise<unknown> | null = null;
function attemptSessionRecover() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = db.auth.refreshSession()
    .then((res) => {
      if (res.error) return db.auth.signOut();
    })
    .catch(() => db.auth.signOut())
    .finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      gcTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (isJwtError(error)) return failureCount < 1;
        return failureCount < 1;
      },
    },
  },
  queryCache: new QueryCache({
    onError: (err) => { if (isJwtError(err)) attemptSessionRecover(); },
  }),
  mutationCache: new MutationCache({
    onError: (err) => { if (isJwtError(err)) attemptSessionRecover(); },
  }),
});

function InnerApp() {
  const auth = useAuth()

  // Drop cached data on logout so a different user can't see stale rows
  // through the cache while the new session is being established.
  const wasAuthed = useRef(auth.isAuthenticated);
  useEffect(() => {
    if (wasAuthed.current && !auth.isAuthenticated) {
      queryClient.clear();
    }
    wasAuthed.current = auth.isAuthenticated;
  }, [auth.isAuthenticated]);

  if (auth.isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ width: 24, height: 24, border: '3px solid #e5e7eb', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <RouterProvider router={router} context={{ auth, queryClient }} />
  )
}

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <InnerApp />
      </QueryClientProvider>
    </AuthProvider>
  )
}
