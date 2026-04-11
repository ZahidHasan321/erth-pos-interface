import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  getNotifications,
  getNotificationsPaginated,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/api/notifications";
import { getBrand } from "@/api/orders";

export const NOTIFICATIONS_KEY = ["notifications"] as const;

// Realtime subscription in useRealtimeInvalidation invalidates this cache on
// every notifications INSERT, and mark-read mutations invalidate on success,
// so polling is redundant. staleTime keeps navigations from refetching the
// list on every page mount.
const NOTIFICATIONS_STALE_TIME = 5 * 60 * 1000;

/**
 * Fetches the notification list. Pass `enabled: false` when the caller
 * doesn't need the full list (e.g. the bell badge that only shows a count),
 * so we don't pay for a 50-row RPC on every page mount.
 */
export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, getBrand()],
    queryFn: () => getNotifications(),
    enabled,
    staleTime: NOTIFICATIONS_STALE_TIME,
  });
}

export function useUnreadCount() {
  const { data } = useQuery({
    queryKey: [...NOTIFICATIONS_KEY, "unread-count", getBrand()],
    queryFn: () => getUnreadCount(),
    staleTime: NOTIFICATIONS_STALE_TIME,
  });
  return data ?? 0;
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });
}

const PAGE_SIZE = 20;

export function useNotificationsPaginated(page: number) {
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, getBrand(), "page", page],
    queryFn: () => getNotificationsPaginated(PAGE_SIZE, page * PAGE_SIZE),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });
}
