import { db } from "@/lib/db";

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  expires_at: string;
  is_read: boolean;
  read_at: string | null;
}

export async function getNotifications(limit = 50): Promise<NotificationItem[]> {
  const { data, error } = await db.rpc("get_my_notifications", { p_limit: limit, p_department: "shop" });
  if (error) throw error;
  return (data as NotificationItem[]) ?? [];
}

export async function getUnreadCount(): Promise<number> {
  const { data, error } = await db.rpc("get_unread_notification_count", { p_department: "shop" });
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function markNotificationRead(notificationId: number): Promise<void> {
  const { error } = await db.rpc("mark_notification_read", { p_notification_id: notificationId });
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await db.rpc("mark_all_notifications_read", { p_department: "shop" });
  if (error) throw error;
}
