/**
 * Database client facade.
 *
 * Every file that talks to the database imports `db` from here — never from
 * a vendor SDK directly. To swap backends (e.g. raw PostgREST, custom API
 * server, Drizzle HTTP), replace the implementation in this file. The rest
 * of the app stays untouched.
 *
 * Current backend: Supabase (PostgREST + RPC via @supabase/supabase-js)
 *
 * Uses createClient with default localStorage storage. The @supabase/ssr
 * createBrowserClient was removed because it breaks Realtime postgres_changes
 * subscriptions. Since both apps are pure SPAs (no server), cookie-based
 * auth via document.cookie provides no XSS advantage over localStorage —
 * truly secure HttpOnly cookies require server middleware.
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
// Edge functions can cold-start (Deno isolate boot + esm.sh deps + multiple
// admin RPCs inside auth-login). 15s is too tight for the first request of
// the day. Use a longer cap only for /functions/v1/*.
const FUNCTIONS_FETCH_TIMEOUT_MS = 30_000;

// Firefox over HTTP/3 (QUIC) intermittently drops the first request on a cold
// connection to the Cloudflare edge in front of Supabase: the preflight
// succeeds, the follow-up request never gets a response, and fetch() rejects
// with a TypeError ("NetworkError when attempting to fetch resource"). The
// symptom is "Confirm fails 2-3 times then works".
//
// A bare TypeError means NO HTTP response was received — but we can't prove
// the request never reached PostgREST (a stream reset after the row committed
// also rejects with TypeError). So this generic layer only auto-replays
// IDEMPOTENT methods (GET/HEAD), where a replay is harmless by definition.
// Non-idempotent writes (POST/PATCH/PUT/DELETE) are NOT retried here — that
// would risk duplicate rows. Those paths get explicit, idempotency-keyed
// retry at the API layer (see createOrder / saveWorkOrderGarments), which is
// the only place that can replay a write safely. We also never replay
// timeouts (server may have committed) or caller cancellations.
const MAX_NETWORK_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 300;
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD']);

// Shared by the API layer to decide whether a *swallowed* supabase-js error
// (it resolves `{ error }` rather than throwing) was a transient connection
// failure worth an idempotency-keyed replay.
export function isTransientNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  const msg =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message: unknown }).message)
      : String(err);
  return /NetworkError|Failed to fetch|network ?error|fetch failed/i.test(msg);
}

// Bounded replay for write paths the generic fetch layer refuses to retry.
// Safe to use ONLY when the operation is idempotent: keyed by an
// idempotency_key / unique constraint, an UPDATE-by-PK, or a server-side
// idempotent RPC (idem_claim-guarded). `isTransient` inspects the resolved
// supabase result (it does not throw) to decide whether to replay.
const WRITE_RETRY_ATTEMPTS = 3;
const WRITE_RETRY_BASE_MS = 300;
export async function withWriteRetry<T>(
  attempt: () => PromiseLike<T>,
  isTransient: (result: T) => boolean,
): Promise<T> {
  for (let i = 1; ; i++) {
    const res = await attempt();
    if (i >= WRITE_RETRY_ATTEMPTS || !isTransient(res)) return res;
    await new Promise((r) => setTimeout(r, WRITE_RETRY_BASE_MS * i));
  }
}

// Holder set after createClient returns. Used by the fetch wrapper to force
// signOut when the server rejects our JWT (deactivated/wiped user, revoked
// session). Indirection avoids referencing `db` before it's assigned.
let dbRef: { auth: { signOut: () => Promise<unknown> } } | null = null;

function getReqUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

async function timeoutFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const timeoutMs = getReqUrl(input).includes('/functions/v1/')
    ? FUNCTIONS_FETCH_TIMEOUT_MS
    : FETCH_TIMEOUT_MS;
  const upstream = init?.signal;
  const method = (init?.method ?? 'GET').toUpperCase();
  const retryable = IDEMPOTENT_METHODS.has(method);

  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException('Request timeout', 'TimeoutError')), timeoutMs);
    const onUpstreamAbort = () => controller.abort(upstream?.reason);
    if (upstream) {
      if (upstream.aborted) controller.abort(upstream.reason);
      else upstream.addEventListener('abort', onUpstreamAbort, { once: true });
    }
    try {
      const res = await fetch(input, { ...init, signal: controller.signal });
      // 401 from any non-auth endpoint means our JWT no longer satisfies the
      // server (gotrue revoked, user wiped, RLS rejected with PGRST301). Force
      // signOut so the UI bounces to login instead of looping on stale auth.
      // /auth/v1/* is skipped — login/refresh failures legitimately return 401
      // and signing out there would clobber the in-flight login attempt.
      if (res.status === 401 && !getReqUrl(input).includes('/auth/v1/')) {
        setTimeout(() => { dbRef?.auth.signOut().catch(() => {}); }, 0);
      }
      return res;
    } catch (err) {
      // Caller cancelled or our own timeout fired → never replay. A timed-out
      // request may have committed server-side. Only replay a bare TypeError
      // (connection failure) AND only for idempotent methods — see the comment
      // on IDEMPOTENT_METHODS. Writes are retried at the API layer instead.
      const causedByUpstream = !!upstream?.aborted;
      const isConnectionFailure = err instanceof TypeError;
      if (retryable && !causedByUpstream && isConnectionFailure && attempt < MAX_NETWORK_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_BASE_DELAY_MS * (attempt + 1)));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
      if (upstream) upstream.removeEventListener('abort', onUpstreamAbort);
    }
  }
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
