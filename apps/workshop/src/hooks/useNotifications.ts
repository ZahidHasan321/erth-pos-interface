import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  getNotifications,
  getNotificationsPaginated,
  getNotificationsCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/api/notifications";

export const NOTIFICATIONS_KEY = ["notifications"] as const;

export function useNotifications() {
  return useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: () => getNotifications(),
    staleTime: 30_000,
  });
}

/** Derive unread count from the shared notifications cache — no extra API call */
export function useUnreadCount() {
  const { data } = useNotifications();
  return data?.filter((n) => !n.is_read).length ?? 0;
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

export const NOTIFICATIONS_PAGE_SIZE = 20;
const PAGE_SIZE = NOTIFICATIONS_PAGE_SIZE;

export function useNotificationsPaginated(page: number, type?: string, unreadOnly?: boolean) {
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, "page", page, type ?? null, unreadOnly ?? false],
    queryFn: () => getNotificationsPaginated(PAGE_SIZE, page * PAGE_SIZE, type, unreadOnly),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/** Total count for the current type/unread filter — drives hasMore pagination. */
export function useNotificationsCount(type?: string, unreadOnly?: boolean) {
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, "count", type ?? null, unreadOnly ?? false],
    queryFn: () => getNotificationsCount(type, unreadOnly),
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
