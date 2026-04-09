import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { WORKSHOP_GARMENTS_KEY, ASSIGNED_VIEW_KEY } from './useWorkshopGarments';
import { NOTIFICATIONS_KEY } from './useNotifications';
import { showNotificationToast } from '@/components/notification-toast';
import { useAuth } from '@/context/auth';
import type { RealtimeChannel } from '@supabase/supabase-js';

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
          () => {
            qc.invalidateQueries({ queryKey: WORKSHOP_GARMENTS_KEY });
            qc.invalidateQueries({ queryKey: ASSIGNED_VIEW_KEY });
            qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'garment' });
            qc.invalidateQueries({ queryKey: ['completed-today-garments'] });
          },
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'dispatch_log' },
          () => {
            qc.invalidateQueries({ queryKey: ['dispatchHistory'] });
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

    return () => {
      cancelled = true;
      if (channel) {
        (channel as any)._authUnsub?.();
        db.removeChannel(channel);
      }
    };
  }, [qc, currentUserId]);
}
