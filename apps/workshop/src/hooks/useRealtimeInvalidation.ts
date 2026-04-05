import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { WORKSHOP_GARMENTS_KEY, ASSIGNED_VIEW_KEY } from './useWorkshopGarments';
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
      .channel('workshop-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'garments' },
        () => {
          qc.invalidateQueries({ queryKey: WORKSHOP_GARMENTS_KEY });
          qc.invalidateQueries({ queryKey: ASSIGNED_VIEW_KEY });
          qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'garment' });
          qc.invalidateQueries({ queryKey: ['completed-today-garments'] });
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
          console.log('[realtime:workshop] notification event:', payload.new);
          const row = payload.new as { department?: string; title?: string; body?: string | null; type?: string };
          if (row.department !== 'workshop') {
            console.log('[realtime:workshop] skipping (dept=', row.department, ')');
            return;
          }
          qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
          if (row.title) showNotificationToast({ title: row.title, body: row.body, type: row.type });
        },
      )
      .subscribe((status, err) => {
        console.log('[realtime:workshop] channel status:', status, err ?? '');
      });

    return () => {
      db.removeChannel(channel);
    };
  }, [qc]);
}
