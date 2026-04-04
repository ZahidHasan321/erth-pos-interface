import { useState } from "react";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { Bell, Truck, PackageCheck, Eye, ArrowRightLeft, CheckCheck, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Badge } from "@repo/ui/badge";
import { useNotificationsPaginated, useMarkRead, useMarkAllRead, useUnreadCount } from "@/hooks/useNotifications";
import type { NotificationItem } from "@/api/notifications";
import { parseUtcTimestamp } from "@/lib/utils";

export const Route = createFileRoute("/$main/notifications")({
  component: NotificationsPage,
  head: () => ({
    meta: [{ title: "Notifications" }],
  }),
});

const TYPE_CONFIG: Record<string, {
  icon: typeof Bell;
  label: string;
  color: string;
  badgeClass: string;
  iconBgUnread: string;
  iconColorUnread: string;
  accentBorder: string;
}> = {
  garment_dispatched_to_shop: {
    icon: Truck,
    label: "Dispatched to Shop",
    color: "text-blue-700 dark:text-blue-400",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
    iconBgUnread: "bg-blue-100 dark:bg-blue-950",
    iconColorUnread: "text-blue-600 dark:text-blue-400",
    accentBorder: "border-l-blue-500",
  },
  garment_dispatched_to_workshop: {
    icon: Truck,
    label: "Dispatched to Workshop",
    color: "text-indigo-700 dark:text-indigo-400",
    badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800",
    iconBgUnread: "bg-indigo-100 dark:bg-indigo-950",
    iconColorUnread: "text-indigo-600 dark:text-indigo-400",
    accentBorder: "border-l-indigo-500",
  },
  garment_ready_for_pickup: {
    icon: PackageCheck,
    label: "Ready for Pickup",
    color: "text-emerald-700 dark:text-emerald-400",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
    iconBgUnread: "bg-emerald-100 dark:bg-emerald-950",
    iconColorUnread: "text-emerald-600 dark:text-emerald-400",
    accentBorder: "border-l-emerald-500",
  },
  garment_awaiting_trial: {
    icon: Eye,
    label: "Awaiting Trial",
    color: "text-amber-700 dark:text-amber-400",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
    iconBgUnread: "bg-amber-100 dark:bg-amber-950",
    iconColorUnread: "text-amber-600 dark:text-amber-400",
    accentBorder: "border-l-amber-500",
  },
  transfer_requested: {
    icon: ArrowRightLeft,
    label: "Transfer Requested",
    color: "text-violet-700 dark:text-violet-400",
    badgeClass: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800",
    iconBgUnread: "bg-violet-100 dark:bg-violet-950",
    iconColorUnread: "text-violet-600 dark:text-violet-400",
    accentBorder: "border-l-violet-500",
  },
  transfer_status_changed: {
    icon: ArrowRightLeft,
    label: "Transfer Updated",
    color: "text-violet-700 dark:text-violet-400",
    badgeClass: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800",
    iconBgUnread: "bg-violet-100 dark:bg-violet-950",
    iconColorUnread: "text-violet-600 dark:text-violet-400",
    accentBorder: "border-l-violet-500",
  },
};

const DEFAULT_CONFIG = {
  icon: Bell,
  label: "Notification",
  color: "text-muted-foreground",
  badgeClass: "",
  iconBgUnread: "bg-primary/10",
  iconColorUnread: "text-primary",
  accentBorder: "border-l-primary",
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

function formatDate(dateStr: string): string {
  const date = parseUtcTimestamp(dateStr);
  return date.toLocaleDateString("en-GB", {
    timeZone: "Asia/Kuwait",
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
  { value: "garment_dispatched_to_shop", label: "Dispatched to Shop" },
  { value: "garment_dispatched_to_workshop", label: "Dispatched to Workshop" },
  { value: "garment_ready_for_pickup", label: "Ready for Pickup" },
  { value: "garment_awaiting_trial", label: "Awaiting Trial" },
  { value: "transfer_requested", label: "Transfer Requested" },
  { value: "transfer_status_changed", label: "Transfer Updated" },
];

function NotificationsPage() {
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<FilterValue>("all");
  const { data: notifications = [], isPlaceholderData } = useNotificationsPaginated(page);
  const unreadCount = useUnreadCount();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const navigate = useNavigate();
  const { main } = useParams({ strict: false }) as { main?: string };
  const mainSegment = main ?? "showroom";

  const handleClick = (notification: NotificationItem) => {
    if (!notification.is_read) markRead.mutate(notification.id);
    const link = getNotificationLink(notification, mainSegment);
    if (link) navigate({ to: link.to, search: link.search as any });
  };

  const filtered = notifications.filter((n) => {
    if (filter === "all") return true;
    if (filter === "unread") return !n.is_read;
    return n.type === filter;
  });

  const hasMore = notifications.length === 20;

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
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
              <span className="ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {unreadCount}
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* Notification list */}
      <div className="mt-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-16 text-muted-foreground">
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
            {filtered.map((n) => {
              const config = TYPE_CONFIG[n.type] ?? DEFAULT_CONFIG;
              const Icon = config.icon;
              const link = getNotificationLink(n, mainSegment);
              const isUnread = !n.is_read;

              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleClick(n)}
                  className={`group w-full rounded-xl border bg-card text-left transition-all hover:shadow-md hover:bg-muted/30 ${
                    link ? "cursor-pointer" : "cursor-default"
                  } ${isUnread ? `border-l-4 ${config.accentBorder}` : ""}`}
                >
                  <div className="flex items-start gap-4 px-5 py-4">
                    {/* Icon */}
                    <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                      isUnread ? config.iconBgUnread : "bg-muted"
                    }`}>
                      <Icon className={`h-5 w-5 ${isUnread ? config.iconColorUnread : "text-muted-foreground"}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {isUnread && (
                            <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                          )}
                          <p className={`text-sm truncate ${isUnread ? "font-semibold" : "text-muted-foreground"}`}>
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
                        <Badge variant="outline" className={`text-[11px] px-2 py-0 h-5 font-medium ${config.badgeClass}`}>
                          {config.label}
                        </Badge>
                        {link && (
                          <span className="text-xs text-muted-foreground/50 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
