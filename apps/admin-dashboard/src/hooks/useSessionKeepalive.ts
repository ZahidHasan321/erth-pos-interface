import { useEffect } from 'react';
import { db } from '@/lib/db';

/**
 * Keeps the auth session from silently expiring at the 1-hour access-token TTL.
 *
 * pos-interface / workshop never hit this because they mount a Realtime channel
 * plus a visibilitychange focus-refetch (see useRealtimeInvalidation), which
 * continuously exercises the connection and refreshes the token well before it
 * expires. The admin dashboard has neither, so a tab left idle — or backgrounded,
 * where the browser throttles/pauses supabase-js's internal auto-refresh timer —
 * lets the token reach expiry and forces a logout on the next request.
 *
 * This refreshes proactively so the token never reaches expiry under the user:
 *  - on a slow interval, covering a foreground tab left idle, and
 *  - on tab focus (throttled), covering a backgrounded tab whose interval was
 *    throttled while hidden.
 *
 * The reactive 401 refresh-and-replay in lib/db.ts and the JWT-error recovery in
 * App.tsx remain the safety net; this just keeps things from ever getting there.
 */

// Refresh comfortably inside the 1-hour (3600s) TTL.
const KEEPALIVE_INTERVAL_MS = 50 * 60 * 1000; // 50 min
// Cap focus refreshes so rapid tab switching can't hammer the refresh endpoint.
const FOCUS_REFRESH_THROTTLE_MS = 60 * 1000; // 1 min

export function useSessionKeepalive(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    let lastRefresh = 0;
    const refresh = () => {
      lastRefresh = Date.now();
      // Fire-and-forget: rotation is on, so this hands back a fresh access +
      // refresh token. Failures fall through to the reactive recovery paths.
      db.auth.refreshSession().catch(() => {});
    };

    const interval = setInterval(refresh, KEEPALIVE_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRefresh < FOCUS_REFRESH_THROTTLE_MS) return;
      refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);
}
