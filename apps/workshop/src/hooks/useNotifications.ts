import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getNotifications,
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

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });
}
