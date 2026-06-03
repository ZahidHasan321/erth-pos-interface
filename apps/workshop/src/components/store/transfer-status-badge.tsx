import { Clock, CheckCircle2, XCircle, Truck, PackageCheck, PackageOpen } from "lucide-react";
import { TRANSFER_STATUS_LABELS, TRANSFER_STATUS_COLORS } from "./transfer-constants";

const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  requested: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
  dispatched: Truck,
  partially_received: PackageOpen,
  received: PackageCheck,
};

export function TransferStatusBadge({ status, size = "sm" }: { status: string; size?: "sm" | "xs" }) {
  const Icon = STATUS_ICONS[status];
  const padding = size === "xs" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md font-medium ${padding} ${TRANSFER_STATUS_COLORS[status] ?? "bg-muted text-muted-foreground"}`}>
      {Icon && <Icon className={size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5"} />}
      {TRANSFER_STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function TransferDirectionLabel({ direction }: { direction: string }) {
  const label = direction === "shop_to_workshop" ? "Shop → Workshop" : "Workshop → Shop";
  return <span className="text-sm text-muted-foreground">{label}</span>;
}

// Item type is categorical, not a status — neutral chip. The label carries the
// distinction, not three pastel hues competing for the eye.
export function ItemTypeBadge({ itemType }: { itemType: string }) {
  const labels: Record<string, string> = { fabric: "Fabric", shelf: "Shelf", accessory: "Accessory" };
  return (
    <span className="inline-flex items-center rounded-md border border-border bg-card px-2 py-0.5 text-xs font-medium text-foreground">
      {labels[itemType] ?? itemType}
    </span>
  );
}
