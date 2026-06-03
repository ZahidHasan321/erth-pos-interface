import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Bell, Truck, PackageCheck, Eye, ArrowRightLeft, CheckCheck, ChevronLeft, ChevronRight, ExternalLink, AlertTriangle } from "lucide-react";
import { Button } from "@repo/ui/button";
import { StatusPill, type PillColor } from "@/components/shared/StatusPill";
import { cn } from "@/lib/utils";
import { useNotificationsPaginated, useNotificationsCount, useMarkRead, useMarkAllRead, useUnreadCount, NOTIFICATIONS_PAGE_SIZE } from "@/hooks/useNotifications";
import type { NotificationItem } from "@/api/notifications";
import { parseUtcTimestamp, TIMEZONE } from "@/lib/utils";

export const Route = createFileRoute("/(main)/notifications")({
  component: NotificationsPage,
  head: () => ({
    meta: [{ title: "Notifications" }],
  }),
});

// Color = meaning, not decoration. Each type maps to one semantic bucket
// (StatusPill collapses these to ok / warn / bad / info / neutral tokens).
// `accent` is the matching --status-* var for the unread left-border + icon tint.
const TYPE_CONFIG: Record<string, {
  icon: typeof Bell;
  label: string;
  color: PillColor;
  accent: string;
}> = {
  garment_dispatched_to_shop: {
    icon: Truck,
    label: "Dispatched to Shop",
    color: "blue",
    accent: "var(--status-info)",
  },
  garment_dispatched_to_workshop: {
    icon: Truck,
    label: "Dispatched to Workshop",
    color: "blue",
    accent: "var(--status-info)",
  },
  garment_ready_for_pickup: {
    icon: PackageCheck,
    label: "Ready for Pickup",
    color: "green",
    accent: "var(--status-ok)",
  },
  garment_awaiting_trial: {
    icon: Eye,
    label: "Awaiting Trial",
    color: "amber",
    accent: "var(--status-warn)",
  },
  transfer_requested: {
    icon: ArrowRightLeft,
    label: "Transfer Requested",
    color: "blue",
    accent: "var(--status-info)",
  },
  transfer_status_changed: {
    icon: ArrowRightLeft,
    label: "Transfer Updated",
    color: "blue",
    accent: "var(--status-info)",
  },
  garment_redo_requested: {
    icon: AlertTriangle,
    label: "Urgent: Redo",
    color: "red",
    accent: "var(--status-bad)",
  },
  low_stock: {
    icon: AlertTriangle,
    label: "Low Stock",
    color: "red",
    accent: "var(--status-bad)",
  },
};

const DEFAULT_CONFIG = {
  icon: Bell,
  label: "Notification",
  color: "zinc" as PillColor,
  accent: "var(--primary)",
};

type NotificationLink = { to: string; search?: Record<string, string> };

function getNotificationLink(notification: NotificationItem): NotificationLink | null {
  switch (notification.type) {
    case "garment_dispatched_to_workshop":
      // Receiving is a single sectioned page (no tabs) — navigate cleanly.
      return { to: "/receiving" };
    case "transfer_requested":
    case "transfer_status_changed":
      // Both land on the default "Needs you" tab — the action surface for the
      // recipient (send a requested transfer / receive a dispatched one).
      return { to: "/store/transfers" };
    case "low_stock":
      return { to: "/store/inventory" };
    case "garment_redo_requested": {
      const orderId = notification.metadata?.order_id;
      if (typeof orderId === "number" || typeof orderId === "string") {
        return { to: `/assigned/${orderId}` };
      }
      return null;
    }
    default:
      return null;
  }
}

