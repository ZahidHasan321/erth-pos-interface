import { toast } from 'sonner';
import { Bell, Truck, PackageCheck, Eye, ArrowRightLeft, X } from 'lucide-react';

const TYPE_CONFIG: Record<string, { icon: typeof Bell; iconBg: string; iconColor: string }> = {
  garment_dispatched_to_shop: { icon: Truck, iconBg: 'bg-blue-100 dark:bg-blue-950', iconColor: 'text-blue-600 dark:text-blue-400' },
  garment_dispatched_to_workshop: { icon: Truck, iconBg: 'bg-indigo-100 dark:bg-indigo-950', iconColor: 'text-indigo-600 dark:text-indigo-400' },
  garment_ready_for_pickup: { icon: PackageCheck, iconBg: 'bg-emerald-100 dark:bg-emerald-950', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  garment_awaiting_trial: { icon: Eye, iconBg: 'bg-amber-100 dark:bg-amber-950', iconColor: 'text-amber-600 dark:text-amber-400' },
  transfer_requested: { icon: ArrowRightLeft, iconBg: 'bg-violet-100 dark:bg-violet-950', iconColor: 'text-violet-600 dark:text-violet-400' },
  transfer_status_changed: { icon: ArrowRightLeft, iconBg: 'bg-violet-100 dark:bg-violet-950', iconColor: 'text-violet-600 dark:text-violet-400' },
};

const DEFAULT_CONFIG = { icon: Bell, iconBg: 'bg-primary/10', iconColor: 'text-primary' };

export function showNotificationToast({
  title,
  body,
  type,
}: {
  title: string;
  body?: string | null;
  type?: string;
}) {
  const config = (type && TYPE_CONFIG[type]) || DEFAULT_CONFIG;
  const Icon = config.icon;

  toast.custom(
    (id) => (
      <div className="flex w-[356px] items-start gap-3 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${config.iconBg}`}>
          <Icon className={`h-4 w-4 ${config.iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">{title}</p>
          {body && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{body}</p>
          )}
          <p className="mt-1 text-[11px] text-muted-foreground/70">Just now</p>
        </div>
        <button
          type="button"
          onClick={() => toast.dismiss(id)}
          className="shrink-0 rounded-md p-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    ),
    { position: 'top-right', duration: 5000 },
  );
}
