import { useState } from "react";
import { Bell, Truck, PackageCheck, Eye, ArrowRightLeft, CheckCheck } from "lucide-react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Button } from "@repo/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui/popover";
import { useNotifications, useUnreadCount, useMarkRead, useMarkAllRead } from "@/hooks/useNotifications";
import type { NotificationItem } from "@/api/notifications";
import { parseUtcTimestamp, TIMEZONE } from "@/lib/utils";

const TYPE_ICONS: Record<string, typeof Bell> = {
  garment_dispatched_to_shop: Truck,
  garment_dispatched_to_workshop: Truck,
  garment_ready_for_pickup: PackageCheck,
  garment_awaiting_trial: Eye,
  transfer_requested: ArrowRightLeft,
  transfer_status_changed: ArrowRightLeft,
};

type NotificationLink = { to: string; search?: Record<string, string> };

function getNotificationLink(notification: NotificationItem, mainSegment: string): NotificationLink | null {
  const meta = notification.metadata as Record<string, unknown> | null;
  const orderId = meta?.order_id;

  switch (notification.type) {
    case "garment_dispatched_to_shop":
      return { to: `/${mainSegment}/orders/order-management/receiving-brova-final` };
    case "garment_ready_for_pickup":
      return { to: `/${mainSegment}/orders/orders-at-showroom`, search: { stage: "ready_for_pickup" } };
    case "garment_awaiting_trial":
      return orderId
        ? { to: `/${mainSegment}/orders/order-management/feedback/${orderId}` }
        : { to: `/${mainSegment}/orders/orders-at-showroom`, search: { stage: "brova_trial" } };
    case "transfer_requested":
      return { to: `/${mainSegment}/store/approve-requests`, search: { tab: "pending" } };
    case "transfer_status_changed":
      return { to: `/${mainSegment}/store/approve-requests`, search: { tab: "approved" } };
    default:
      return null;
  }
}

function formatTimeAgo(dateStr: string): string {
  const date = parseUtcTimestamp(dateStr);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-GB", {
    timeZone: TIMEZONE,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function NotificationRow({
  notification,
  onRead,
  onNavigate,
  mainSegment,
}: {
  notification: NotificationItem;
  onRead: (id: number) => void;
  onNavigate: (link: NotificationLink) => void;
  mainSegment: string;
}) {
  const Icon = TYPE_ICONS[notification.type] ?? Bell;
  const link = getNotificationLink(notification, mainSegment);

  return (
    <button
      type="button"
      onClick={() => {
        if (!notification.is_read) onRead(notification.id);
        if (link) onNavigate(link);
      }}
      className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 border-b last:border-b-0 ${
        notification.is_read ? "opacity-60" : ""
      }`}
    >
      <div className="mt-0.5 shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {!notification.is_read && (
            <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
          )}
          <p className="text-sm font-medium truncate">{notification.title}</p>
        </div>
        {notification.body && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {notification.body}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {formatTimeAgo(notification.created_at)}
        </p>
      </div>
    </button>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  // Only fetch the full list when the popover opens — the badge itself only
  // needs the unread count, so the RPC for 50 rows shouldn't fire on every
  // page mount. Cache persists across open/close within staleTime.
  const { data: notifications = [] } = useNotifications(open);
  const unreadCount = useUnreadCount();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const navigate = useNavigate();
  const { main } = useParams({ strict: false }) as { main?: string };
  const mainSegment = main ?? "showroom";

  const handleNavigate = (link: NotificationLink) => {
    setOpen(false);
    navigate({ to: link.to, search: link.search as any });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h4 className="text-sm font-semibold">Notifications</h4>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto py-1 px-2 text-xs"
              onClick={() => markAllRead.mutate()}
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bell className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No notifications</p>
            </div>
          ) : (
            notifications.map((n) => (
              <NotificationRow
                key={n.id}
                notification={n}
                onRead={(id) => markRead.mutate(id)}
                onNavigate={handleNavigate}
                mainSegment={mainSegment}
              />
            ))
          )}
        </div>
        <div className="border-t px-4 py-2">
          <Link
            to={`/${mainSegment}/notifications`}
            onClick={() => setOpen(false)}
            className="block text-center text-xs font-medium text-primary hover:underline"
          >
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