function formatDate(dateStr: string): string {
  const date = parseUtcTimestamp(dateStr);
  return date.toLocaleDateString("en-GB", {
    timeZone: TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
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
  return formatDate(dateStr);
}

type FilterValue = "all" | "unread" | string;

const FILTER_OPTIONS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "garment_dispatched_to_workshop", label: "Dispatched to Workshop" },
  { value: "garment_dispatched_to_shop", label: "Dispatched to Shop" },
  { value: "garment_ready_for_pickup", label: "Ready for Pickup" },
  { value: "garment_awaiting_trial", label: "Awaiting Trial" },
  { value: "transfer_requested", label: "Transfer Requested" },
  { value: "transfer_status_changed", label: "Transfer Updated" },
  { value: "low_stock", label: "Low Stock" },
  { value: "garment_redo_requested", label: "Urgent: Redo" },
];

function NotificationsPage() {
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<FilterValue>("all");
  // The filter selector drives the SERVER query: "all" → no narrowing,
  // "unread" → unread only, a specific type → that type. No client-side filter.
  const queryType = filter === "all" || filter === "unread" ? undefined : filter;
  const unreadOnly = filter === "unread";
  const { data: notifications = [], isPlaceholderData } = useNotificationsPaginated(page, queryType, unreadOnly);
  const { data: count = 0 } = useNotificationsCount(queryType, unreadOnly);
  const unreadCount = useUnreadCount();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const navigate = useNavigate();

  const handleClick = (notification: NotificationItem) => {
    if (!notification.is_read) markRead.mutate(notification.id);
    const link = getNotificationLink(notification);
    if (link) navigate({ to: link.to, search: link.search });
  };

  const hasMore = (page + 1) * NOTIFICATIONS_PAGE_SIZE < count;

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}` : "You're all caught up"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
          >
            <CheckCheck className="h-4 w-4 mr-1.5" />
            Mark all read
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            variant={filter === opt.value ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs"
            onClick={() => { setFilter(opt.value); setPage(0); }}
          >
            {opt.label}
            {opt.value === "unread" && unreadCount > 0 && (
              <span className="ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-medium text-destructive-foreground">
                {unreadCount}
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* Notification list */}
      <div className="mt-4">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-md border bg-card py-16 text-muted-foreground">
            <Bell className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">
              {filter === "all" ? "No notifications" : "No matching notifications"}
            </p>
            <p className="text-xs mt-1">
              {filter === "all" ? "You're all caught up" : "Try a different filter"}
            </p>
          </div>
        ) : (
          <div className={`space-y-3 ${isPlaceholderData ? "opacity-50 pointer-events-none" : ""}`}>
            {notifications.map((n) => {
              const config = TYPE_CONFIG[n.type] ?? DEFAULT_CONFIG;
              const Icon = config.icon;
              const link = getNotificationLink(n);
              const isUnread = !n.is_read;

              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleClick(n)}
                  style={isUnread ? { borderLeftColor: config.accent } : undefined}
                  className={cn(
                    "group w-full rounded-md border bg-card text-left transition-colors hover:bg-muted/30",
                    link ? "cursor-pointer" : "cursor-default",
                    isUnread && "border-l-2",
                  )}
                >
                  <div className="flex items-start gap-4 px-5 py-4">
                    {/* Icon */}
                    <div
                      className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted"
                      style={isUnread ? { color: config.accent } : undefined}
                    >
                      <Icon className={cn("h-5 w-5", !isUnread && "text-muted-foreground")} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {isUnread && (
                            <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                          )}
                          <p className={cn("text-sm truncate", isUnread ? "font-medium" : "text-muted-foreground")}>
                            {n.title}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                          {formatTimeAgo(n.created_at)}
                        </span>
                      </div>
                      {n.body && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{n.body}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2.5">
                        <StatusPill color={config.color}>{config.label}</StatusPill>
                        {link && (
                          <span className="text-xs text-muted-foreground/50 flex items-center gap-1">
                            <ExternalLink className="h-3 w-3" />
                            View
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {(page > 0 || hasMore) && (
        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Newer
          </Button>
          <span className="text-sm text-muted-foreground">Page {page + 1}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasMore || isPlaceholderData}
          >
            Older
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
