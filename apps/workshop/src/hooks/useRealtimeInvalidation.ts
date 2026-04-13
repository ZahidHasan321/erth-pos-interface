import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import {
  WORKSHOP_GARMENTS_KEY,
  SCHEDULER_KEY,
  TERMINAL_KEY,
  BOARD_KEY,
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

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): { (...args: Parameters<T>): void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const debounced = ((...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as { (...args: Parameters<T>): void; cancel: () => void };
  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
  };
  return debounced;
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
  // Collect ids touched between debounce ticks so detail invalidations are
  // scoped instead of wildcarded across every cached garment/order-garments key.
  const touchedGarmentIds = useRef(new Set<string>());
  const touchedOrderIds = useRef(new Set<number>());

  const onGarmentChange = useCallback(
    debounce(() => {
      qc.invalidateQueries({ queryKey: WORKSHOP_GARMENTS_KEY });
      qc.invalidateQueries({ queryKey: SCHEDULER_KEY });
      qc.invalidateQueries({ queryKey: TERMINAL_KEY });
      qc.invalidateQueries({ queryKey: BOARD_KEY });
      qc.invalidateQueries({ queryKey: WORKLOAD_KEY });
      qc.invalidateQueries({ queryKey: COMPLETED_TODAY_KEY });
      qc.invalidateQueries({ queryKey: SIDEBAR_COUNTS_KEY });
      qc.invalidateQueries({ queryKey: ASSIGNED_OVERVIEW_KEY });
      qc.invalidateQueries({ queryKey: ASSIGNED_PAGE_KEY });
      qc.invalidateQueries({ queryKey: COMPLETED_VIEW_KEY });
      // Only invalidate detail caches for garments / orders we actually saw
      // a change on — wildcard predicates were thrashing every open detail.
      for (const id of touchedGarmentIds.current) {
        qc.invalidateQueries({ queryKey: ['garment', id] });
      }
      for (const id of touchedOrderIds.current) {
        qc.invalidateQueries({ queryKey: ['order-garments', id] });
      }
      touchedGarmentIds.current.clear();
      touchedOrderIds.current.clear();
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
    // AuthProvider is the single owner of db.realtime.setAuth — it sets it on
    // initial session restore AND on every TOKEN_REFRESHED/SIGNED_IN event.
    // By the time currentUserId is non-null here, the realtime socket already
    // carries the JWT, so no second listener is needed in this hook.
    if (!currentUserId) return;

    const channel: RealtimeChannel = db
      .channel('workshop-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'garments' },
        (payload) => {
          const row = (payload.new ?? payload.old) as { id?: string; order_id?: number } | null;
          if (row?.id) touchedGarmentIds.current.add(row.id);
          if (row?.order_id != null) touchedOrderIds.current.add(row.order_id);
          onGarmentChange();
        },
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
          if (row.id != null) {
            if (shownNotificationIds.current.has(row.id)) return;
            shownNotificationIds.current.add(row.id);
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

    // Workshop tabs sit in the background a lot. When the tab returns, the
    // websocket is reconnecting but events from the gap are gone. Invalidate
    // workshop slice keys (NOT the whole cache — that nukes unrelated routes
    // and triggers a thundering herd of refetches that lock the UI up).
    let lastFocusRefetch = 0;
    const onVisibilityChange = debounce(() => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastFocusRefetch < 30_000) return;
      lastFocusRefetch = now;
      // Cancel anything still "fetching" — fetches issued while the tab was
      // hidden may never resolve, and TanStack dedupes new mounts onto that
      // dead promise. Cancelling flips them back to idle so the next mount /
      // invalidate actually re-fires the queryFn.
      qc.cancelQueries({ fetchStatus: 'fetching' });
      qc.invalidateQueries({ queryKey: WORKSHOP_GARMENTS_KEY });
      qc.invalidateQueries({ queryKey: SCHEDULER_KEY });
      qc.invalidateQueries({ queryKey: TERMINAL_KEY });
      qc.invalidateQueries({ queryKey: BOARD_KEY });
      qc.invalidateQueries({ queryKey: WORKLOAD_KEY });
      qc.invalidateQueries({ queryKey: SIDEBAR_COUNTS_KEY });
      qc.invalidateQueries({ queryKey: ASSIGNED_OVERVIEW_KEY });
      qc.invalidateQueries({ queryKey: ASSIGNED_PAGE_KEY });
      qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
      qc.invalidateQueries({ queryKey: ['transfer-requests'] });
    }, 200);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      onVisibilityChange.cancel();
      onGarmentChange.cancel();
      onDispatchLogChange.cancel();
      onTransferChange.cancel();
      onInventoryChange.cancel();
      db.removeChannel(channel);
    };
  }, [qc, currentUserId, onGarmentChange, onDispatchLogChange, onTransferChange, onInventoryChange]);
}
