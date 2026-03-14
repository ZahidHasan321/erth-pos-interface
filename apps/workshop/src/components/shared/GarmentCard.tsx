import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn, formatDate } from "@/lib/utils";
import { StageBadge, AlterationBadge, ExpressBadge } from "./StageBadge";
import { ProductionPipeline } from "./ProductionPipeline";
import { MeasurementGrid } from "./MeasurementGrid";
import type { WorkshopGarment } from "@repo/database";
import { ChevronDown, ChevronUp, Clock, Timer, Package, Home } from "lucide-react";

interface GarmentCardProps {
  garment: WorkshopGarment;
  selected?: boolean;
  onSelect?: (id: string, checked: boolean) => void;
  actions?: React.ReactNode;
  showPipeline?: boolean;
  /** Terminal mode: hides customer/business details, shows only what workers need */
  compact?: boolean;
  index?: number;
}

export function GarmentCard({
  garment,
  selected = false,
  onSelect,
  actions,
  showPipeline = true,
  compact = false,
  index = 0,
}: GarmentCardProps) {
  const [expanded, setExpanded] = useState(false);

  // In compact/terminal mode, notes are shown inline (not hidden behind expand)
  const hasNotes = !!garment.notes;
  const hasSoaking = !!garment.soaking;

  return (
    <Card
      className={cn(
        "border transition-all duration-200 ease-in-out animate-fade-in shadow-sm",
        selected && "border-primary ring-1 ring-primary/30",
        garment.express && "border-l-4 border-l-orange-400",
      )}
      style={{ animationDelay: `${index * 25}ms` }}
    >
      <CardContent className="px-4 py-3">
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
                {garment.assigned_unit && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
                    <Package className="w-3 h-3" />
                    {garment.assigned_unit}
                  </span>
                )}
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
                    <Timer className="w-3 h-3" />
                    {formatDate(garment.assigned_date)}
                  </span>
                )}
                {garment.delivery_date_order && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                    <Clock className="w-3 h-3" />
                    {formatDate(garment.delivery_date_order)}
                  </span>
                )}
                {garment.assigned_unit && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
                    <Package className="w-3 h-3" />
                    {garment.assigned_unit}
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
          <div className="flex items-center gap-2 shrink-0">
            {actions}
            <button
              onClick={() => setExpanded((v) => !v)}
              className={cn(
                "p-1.5 rounded-md hover:bg-muted transition-colors",
                expanded && "bg-muted",
              )}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
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
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Measurements
              </p>
              <MeasurementGrid measurement={garment.measurement} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
