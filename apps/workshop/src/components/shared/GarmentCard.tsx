import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn, formatDate } from "@/lib/utils";
import { StageBadge, AlterationBadge, ExpressBadge } from "./StageBadge";
import { ProductionPipeline } from "./ProductionPipeline";

import type { WorkshopGarment } from "@repo/database";
import { ChevronDown, ChevronUp, Home } from "lucide-react";

interface GarmentCardProps {
  garment: WorkshopGarment;
  selected?: boolean;
  onSelect?: (id: string, checked: boolean) => void;
  actions?: React.ReactNode;
  showPipeline?: boolean;
  /** Terminal mode: hides customer/business details, shows only what workers need */
  compact?: boolean;
  index?: number;
  /** Makes the card clickable — uses full-width row layout, hides expand */
  onClick?: () => void;
}

export function GarmentCard({
  garment,
  selected = false,
  onSelect,
  actions,
  showPipeline = true,
  compact = false,
  index = 0,
  onClick,
}: GarmentCardProps) {
  const [expanded, setExpanded] = useState(false);

  const hasNotes = !!garment.notes;
  const hasSoaking = !!garment.soaking;

  // ── Grid tile card (terminal list) — large, worker-friendly ──
  if (onClick && compact) {
    return (
      <Card
        className={cn(
          "border-2 transition-all duration-200 ease-in-out shadow-sm py-0 gap-0",
          "cursor-pointer hover:border-primary/50 hover:shadow-lg active:scale-[0.97]",
          garment.express && "border-orange-300",
          garment.start_time
            ? "bg-emerald-50/50 border-emerald-300"
            : "bg-white",
        )}
        onClick={onClick}
      >
        <CardContent className="p-4 flex flex-col h-full min-h-[120px]">
          {/* Top: type + express */}
          <div className="flex items-start justify-between gap-1">
            <div className={cn(
              "px-2.5 py-1 rounded-lg text-sm font-black uppercase",
              garment.garment_type === "brova"
                ? "bg-purple-100 text-purple-800"
                : "bg-blue-100 text-blue-800",
            )}>
              {garment.garment_type === "brova" ? "Brova" : "Final"}
            </div>
            {garment.express && <ExpressBadge />}
          </div>

          {/* Garment ID — hero text */}
          <p className="font-mono font-black text-3xl mt-2 leading-tight">
            {garment.garment_id ?? garment.id.slice(0, 8)}
          </p>

          {/* Style */}
          {garment.style_name && (
            <p className="text-base text-muted-foreground capitalize mt-1 truncate">{garment.style_name}</p>
          )}

          {/* Badges row */}
          <div className="flex items-center gap-2 mt-auto pt-3 flex-wrap">
            {garment.start_time && (
              <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg">
                Started
              </span>
            )}
            {hasSoaking && (
              <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2.5 py-1 rounded-lg">
                Soak
              </span>
            )}
            <AlterationBadge tripNumber={garment.trip_number} />
            {hasNotes && (
              <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-lg" title={garment.notes ?? ""}>
                Note
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Standard card (non-clickable or non-compact) ─────────────
  return (
    <Card
      className={cn(
        "border transition-all duration-200 ease-in-out shadow-sm py-0 gap-0",
        selected && "border-primary ring-1 ring-primary/30",
        garment.express && "border-l-4 border-l-orange-400",
        onClick && "cursor-pointer hover:border-primary/50 hover:shadow-md",
      )}
      style={{ animationDelay: `${index * 25}ms` }}
      onClick={onClick}
    >
      <CardContent className={cn("px-4", compact ? "py-2" : "py-3")}>
        <div className="flex items-start gap-3">
          {onSelect && (
            <Checkbox
              checked={selected}
              onCheckedChange={(v) => onSelect(garment.id, !!v)}
              className="shrink-0 mt-1"
            />
          )}

          <div className="flex-1 min-w-0 space-y-1.5">
            {/* Top row: type badge + ID + badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  "text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border",
                  garment.garment_type === "brova"
                    ? "bg-purple-100 text-purple-800 border-purple-200"
                    : "bg-blue-100 text-blue-800 border-blue-200",
                )}
              >
                {garment.garment_type}
              </span>
              <span className="font-mono font-bold text-sm shrink-0">
                {garment.garment_id ?? garment.id.slice(0, 8)}
              </span>
              {!compact && (
                <span className="font-semibold text-sm truncate">
                  {garment.customer_name ?? "—"}
                </span>
              )}
              <StageBadge stage={garment.piece_stage} />
              {garment.express && <ExpressBadge />}
              <AlterationBadge tripNumber={garment.trip_number} />
            </div>

            {/* Compact mode: show only production-relevant info */}
            {compact ? (
              <div className="flex items-center flex-wrap gap-1.5">
                {hasSoaking && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md">
                    Needs soaking
                  </span>
                )}
                {garment.invoice_number && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
                    #{garment.invoice_number}
                  </span>
                )}
              </div>
            ) : (
              /* Full mode: show all metadata */
              <div className="flex items-center flex-wrap gap-1.5">
                {garment.invoice_number && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
                    #{garment.invoice_number}
                  </span>
                )}
                {garment.customer_mobile && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
                    {garment.customer_mobile}
                  </span>
                )}
                {garment.assigned_date && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
                    Assigned {formatDate(garment.assigned_date)}
                  </span>
                )}
                {garment.delivery_date_order && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                    Due {formatDate(garment.delivery_date_order)}
                  </span>
                )}
                {garment.home_delivery_order && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-md border border-indigo-200">
                    <Home className="w-3 h-3" />
                    Delivery
                  </span>
                )}
              </div>
            )}

            {/* Notes shown inline in compact mode */}
            {compact && hasNotes && (
              <div className="bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                <p className="text-xs text-amber-900">{garment.notes}</p>
              </div>
            )}

            {/* Pipeline */}
            {showPipeline && garment.in_production && (
              <div className="mt-1">
                <ProductionPipeline currentStage={garment.piece_stage} compact hasSoaking={hasSoaking} />
              </div>
            )}
          </div>

          {/* Actions + expand */}
          {(actions || !onClick) && (
            <div className="flex items-center gap-2 shrink-0">
              {actions}
              {!onClick && (
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className={cn(
                    "p-1.5 rounded-md hover:bg-muted transition-colors",
                    expanded && "bg-muted",
                  )}
                >
                  {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Expanded: measurements + notes */}
        {expanded && (
          <div className="mt-3 pt-3 border-t space-y-3 animate-fade-in">
            {!compact && garment.notes && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 mb-1">
                  Notes
                </p>
                <p className="text-sm text-amber-900">{garment.notes}</p>
              </div>
            )}
            {/* Order & garment details */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</p>
                <p className="font-medium">{garment.customer_name ?? "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Phone</p>
                <p className="font-medium">{garment.customer_mobile ?? "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice</p>
                <p className="font-medium">{garment.invoice_number ? `INV-${garment.invoice_number}` : "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Delivery Date</p>
                <p className="font-medium">{garment.delivery_date_order ? formatDate(garment.delivery_date_order) : "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Style</p>
                <p className="font-medium capitalize">{garment.style_name ?? "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Fabric</p>
                <p className="font-medium">{garment.fabric_name ?? "—"}</p>
              </div>
            </div>

          </div>
        )}
      </CardContent>
    </Card>
  );
}
