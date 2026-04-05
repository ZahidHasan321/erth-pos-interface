import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { NOTIFICATIONS_KEY } from './useNotifications';
import { showNotificationToast } from '@/components/notification-toast';
import { useAuth } from '@/context/auth';

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

  useEffect(() => {
    const channel = db
      .channel('pos-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'garments' },
        (payload) => {
          console.log('[realtime:pos] garments', payload.eventType);
          qc.invalidateQueries({ queryKey: ['dispatched-orders'] });
          qc.invalidateQueries({ queryKey: ['orders'] });
          qc.invalidateQueries({ queryKey: ['showroom-orders'] });
          qc.invalidateQueries({ queryKey: ['order-history'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          console.log('[realtime:pos] orders', payload.eventType);
          qc.invalidateQueries({ queryKey: ['orders'] });
          qc.invalidateQueries({ queryKey: ['showroom-orders'] });
          qc.invalidateQueries({ queryKey: ['order-history'] });
          qc.invalidateQueries({ queryKey: ['dispatched-orders'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_shelf_items' },
        (payload) => {
          console.log('[realtime:pos] order_shelf_items', payload.eventType);
          qc.invalidateQueries({ queryKey: ['orders'] });
          qc.invalidateQueries({ queryKey: ['showroom-orders'] });
          qc.invalidateQueries({ queryKey: ['order-history'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transfer_requests' },
        (payload) => {
          console.log('[realtime:pos] transfer_requests', payload.eventType, payload.new);
          qc.invalidateQueries({ queryKey: ['transfer-requests'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transfer_request_items' },
        (payload) => {
          console.log('[realtime:pos] transfer_request_items', payload.eventType);
          qc.invalidateQueries({ queryKey: ['transfer-requests'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fabrics' },
        (payload) => {
          console.log('[realtime:pos] fabrics', payload.eventType);
          qc.invalidateQueries({ queryKey: ['fabrics'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shelf' },
        (payload) => {
          console.log('[realtime:pos] shelf', payload.eventType);
          qc.invalidateQueries({ queryKey: ['shelf'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'accessories' },
        (payload) => {
          console.log('[realtime:pos] accessories', payload.eventType);
          qc.invalidateQueries({ queryKey: ['accessories'] });
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          console.log('[realtime:pos] notification event:', payload.new);
          const row = payload.new as {
            department?: string;
            scope?: 'department' | 'user';
            recipient_user_id?: string | null;
            title?: string;
            body?: string | null;
            type?: string;
          };
          // Department broadcasts → keep if this app's department matches.
          // User-scoped → keep only if addressed to the current user.
          const isForMe =
            row.scope === 'user'
              ? !!currentUserId && row.recipient_user_id === currentUserId
              : row.department === 'shop';
          if (!isForMe) {
            console.log('[realtime:pos] skipping notification', { scope: row.scope, dept: row.department });
            return;
          }
          qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
          if (row.title) showNotificationToast({ title: row.title, body: row.body, type: row.type });
        },
      )
      .subscribe((status, err) => {
        console.log('[realtime:pos] channel status:', status, err ?? '');
      });

    return () => {
      db.removeChannel(channel);
    };
  }, [qc, currentUserId]);
}
