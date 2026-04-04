import { toast } from 'sonner';
import { Bell, Truck, PackageCheck, Eye, ArrowRightLeft, X } from 'lucide-react';

const TYPE_ICONS: Record<string, typeof Bell> = {
  garment_dispatched_to_shop: Truck,
  garment_dispatched_to_workshop: Truck,
  garment_ready_for_pickup: PackageCheck,
  garment_awaiting_trial: Eye,
  transfer_requested: ArrowRightLeft,
  transfer_status_changed: ArrowRightLeft,
};

export function showNotificationToast({
  title,
  body,
  type,
}: {
  title: string;
  body?: string | null;
  type?: string;
}) {
  const Icon = (type && TYPE_ICONS[type]) || Bell;

  toast.custom(
    (id) => (
      <div className="flex w-[356px] items-start gap-3 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
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
