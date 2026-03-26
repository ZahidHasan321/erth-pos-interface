import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn, clickableProps, formatDate } from "@/lib/utils";
import { StageBadge, FeedbackStatusBadge, AlterationBadge, ExpressBadge, BrandBadge } from "./StageBadge";
import { ProductionPipeline } from "./ProductionPipeline";
import { GarmentTypeBadge, GarmentTypeBadgeCompact } from "./PageShell";
import { GarmentPeekSheet } from "./PeekSheets";

import type { WorkshopGarment } from "@repo/database";
import { Home, Eye, CalendarClock } from "lucide-react";

interface GarmentCardProps {
  garment: WorkshopGarment;
  selected?: boolean;
  onSelect?: (id: string, checked: boolean) => void;
  actions?: React.ReactNode;
  showPipeline?: boolean;
  compact?: boolean;
  hideStage?: boolean;
  index?: number;
  onClick?: () => void;
}

export function GarmentCard({
  garment,
  selected = false,
  onSelect,
  actions,
  showPipeline = true,
  compact = false,
  hideStage = false,
  index = 0,
  onClick,
}: GarmentCardProps) {
  const [peekOpen, setPeekOpen] = useState(false);
  const hasSoaking = !!garment.soaking;

  const daysLeft = garment.delivery_date_order
    ? Math.ceil((new Date(garment.delivery_date_order).getTime() - Date.now()) / 86400000)
    : null;
  const isOverdue = daysLeft !== null && daysLeft < 0;
  const isUrgent = daysLeft !== null && daysLeft <= 2 && !isOverdue;

  // ── Grid tile card (terminal list) ──
  if (onClick && compact) {
    return (
      <Card
        {...clickableProps(onClick)}
        className={cn(
          "border border-border/60 transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out py-0 gap-0",
          "cursor-pointer hover:border-primary/30 hover:shadow-md active:scale-[0.97]",
          garment.express && "!border-orange-300",
          garment.start_time ? "bg-emerald-50/50 !border-emerald-200" : "bg-card",
        )}
        onClick={onClick}
      >
        <CardContent className="p-3 flex flex-col h-full min-h-[100px]">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-2">
              <GarmentTypeBadgeCompact type={garment.garment_type ?? "final"} />
              <span className="font-mono font-black text-xl leading-tight">
                {garment.garment_id ?? garment.id.slice(0, 8)}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <BrandBadge brand={garment.order_brand} />
              {garment.express && <ExpressBadge />}
              {garment.start_time && (
                <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">Started</span>
              )}
            </div>
          </div>
          <div className="mt-2 min-w-0">
            {garment.fabric_name ? (
              <>
                <p className="text-sm font-medium text-foreground truncate">{garment.fabric_name}</p>
                {garment.fabric_color && <p className="text-xs text-muted-foreground truncate">{garment.fabric_color}</p>}
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Source: Outside</p>
                {garment.fabric_color && <p className="text-xs text-muted-foreground truncate">{garment.fabric_color}</p>}
              </>
            )}
          </div>
          {garment.style_name && (
            <p className="text-xs text-muted-foreground capitalize mt-0.5 truncate">{garment.style_name}</p>
          )}
          <div className="flex items-center gap-1.5 mt-auto pt-2 flex-wrap">
            {hasSoaking && (garment.piece_stage === "waiting_cut" || garment.piece_stage === "soaking") && <span className="text-xs font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">Soak</span>}
            <AlterationBadge tripNumber={garment.trip_number} garmentType={garment.garment_type} />
            {garment.assigned_date && (
              <span className="text-[10px] font-semibold text-red-600">{formatDate(garment.assigned_date)}</span>
            )}
            {garment.invoice_number && (
              <span className="text-xs font-medium text-muted-foreground ml-auto">#{garment.invoice_number}</span>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Standard card ─────────────────────────────────────────────
  const hasStatusBadges = !compact && (
    (!hideStage && garment.piece_stage) ||
    garment.feedback_status ||
    garment.express ||
    (garment.trip_number && garment.trip_number > 1)
  );

  return (
    <>
      <Card
        {...(onClick ? clickableProps(onClick) : {})}
        className={cn(
          "border transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out shadow-sm py-0 gap-0 rounded-xl overflow-hidden",
          "hover:shadow-md hover:-translate-y-px",
          selected
            ? "border-primary/40 bg-primary/5 ring-2 ring-primary/20 shadow-md"
            : cn(
                "bg-card",
                garment.express && "border-l-[5px] border-l-orange-400",
                onClick ? "cursor-pointer hover:border-primary/40" : "border-border/60 hover:border-border",
              ),
        )}
        style={{ animationDelay: `${Math.min(index * 25, 200)}ms` }}
        onClick={onClick}
      >
        <CardContent className="px-4 py-3.5">
          {/* ── Row 1: Identity + actions ── */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {onSelect && (
                <Checkbox
                  checked={selected}
                  onCheckedChange={(v) => onSelect(garment.id, !!v)}
                  className="shrink-0"
                />
              )}
              <GarmentTypeBadge type={garment.garment_type ?? "final"} />
              <span className="font-mono font-black text-lg shrink-0">
                {garment.garment_id ?? garment.id.slice(0, 8)}
              </span>
              {!compact && garment.invoice_number && (
                <span className="text-sm text-muted-foreground/50 font-mono shrink-0">· #{garment.invoice_number}</span>
              )}
              {!compact && <BrandBadge brand={garment.order_brand} />}
              {!compact && (
                <span className="text-base text-muted-foreground truncate">
                  {garment.customer_name ?? "—"}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {actions}
              <button
                onClick={(e) => { e.stopPropagation(); setPeekOpen(true); }}
                className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground/50 hover:text-foreground cursor-pointer"
                aria-label="View garment details"
              >
                <Eye className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* ── Row 2: Status (left) + Logistics (right) ── */}
          {!compact && (
            <div className="flex items-center justify-between gap-3 mt-2.5">
              {/* Left: status badges */}
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                {hasStatusBadges && (
                  <>
                    {!hideStage && <StageBadge stage={garment.piece_stage} />}
                    <FeedbackStatusBadge status={garment.feedback_status} />
                    <AlterationBadge tripNumber={garment.trip_number} garmentType={garment.garment_type} />
                    {garment.express && <ExpressBadge />}
                  </>
                )}
              </div>

              {/* Right: delivery + home delivery */}
              <div className="flex items-center gap-2.5 shrink-0">
                {garment.home_delivery_order && (
                  <span className="inline-flex items-center gap-1 text-sm text-indigo-600 font-semibold">
                    <Home className="w-3.5 h-3.5" aria-hidden="true" /> Delivery
                  </span>
                )}
                {garment.delivery_date_order && (
                  <span className={cn(
                    "inline-flex items-center gap-1 text-sm font-bold tabular-nums px-2 py-0.5 rounded-md",
                    isOverdue && "bg-red-100 text-red-800",
                    isUrgent && "bg-amber-100 text-amber-800",
                    !isUrgent && !isOverdue && "text-muted-foreground",
                  )}>
                    <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" />
                    {formatDate(garment.delivery_date_order)}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ── Row 3: Pipeline ── */}
          {showPipeline && garment.in_production && (
            <div className="mt-2">
              <ProductionPipeline currentStage={garment.piece_stage} compact hasSoaking={hasSoaking} />
            </div>
          )}
        </CardContent>
      </Card>

      <GarmentPeekSheet
        garmentId={peekOpen ? garment.id : null}
        open={peekOpen}
        onOpenChange={setPeekOpen}
      />
    </>
  );
}
