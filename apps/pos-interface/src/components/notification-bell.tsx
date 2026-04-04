import { useState } from "react";
import { Bell, Truck, PackageCheck, Eye, ArrowRightLeft, CheckCheck } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui/popover";
import { useNotifications, useUnreadCount, useMarkRead, useMarkAllRead } from "@/hooks/useNotifications";
import type { NotificationItem } from "@/api/notifications";

const TYPE_ICONS: Record<string, typeof Bell> = {
  garment_dispatched_to_shop: Truck,
  garment_dispatched_to_workshop: Truck,
  garment_ready_for_pickup: PackageCheck,
  garment_awaiting_trial: Eye,
  transfer_requested: ArrowRightLeft,
  transfer_status_changed: ArrowRightLeft,
};

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function NotificationRow({
  notification,
  onRead,
}: {
  notification: NotificationItem;
  onRead: (id: number) => void;
}) {
  const Icon = TYPE_ICONS[notification.type] ?? Bell;

  return (
    <button
      type="button"
      onClick={() => {
        if (!notification.is_read) onRead(notification.id);
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
  const { data: notifications = [] } = useNotifications();
  const unreadCount = useUnreadCount();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

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
              />
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
