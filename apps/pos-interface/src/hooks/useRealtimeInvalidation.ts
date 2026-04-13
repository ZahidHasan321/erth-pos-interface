import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { NOTIFICATIONS_KEY } from './useNotifications';
import { TRANSFER_BADGE_KEY } from './useTransfers';
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

// Locations that affect the "Orders at Showroom" page. Everything else
// (workshop production stages) should not trigger a refetch of that query.
const SHOWROOM_LOCATIONS = new Set(['shop', 'transit_to_shop']);

function rowTouchesShowroom(row: any): boolean {
  if (!row) return false;
  return typeof row.location === 'string' && SHOWROOM_LOCATIONS.has(row.location);
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
  const showroomDirty = useRef(false);

  const onGarmentChange = useCallback(
    debounce(() => {
      qc.invalidateQueries({ queryKey: ['dispatched-orders'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      if (showroomDirty.current) {
        qc.invalidateQueries({ queryKey: ['showroom-orders'] });
        showroomDirty.current = false;
      }
      qc.invalidateQueries({ queryKey: ['order-history'] });
      qc.invalidateQueries({ queryKey: ['dispatchOrders'] });
      qc.invalidateQueries({ queryKey: ['redispatchGarments'] });
      qc.invalidateQueries({ queryKey: ['inTransitToWorkshop'] });
      qc.invalidateQueries({ queryKey: ['alteration-garments'] });
    }, 500),
    [qc],
  );

  const onOrderChange = useCallback(
    debounce(() => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['showroom-orders'] });
      qc.invalidateQueries({ queryKey: ['order-history'] });
      qc.invalidateQueries({ queryKey: ['dispatched-orders'] });
      qc.invalidateQueries({ queryKey: ['dispatchOrders'] });
    }, 300),
    [qc],
  );

  const onDispatchLogChange = useCallback(
    debounce(() => {
      qc.invalidateQueries({ queryKey: ['dispatchHistory'] });
    }, 300),
    [qc],
  );

  const onShelfItemChange = useCallback(
    debounce(() => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['showroom-orders'] });
      qc.invalidateQueries({ queryKey: ['order-history'] });
    }, 300),
    [qc],
  );

  const onTransferChange = useCallback(
    debounce(() => {
      qc.invalidateQueries({ queryKey: ['transfer-requests'] });
      qc.invalidateQueries({ queryKey: [TRANSFER_BADGE_KEY] });
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
      .channel('pos-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'garments' },
        (payload) => {
          if (rowTouchesShowroom(payload.new) || rowTouchesShowroom(payload.old)) {
            showroomDirty.current = true;
          }
          onGarmentChange();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        onOrderChange,
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dispatch_log' },
        onDispatchLogChange,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_shelf_items' },
        onShelfItemChange,
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
              : row.department === 'shop';
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
        console.log('[Realtime] pos-realtime status:', status, err ?? '');
      });

    // When the tab returns from background, refetch only POS slice keys
    // (not the whole cache — that triggers a thundering herd of refetches and
    // can lock the UI). Throttle to once per 30s.
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
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['showroom-orders'] });
      qc.invalidateQueries({ queryKey: ['order-history'] });
      qc.invalidateQueries({ queryKey: ['dispatched-orders'] });
      qc.invalidateQueries({ queryKey: ['dispatchOrders'] });
      qc.invalidateQueries({ queryKey: ['transfer-requests'] });
      qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    }, 200);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      onVisibilityChange.cancel();
      onGarmentChange.cancel();
      onOrderChange.cancel();
      onDispatchLogChange.cancel();
      onShelfItemChange.cancel();
      onTransferChange.cancel();
      onInventoryChange.cancel();
      db.removeChannel(channel);
    };
  }, [qc, currentUserId, onGarmentChange, onOrderChange, onDispatchLogChange, onShelfItemChange, onTransferChange, onInventoryChange]);
}
