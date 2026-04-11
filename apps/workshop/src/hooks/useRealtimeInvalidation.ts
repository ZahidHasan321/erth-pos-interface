import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import {
  WORKSHOP_GARMENTS_KEY,
  SCHEDULER_KEY,
  TERMINAL_KEY,
  WORKLOAD_KEY,
  COMPLETED_TODAY_KEY,
  ASSIGNED_OVERVIEW_KEY,
  ASSIGNED_PAGE_KEY,
  COMPLETED_VIEW_KEY,
} from './useWorkshopGarments';
import { SIDEBAR_COUNTS_KEY } from './useSidebarCounts';
import { NOTIFICATIONS_KEY } from './useNotifications';
import { showNotificationToast } from '@/components/notification-toast';
import { useAuth } from '@/context/auth';
import type { RealtimeChannel } from '@supabase/supabase-js';

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

/**
 * Subscribes to Supabase Realtime changes on key tables and invalidates
 * the relevant TanStack Query caches. Replaces polling with push-based updates.
 *
 * Mount once in the authenticated layout.
 */
export function useRealtimeInvalidation() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  const shownNotificationIds = useRef(new Set<number>());

  const onGarmentChange = useCallback(
    debounce(() => {
      qc.invalidateQueries({ queryKey: WORKSHOP_GARMENTS_KEY });
      qc.invalidateQueries({ queryKey: SCHEDULER_KEY });
      qc.invalidateQueries({ queryKey: TERMINAL_KEY });
      qc.invalidateQueries({ queryKey: WORKLOAD_KEY });
      qc.invalidateQueries({ queryKey: COMPLETED_TODAY_KEY });
      qc.invalidateQueries({ queryKey: SIDEBAR_COUNTS_KEY });
      qc.invalidateQueries({ queryKey: ASSIGNED_OVERVIEW_KEY });
      qc.invalidateQueries({ queryKey: ASSIGNED_PAGE_KEY });
      qc.invalidateQueries({ queryKey: COMPLETED_VIEW_KEY });
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'garment' });
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'order-garments' });
    }, 300),
    [qc],
  );

  const onDispatchLogChange = useCallback(
    debounce(() => {
      qc.invalidateQueries({ queryKey: ['dispatchHistory'] });
    }, 300),
    [qc],
  );

  const onTransferChange = useCallback(
    debounce(() => {
      qc.invalidateQueries({ queryKey: ['transfer-requests'] });
    }, 300),
    [qc],
  );

  const onInventoryChange = useCallback(
    debounce(() => {
      qc.invalidateQueries({ queryKey: ['fabrics'] });
      qc.invalidateQueries({ queryKey: ['shelf'] });
      qc.invalidateQueries({ queryKey: ['accessories'] });
    }, 300),
    [qc],
  );

  useEffect(() => {
    if (!currentUserId) return;

    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    async function setup() {
      // Ensure the realtime socket carries the current session JWT before
      // subscribing, otherwise RLS silently filters out all events.
      const { data: { session } } = await db.auth.getSession();
      if (session?.access_token) {
        db.realtime.setAuth(session.access_token);
      }

      if (cancelled) return;

      // Keep the realtime socket auth fresh when the JWT is refreshed,
      // so the channel doesn't drop on token expiry.
      const { data: { subscription: authSub } } = db.auth.onAuthStateChange(
        (event, newSession) => {
          if (newSession?.access_token && (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN')) {
            db.realtime.setAuth(newSession.access_token);
          }
        },
      );

      channel = db
        .channel('workshop-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'garments' },
          onGarmentChange,
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'dispatch_log' },
          onDispatchLogChange,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'transfer_requests' },
          onTransferChange,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'transfer_request_items' },
          onTransferChange,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'fabrics' },
          onInventoryChange,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'shelf' },
          onInventoryChange,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'accessories' },
          onInventoryChange,
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications' },
          (payload) => {
            const row = payload.new as {
              id?: number;
              department?: string;
              scope?: 'department' | 'user';
              recipient_user_id?: string | null;
              title?: string;
              body?: string | null;
              type?: string;
            };
            const isForMe =
              row.scope === 'user'
                ? !!currentUserId && row.recipient_user_id === currentUserId
                : row.department === 'workshop';
            if (!isForMe) return;
            qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
            // Deduplicate: skip if we already showed a toast for this notification
            if (row.id != null) {
              if (shownNotificationIds.current.has(row.id)) return;
              shownNotificationIds.current.add(row.id);
              // Cap the set size so it doesn't grow unbounded
              if (shownNotificationIds.current.size > 200) {
                const first = shownNotificationIds.current.values().next().value!;
                shownNotificationIds.current.delete(first);
              }
            }
            if (row.title) showNotificationToast({ title: row.title, body: row.body, type: row.type });
          },
        )
        .subscribe((status, err) => {
          console.log('[Realtime] workshop-realtime status:', status, err ?? '');
        });

      // Store auth subscription cleanup alongside channel
      (channel as any)._authUnsub = authSub.unsubscribe;
    }

    setup();

    // When the tab comes back from background, the WebSocket may have been
    // killed by the browser. Supabase reconnects automatically, but any
    // events fired while backgrounded are lost. Invalidate all queries so
    // the UI picks up changes that happened while away.
    // Debounced to prevent multiple firings on rapid tab switches.
    const onVisibilityChange = debounce(() => {
      if (document.visibilityState === 'visible') {
        qc.invalidateQueries({ refetchType: 'active' });
      }
    }, 100);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (channel) {
        (channel as any)._authUnsub?.();
        db.removeChannel(channel);
      }
    };
  }, [qc, currentUserId, onGarmentChange, onDispatchLogChange, onTransferChange, onInventoryChange]);
}
