/**
 * Database client facade.
 *
 * Uses createClient with default localStorage storage. The @supabase/ssr
 * createBrowserClient was removed because it breaks Realtime postgres_changes
 * subscriptions. Since both apps are pure SPAs (no server), cookie-based
 * auth via document.cookie provides no XSS advantage over localStorage.
 */

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Missing database environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)');
}

// Hard cap on every PostgREST / RPC / auth fetch. Without it, a fetch issued
// while the tab was hidden can stay pending forever after the tab comes back
// (browsers don't always reject throttled in-flight requests). TanStack Query
// then dedupes on that pending promise and every subsequent mount waits on a
// dead fetch — the "stuck, no API calls" symptom. Abort at 15s so the query
// surfaces an error and our JWT-error recovery / retry logic takes over.
const FETCH_TIMEOUT_MS = 15_000;

// Holder set after createClient returns. Used by the fetch wrapper to force
// signOut when the server rejects our JWT (deactivated/wiped user, revoked
// session). Indirection avoids referencing `db` before it's assigned.
let dbRef: { auth: { signOut: () => Promise<unknown> } } | null = null;

function getReqUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function timeoutFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Request timeout', 'TimeoutError')), FETCH_TIMEOUT_MS);
  const upstream = init?.signal;
  if (upstream) {
    if (upstream.aborted) controller.abort(upstream.reason);
    else upstream.addEventListener('abort', () => controller.abort(upstream.reason), { once: true });
  }
  return fetch(input, { ...init, signal: controller.signal })
    .then((res) => {
      // 401 from any non-auth endpoint means our JWT no longer satisfies the
      // server (gotrue revoked, user wiped, RLS rejected with PGRST301). Force
      // signOut so the UI bounces to login instead of looping on stale auth.
      // /auth/v1/* is skipped — login/refresh failures legitimately return 401
      // and signing out there would clobber the in-flight login attempt.
      if (res.status === 401 && !getReqUrl(input).includes('/auth/v1/')) {
        setTimeout(() => { dbRef?.auth.signOut().catch(() => {}); }, 0);
      }
      return res;
    })
    .finally(() => clearTimeout(timer));
}

export const db = createClient(url, anonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch: timeoutFetch,
  },
});

dbRef = db;
