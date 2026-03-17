import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { AlterationBadge, ExpressBadge, BrandBadge } from "./StageBadge";
import { GarmentTypeBadge } from "./PageShell";
import { MeasurementGrid } from "./MeasurementGrid";
import { useOrderGarments, useGarment } from "@/hooks/useWorkshopGarments";
import { cn, formatDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  User,
  Phone,
  Package,
  Clock,
  Home,
  Shirt,
  StickyNote,
  ChevronDown,
  Scissors,
  Palette,
  Droplets,
} from "lucide-react";
import type { WorkshopGarment } from "@repo/database";

// ── Shared helpers ──────────────────────────────────────────────

/** Capitalize a raw style slug like "kuwaiti" → "Kuwaiti", "saudi_style" → "Saudi Style" */
function formatStyleName(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground/70 mb-2">
      {children}
    </p>
  );
}

function InfoRow({ icon: Icon, label, value, className }: {
  icon?: React.ElementType;
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  if (!value) return null;
  return (
    <div className={cn("flex items-center justify-between py-1.5", className)}>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}

function LoadingSheet() {
  return (
    <div className="p-5 space-y-4">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <div className="space-y-2 pt-4">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
    </div>
  );
}

// ── Order Peek Sheet ────────────────────────────────────────────
// Used on pre-production pages (scheduler, receiving, parking).
// Shows order & garment specs — no production status.

interface OrderPeekSheetProps {
  orderId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrderPeekSheet({ orderId, open, onOpenChange }: OrderPeekSheetProps) {
  const { data: garments = [], isLoading } = useOrderGarments(orderId ?? 0);
  const enabled = orderId !== null && open;

  const first = garments[0];
  const brovas = garments.filter((g) => g.garment_type === "brova");
  const finals = garments.filter((g) => g.garment_type === "final");
  const brands = [...new Set(garments.map((g) => g.order_brand).filter(Boolean))] as string[];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-0">
        {(!enabled || isLoading) ? (
          <LoadingSheet />
        ) : garments.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">No garments found</div>
        ) : (
          <>
            {/* Header */}
            <SheetHeader className="px-5 pt-5 pb-4 border-b bg-muted/30">
              <div className="flex items-center gap-2 flex-wrap">
                <SheetTitle className="font-mono font-black text-xl">
                  Order #{orderId}
                </SheetTitle>
                {brands.map((b) => <BrandBadge key={b} brand={b} />)}
                {garments.some((g) => g.express) && <ExpressBadge />}
              </div>
              <SheetDescription className="flex items-center gap-3 flex-wrap mt-1">
                {first?.customer_name && (
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {first.customer_name}
                  </span>
                )}
                {first?.customer_mobile && (
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {first.customer_mobile}
                  </span>
                )}
              </SheetDescription>
            </SheetHeader>

            <div className="px-5 py-4 space-y-5">
              {/* Order info */}
              <div className="bg-muted/40 rounded-xl p-3.5 space-y-0.5">
                <InfoRow icon={Package} label="Invoice" value={first?.invoice_number ? `INV-${first.invoice_number}` : null} />
                <InfoRow icon={Clock} label="Delivery" value={first?.delivery_date_order ? formatDate(first.delivery_date_order) : null} />
                {first?.home_delivery_order && (
                  <InfoRow icon={Home} label="Home Delivery" value={<span className="text-indigo-700 font-semibold">Yes</span>} />
                )}
                <div className="flex items-center justify-between py-1.5">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Shirt className="w-3 h-3" />
                    Garments
                  </span>
                  <span className="text-sm font-medium">
                    {garments.length} total
                    <span className="text-xs text-muted-foreground ml-1.5">
                      ({brovas.length}B / {finals.length}F)
                    </span>
                  </span>
                </div>
              </div>

              {/* Garment list */}
              <div>
                <SectionLabel>Garments</SectionLabel>
                <div className="space-y-2">
                  {garments.map((g) => (
                    <OrderGarmentRow key={g.id} garment={g} />
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function OrderGarmentRow({ garment }: { garment: WorkshopGarment }) {
  const [expanded, setExpanded] = useState(false);
  const isParked = garment.piece_stage === "waiting_for_acceptance";

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-3 py-2.5 flex items-center gap-2 text-left hover:bg-muted/30 transition-colors"
      >
        <GarmentTypeBadge type={garment.garment_type ?? "final"} />
        <span className="font-mono font-bold text-sm">{garment.garment_id ?? garment.id.slice(0, 8)}</span>
        {isParked && (
          <span className="text-[10px] font-semibold text-muted-foreground italic">parked</span>
        )}
        {garment.express && <ExpressBadge />}
        {garment.soaking && (
          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 flex items-center gap-0.5">
            <Droplets className="w-2.5 h-2.5" /> Soak
          </span>
        )}
        <AlterationBadge tripNumber={garment.trip_number} garmentType={garment.garment_type} />
        <ChevronDown className={cn("w-3.5 h-3.5 ml-auto text-muted-foreground/50 transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-2 border-t bg-muted/10 space-y-2.5">
          {/* Fabric & Style */}
          {(garment.fabric_name || garment.style_name) && (
            <div className="flex items-start gap-3">
              {garment.style_image_url && (
                <img
                  src={garment.style_image_url}
                  alt={garment.style_name ? formatStyleName(garment.style_name) : "Style"}
                  className="w-10 h-10 object-contain rounded-md bg-white border shrink-0"
                />
              )}
              <div className="flex-1 min-w-0 space-y-0.5 text-xs">
                <div className="flex items-center gap-1.5">
                  <Palette className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="font-medium">
                    {garment.fabric_name ?? "Outside fabric"}
                    {garment.fabric_color && (
                      <span className="text-muted-foreground"> ({garment.fabric_color})</span>
                    )}
                  </span>
                </div>
                {garment.style_name && (
                  <div className="flex items-center gap-1.5">
                    <Scissors className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="font-medium">{formatStyleName(garment.style_name)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {garment.notes && (
            <div className="flex items-start gap-1.5 text-xs bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
              <StickyNote className="w-3 h-3 text-amber-600 mt-0.5 shrink-0" />
              <span className="text-amber-800 whitespace-pre-wrap">{garment.notes}</span>
            </div>
          )}

          {/* Measurements */}
          {garment.measurement && (
            <MeasurementGrid measurement={garment.measurement} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Garment Peek Sheet ──────────────────────────────────────────
// Used from GarmentCard on pre-production pages.
// Shows garment specs: customer, fabric, style, measurements, notes.

interface GarmentPeekSheetProps {
  garmentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GarmentPeekSheet({ garmentId, open, onOpenChange }: GarmentPeekSheetProps) {
  const { data: garment, isLoading } = useGarment(garmentId ?? "");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-0">
        {(!garmentId || isLoading) ? (
          <LoadingSheet />
        ) : !garment ? (
          <div className="p-6 text-center text-muted-foreground">Garment not found</div>
        ) : (
          <GarmentPeekContent garment={garment} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function GarmentPeekContent({ garment }: { garment: WorkshopGarment }) {
  return (
    <>
      {/* Header */}
      <SheetHeader className={cn(
        "px-5 pt-5 pb-4 border-b",
        garment.garment_type === "brova"
          ? "bg-gradient-to-br from-purple-50/80 to-white"
          : "bg-gradient-to-br from-blue-50/80 to-white",
      )}>
        <div className="flex items-center gap-2 flex-wrap">
          <GarmentTypeBadge type={garment.garment_type ?? "final"} />
          <SheetTitle className="font-mono font-black text-xl">
            {garment.garment_id ?? garment.id.slice(0, 8)}
          </SheetTitle>
          <BrandBadge brand={garment.order_brand} />
          {garment.express && <ExpressBadge />}
          {garment.soaking && (
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 flex items-center gap-0.5">
              <Droplets className="w-2.5 h-2.5" /> Soak
            </span>
          )}
          <AlterationBadge tripNumber={garment.trip_number} garmentType={garment.garment_type} />
        </div>
        <SheetDescription className="flex items-center gap-3 flex-wrap mt-1">
          {garment.customer_name && (
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {garment.customer_name}
            </span>
          )}
          {garment.customer_mobile && (
            <span className="flex items-center gap-1">
              <Phone className="w-3 h-3" />
              {garment.customer_mobile}
            </span>
          )}
        </SheetDescription>
      </SheetHeader>

      <div className="px-5 py-4 space-y-5">
        {/* Order info */}
        <div className="bg-muted/40 rounded-xl p-3.5 space-y-0.5">
          <InfoRow icon={Package} label="Invoice" value={garment.invoice_number ? `INV-${garment.invoice_number}` : null} />
          <InfoRow icon={Clock} label="Delivery" value={garment.delivery_date_order ? formatDate(garment.delivery_date_order) : null} />
          {garment.home_delivery_order && (
            <InfoRow icon={Home} label="Home Delivery" value={<span className="text-indigo-700 font-semibold">Yes</span>} />
          )}
        </div>

        {/* Fabric & Style */}
        {(garment.fabric_name || garment.style_name) && (
          <div>
            <SectionLabel>Fabric & Style</SectionLabel>
            <div className="bg-muted/40 rounded-xl p-3.5">
              <div className="flex items-start gap-3">
                {garment.style_image_url && (
                  <img
                    src={garment.style_image_url}
                    alt={garment.style_name ? formatStyleName(garment.style_name) : "Style"}
                    className="w-14 h-14 object-contain rounded-lg bg-white border shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5 text-sm">
                    <Palette className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium">
                      {garment.fabric_name ?? <span className="text-muted-foreground italic">Outside fabric</span>}
                    </span>
                    {garment.fabric_color && (
                      <span className="text-muted-foreground">({garment.fabric_color})</span>
                    )}
                  </div>
                  {garment.style_name && (
                    <div className="flex items-center gap-1.5 text-sm">
                      <Scissors className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="font-medium">{formatStyleName(garment.style_name)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        {garment.notes && (
          <div>
            <SectionLabel>Notes</SectionLabel>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5">
              <div className="flex items-start gap-2">
                <StickyNote className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-900 whitespace-pre-wrap">{garment.notes}</p>
              </div>
            </div>
          </div>
        )}

        {/* Measurements */}
        {garment.measurement && (
          <div>
            <SectionLabel>Measurements</SectionLabel>
            <MeasurementGrid measurement={garment.measurement} />
          </div>
        )}
      </div>
    </>
  );
}
