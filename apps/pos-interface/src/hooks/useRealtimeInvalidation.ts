import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { NOTIFICATIONS_KEY } from './useNotifications';
import { showNotificationToast } from '@/components/notification-toast';

/**
 * Subscribes to Supabase Realtime changes on key tables and invalidates
 * the relevant TanStack Query caches. Replaces polling with push-based updates.
 *
 * Mount once in the authenticated layout.
 */
export function useRealtimeInvalidation() {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = db
      .channel('pos-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'garments' },
        () => {
          qc.invalidateQueries({ queryKey: ['dispatched-orders'] });
          qc.invalidateQueries({ queryKey: ['orders'] });
          qc.invalidateQueries({ queryKey: ['showroom-orders'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transfer_requests' },
        () => {
          qc.invalidateQueries({ queryKey: ['transfer-requests'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transfer_request_items' },
        () => {
          qc.invalidateQueries({ queryKey: ['transfer-requests'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fabrics' },
        () => {
          qc.invalidateQueries({ queryKey: ['fabrics'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shelf' },
        () => {
          qc.invalidateQueries({ queryKey: ['shelf'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'accessories' },
        () => {
          qc.invalidateQueries({ queryKey: ['accessories'] });
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          console.log('[realtime:pos] notification event:', payload.new);
          const row = payload.new as { department?: string; title?: string; body?: string | null; type?: string };
          if (row.department !== 'shop') {
            console.log('[realtime:pos] skipping (dept=', row.department, ')');
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
  }, [qc]);
}
