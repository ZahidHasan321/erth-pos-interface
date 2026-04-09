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

export function useNotifications() {
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, getBrand()],
    queryFn: () => getNotifications(),
    staleTime: 30_000,
    refetchInterval: 30_000, // poll every 30s; realtime should also push but isn't reliable yet
  });
}

export function useUnreadCount() {
  const { data } = useQuery({
    queryKey: [...NOTIFICATIONS_KEY, "unread-count", getBrand()],
    queryFn: () => getUnreadCount(),
    staleTime: 30_000,
    refetchInterval: 30_000,
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
