import { toast } from 'sonner';
import { Bell, Truck, PackageCheck, Eye, ArrowRightLeft, X, AlertTriangle } from 'lucide-react';

type TypeConfig = { icon: typeof Bell; iconBg: string; iconColor: string; urgent?: boolean };

const TYPE_CONFIG: Record<string, TypeConfig> = {
  garment_dispatched_to_shop: { icon: Truck, iconBg: 'bg-blue-100 dark:bg-blue-950', iconColor: 'text-blue-600 dark:text-blue-400' },
  garment_dispatched_to_workshop: { icon: Truck, iconBg: 'bg-indigo-100 dark:bg-indigo-950', iconColor: 'text-indigo-600 dark:text-indigo-400' },
  garment_ready_for_pickup: { icon: PackageCheck, iconBg: 'bg-emerald-100 dark:bg-emerald-950', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  garment_awaiting_trial: { icon: Eye, iconBg: 'bg-amber-100 dark:bg-amber-950', iconColor: 'text-amber-600 dark:text-amber-400' },
  transfer_requested: { icon: ArrowRightLeft, iconBg: 'bg-violet-100 dark:bg-violet-950', iconColor: 'text-violet-600 dark:text-violet-400' },
  transfer_status_changed: { icon: ArrowRightLeft, iconBg: 'bg-violet-100 dark:bg-violet-950', iconColor: 'text-violet-600 dark:text-violet-400' },
  garment_redo_requested: { icon: AlertTriangle, iconBg: 'bg-red-600', iconColor: 'text-white', urgent: true },
};

const DEFAULT_CONFIG: TypeConfig = { icon: Bell, iconBg: 'bg-primary/10', iconColor: 'text-primary' };

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
  const urgent = !!config.urgent;

  toast.custom(
    (id) => (
      <div
        className={
          urgent
            ? 'flex w-[356px] items-start gap-3 rounded-lg border-2 border-red-600 bg-red-50 dark:bg-red-950 p-4 text-red-900 dark:text-red-50 shadow-lg ring-4 ring-red-600/30 animate-pulse'
            : 'flex w-[356px] items-start gap-3 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg'
        }
      >
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${config.iconBg}`}>
          <Icon className={`h-4 w-4 ${config.iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={urgent ? 'text-sm font-black uppercase tracking-wide leading-tight' : 'text-sm font-semibold leading-tight'}>{title}</p>
          {body && (
            <p className={urgent ? 'mt-1 text-xs text-red-800 dark:text-red-200 line-clamp-3' : 'mt-1 text-xs text-muted-foreground line-clamp-2'}>{body}</p>
          )}
          {urgent ? (
            <button
              type="button"
              onClick={() => toast.dismiss(id)}
              className="mt-3 w-full rounded-md bg-red-600 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-red-700 transition-colors"
            >
              Acknowledge
            </button>
          ) : (
            <p className="mt-1 text-[11px] text-muted-foreground/70">Just now</p>
          )}
        </div>
        {!urgent && (
          <button
            type="button"
            onClick={() => toast.dismiss(id)}
            className="shrink-0 rounded-md p-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    ),
    { position: 'top-right', duration: urgent ? Infinity : 5000, dismissible: !urgent },
  );
}
