import { Fragment, useState, useCallback, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAssignedOverview, useAssignedOrdersPage } from "@/hooks/useWorkshopGarments";
import { useIsMobile } from "@/hooks/use-mobile";
import { BrandBadge, StageBadge } from "@/components/shared/StageBadge";
import { StatusPill, type PillColor } from "@/components/shared/StatusPill";
import { PageHeader, GarmentTypeBadgeCompact } from "@/components/shared/PageShell";
import { Skeleton } from "@repo/ui/skeleton";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@repo/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@repo/ui/tabs";
import { Badge } from "@repo/ui/badge";
import { Pagination } from "@/components/shared/Pagination";
import { cn, clickableProps, formatDate, parseUtcTimestamp } from "@/lib/utils";
import type {
  AssignedOrderRow,
  AssignedPageGarment,
  AssignedPipelineGarment,
  AssignedQuickOrder,
  AssignedChip,
} from "@/api/garments";
import {
  ClipboardList,
  ChevronDown,
  RotateCcw,
  Clock,
  Package,
  Home,
  Zap,
  Droplets,
  ArrowRight,
  AlertTriangle,
  Activity,
  CheckCircle2,
  LayoutDashboard,
  List,
  X,
  Store,
  Truck,
} from "lucide-react";

export const Route = createFileRoute("/(main)/assigned/")({
  component: AssignedPage,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as string) || undefined,
    filter: (search.filter as string) || undefined,
  }),
  head: () => ({ meta: [{ title: "Production Tracker" }] }),
});

// ── Helpers ───────────────────────────────────────────────────

function getDeliveryUrgency(daysToDelivery: number | null | undefined) {
  if (daysToDelivery == null) return { cls: null, border: "", days: null };
  if (daysToDelivery < 0) return { cls: "text-red-600 font-bold", border: "border-l-red-500", days: daysToDelivery };
  if (daysToDelivery <= 2) return { cls: "text-orange-600 font-bold", border: "border-l-orange-400", days: daysToDelivery };
  if (daysToDelivery <= 5) return { cls: "text-yellow-700", border: "border-l-yellow-400", days: daysToDelivery };
  return { cls: "text-green-700", border: "border-l-green-400", days: daysToDelivery };
}

/** Client-side derivation of days-to-delivery from a delivery_date ISO string.
 *  Mirrors the SQL CEIL((delivery_date - NOW())/86400) used by the RPC. */
function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  return Math.ceil((parseUtcTimestamp(date).getTime() - Date.now()) / 86400000);
}

// Map the server-provided status label string to a pill color. Keep in sync
// with assigned_order_status_label() in triggers.sql.
const STATUS_LABEL_COLOR: Record<string, PillColor> = {
  "At shop": "green",
  "Ready for dispatch": "emerald",
  "In transit to shop": "sky",
  "Brovas in transit": "sky",
  "Awaiting finals release": "violet",
  "Awaiting brova trial": "teal",
  "Finals in production": "blue",
  "Brovas in production": "purple",
  "In production": "zinc",
};

function statusLabelColor(label: string): PillColor {
  return STATUS_LABEL_COLOR[label] ?? "zinc";
}

const WORKER_STAGE_KEY: Record<string, string> = {
  soaking: "soaker", cutting: "cutter", post_cutting: "post_cutter",
  sewing: "sewer", finishing: "finisher", ironing: "ironer", quality_check: "quality_checker",
};

function getWorkerName(garment: { piece_stage: string | null; production_plan: Record<string, string> | null }): string | null {
  if (!garment.production_plan) return null;
  const key = WORKER_STAGE_KEY[garment.piece_stage ?? ""] ?? "";
  return garment.production_plan[key] || null;
}

function getDaysLabel(days: number | null) {
  if (days === null) return null;
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  return `${days}d left`;
}

/** Summary string used by mini order listings — type counts from slim row data. */
function summarizeCounts(brovaCount: number, finalCount: number, total: number): string {
  const parts: string[] = [];
  if (brovaCount) parts.push(`${brovaCount} Brova`);
  if (finalCount) parts.push(`${finalCount} Final${finalCount > 1 ? "s" : ""}`);
  return parts.join(" + ") || `${total} garment${total !== 1 ? "s" : ""}`;
}

// ── Garment Location Pill ───────────────────────────────────

/**
 * Resolves the garment's display location. Returns null when the garment is
 * actively in a workshop production stage — in that case the StageBadge already
 * communicates what's happening, so location would be redundant.
 */
function getGarmentLocationDisplay(garment: { location: string | null; piece_stage: string | null }): {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: PillColor;
} | null {
  const loc = garment.location;
  const stage = garment.piece_stage;
  const activeWorkshopStages = new Set([
    "soaking", "cutting", "post_cutting", "sewing",
    "finishing", "ironing", "quality_check", "ready_for_dispatch",
  ]);
  if (loc === "workshop" && stage && activeWorkshopStages.has(stage)) return null;

  const config: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: PillColor }> = {
    shop: { label: "At shop", icon: Store, color: "green" },
    transit_to_shop: { label: "In transit to shop", icon: Truck, color: "sky" },
    transit_to_workshop: { label: "In transit to workshop", icon: Truck, color: "amber" },
    workshop: { label: "At workshop", icon: Package, color: "zinc" },
  };
  return loc ? config[loc] ?? null : null;
}

// ── Garment Mini Cards ──────────────────────────────────────

function GarmentMiniCards({ garments }: { garments: AssignedPageGarment[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
      {garments.map((g) => {
        const tripNum = g.trip_number ?? 1;
        const isReturn = tripNum > 1;
        const worker = getWorkerName(g);
        const locationDisplay = getGarmentLocationDisplay(g);

        return (
          <div
            key={g.id}
            className={cn(
              "p-2 bg-background rounded-lg border border-border/60 text-sm shadow-sm",
              isReturn && "border-l-2 border-l-amber-400",
              g.express && "ring-1 ring-red-200",
            )}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <GarmentTypeBadgeCompact type={g.garment_type ?? "final"} />
                <span className="font-mono font-medium text-xs text-muted-foreground truncate">
                  {g.garment_id ?? g.id.slice(0, 8)}
                </span>
                {g.express && <Zap className="w-3 h-3 text-red-500 fill-red-500 shrink-0" />}
                {g.soaking && <Droplets className="w-3 h-3 text-sky-500 shrink-0" />}
                {isReturn && (
                  <StatusPill color="amber" className="shrink-0">
                    Trip {tripNum}
                  </StatusPill>
                )}
              </div>
              <StageBadge stage={g.piece_stage} garmentType={g.garment_type} inProduction={g.in_production ?? undefined} location={g.location} className="text-[10px] py-0 shrink-0" />
            </div>

            <div className="space-y-1">
              {locationDisplay && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-[10px] uppercase font-bold">Location</span>
                  <StatusPill color={locationDisplay.color} icon={locationDisplay.icon}>
                    {locationDisplay.label}
                  </StatusPill>
                </div>
              )}
              {worker && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-[10px] uppercase font-bold">Worker</span>
                  <span className="text-xs font-medium truncate max-w-[120px]">{worker}</span>
                </div>
              )}
              {g.style_name && (
                <div className="pt-1 border-t border-border/40">
                  <span className="text-xs font-medium text-primary leading-tight">{g.style_name}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Order Indicators ────────────────────────────────────────

function OrderIndicators({ group }: { group: AssignedOrderRow }) {
  return (
    <span className="inline-flex items-center gap-1 ml-1.5">
      {group.express && (
        <span className="text-red-500" title="Express">
          <Zap className="w-3.5 h-3.5 fill-red-500" />
        </span>
      )}
      {group.home_delivery && (
        <span className="text-indigo-500" title="Home delivery">
          <Home className="w-3.5 h-3.5" />
        </span>
      )}
      {group.soaking && (
        <span className="text-sky-500" title="Soaking required">
          <Droplets className="w-3.5 h-3.5" />
        </span>
      )}
      {group.has_returns && (
        <span className="text-amber-500" title="Has returns">
          <RotateCcw className="w-3.5 h-3.5" />
        </span>
      )}
    </span>
  );
}

// ── Order Card (mobile) ──────────────────────────────────────

function AssignedOrderCard({
  group,
  expanded,
  onToggle,
}: {
  group: AssignedOrderRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const urgency = getDeliveryUrgency(daysUntil(group.delivery_date));
  const brovaCount = group.garments.filter((g) => g.garment_type === "brova").length;
  const finalCount = group.garments.filter((g) => g.garment_type === "final").length;
  const daysLabel = getDaysLabel(urgency.days);

  return (
    <div
      className={cn(
        "bg-card border rounded-xl shadow-sm border-l-4 transition-[color,background-color,border-color,box-shadow]",
        urgency.border || "border-l-border",
        group.express && "ring-1 ring-red-200",
      )}
    >
      <div
        className="px-3 py-2.5 cursor-pointer hover:bg-muted/30 active:bg-muted/40"
        onClick={onToggle}
        {...clickableProps(onToggle)}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono font-bold text-sm">#{group.order_id}</span>
            <OrderIndicators group={group} />
            <span className="font-semibold text-sm truncate">{group.customer_name ?? "—"}</span>
            {group.brands.map((b) => <BrandBadge key={b} brand={b} />)}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <StatusPill color={statusLabelColor(group.status_label)}>{group.status_label}</StatusPill>
            <ChevronDown className={cn("w-4 h-4 text-muted-foreground/40 transition-transform", expanded && "rotate-180")} />
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2 mt-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {group.invoice_number && <span>INV-{group.invoice_number}</span>}
            <span className="flex items-center gap-0.5">
              <Package className="w-3 h-3" /> {summarizeCounts(brovaCount, finalCount, group.garments.length)}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            {group.delivery_date && (
              <span className={cn("font-semibold flex items-center gap-0.5", urgency.cls)}>
                <Clock className="w-3 h-3" />
                Due {formatDate(group.delivery_date)}
                {daysLabel && <span className="font-bold ml-0.5">({daysLabel})</span>}
              </span>
            )}
            <Link
              to="/assigned/$orderId"
              params={{ orderId: String(group.order_id) }}
              className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Details
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className={cn("px-3 pb-3 pt-2", expanded && "border-t")}>
            <GarmentMiniCards garments={group.garments} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Orders Table (desktop) ────────────────────────────────────

function OrdersTable({
  orders,
  expandedId,
  onToggle,
}: {
  orders: AssignedOrderRow[];
  expandedId: number | null;
  onToggle: (id: number) => void;
}) {
  return (
    <Table className="min-w-[750px]">
      <TableHeader>
        <TableRow className="bg-muted/40 border-b-2 border-border/60 hover:bg-muted/40">
          <TableHead className="w-8 h-8 px-2" />
          <TableHead className="font-semibold text-foreground h-8 text-xs uppercase tracking-wider px-2 w-[90px]">Order</TableHead>
          <TableHead className="font-semibold text-foreground h-8 text-xs uppercase tracking-wider px-2 w-[180px]">Customer</TableHead>
          <TableHead className="font-semibold text-foreground h-8 text-xs uppercase tracking-wider px-2 w-[80px]">Brand</TableHead>
          <TableHead className="font-semibold text-foreground h-8 text-xs uppercase tracking-wider px-2 w-[190px]">Status</TableHead>
          <TableHead className="font-semibold text-foreground h-8 text-xs uppercase tracking-wider px-2 w-[150px] text-center">Delivery</TableHead>
          <TableHead className="w-[90px] h-8 px-2" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((group) => {
          const urgency = getDeliveryUrgency(daysUntil(group.delivery_date));
          const brovaCount = group.garments.filter((g) => g.garment_type === "brova").length;
          const finalCount = group.garments.filter((g) => g.garment_type === "final").length;
          const isExpanded = expandedId === group.order_id;
          const daysLabel = getDaysLabel(urgency.days);

          return (
            <Fragment key={group.order_id}>
              <TableRow
                onClick={() => onToggle(group.order_id)}
                aria-expanded={isExpanded}
                className={cn(
                  "hover:bg-muted/30 border-b border-border/40 cursor-pointer transition-colors",
                  urgency.days !== null && urgency.days < 0 && "border-l-4 border-l-red-500",
                )}
              >
                <TableCell className="py-2.5 px-2.5">
                  <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                </TableCell>
                <TableCell className="py-2.5 px-2.5 text-xs">
                  <div className="flex items-center">
                    <span className="font-mono font-bold">#{group.order_id}</span>
                    <OrderIndicators group={group} />
                  </div>
                  {group.invoice_number && (
                    <span className="text-[10px] text-muted-foreground">INV-{group.invoice_number}</span>
                  )}
                </TableCell>
                <TableCell className="py-2.5 px-2.5 text-xs">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold max-w-[160px] truncate">{group.customer_name ?? "—"}</span>
                    {group.customer_mobile && (
                      <span className="font-mono text-muted-foreground">{group.customer_mobile}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="py-2.5 px-2.5">
                  <div className="flex items-center gap-1">
                    {group.brands.map((b) => <BrandBadge key={b} brand={b} />)}
                  </div>
                </TableCell>
                <TableCell className="py-2.5 px-2.5">
                  <StatusPill color={statusLabelColor(group.status_label)}>{group.status_label}</StatusPill>
                </TableCell>
                <TableCell className="py-2.5 px-2.5 text-xs align-middle text-center">
                  <div className="flex flex-col gap-1 items-center">
                    {group.delivery_date ? (
                      <span className={cn("font-semibold flex items-center gap-1 whitespace-nowrap", urgency.cls)}>
                        <Clock className="w-3 h-3" />
                        {formatDate(group.delivery_date)}
                        {daysLabel && <span className="font-bold">({daysLabel})</span>}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                    <div className="flex items-center gap-1">
                      {brovaCount > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{brovaCount}B</span>
                      )}
                      {finalCount > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">{finalCount}F</span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-2.5 px-2.5">
                  <Link
                    to="/assigned/$orderId"
                    params={{ orderId: String(group.order_id) }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline whitespace-nowrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Details
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </TableCell>
              </TableRow>
              <TableRow key={`${group.order_id}-detail`} className="border-0 hover:bg-transparent">
                <TableCell
                  colSpan={7}
                  className={cn(
                    "p-0 transition-colors",
                    isExpanded ? "bg-muted/10 border-b border-border/40 shadow-inner" : "border-0",
                  )}
                >
                  <div
                    className={cn(
                      "grid transition-[grid-template-rows] duration-300 ease-out",
                      isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="p-3 pl-10">
                        <GarmentMiniCards garments={group.garments} />
                      </div>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ── Stage Pipeline Chart ─────────────────────────────────────

const PIPELINE_STAGES = [
  { key: "soaking", label: "Soaking", color: "bg-sky-500/80" },
  { key: "cutting", label: "Cutting", color: "bg-amber-500/80" },
  { key: "post_cutting", label: "Post-Cut", color: "bg-orange-500/80" },
  { key: "sewing", label: "Sewing", color: "bg-violet-500/80" },
  { key: "finishing", label: "Finishing", color: "bg-emerald-500/80" },
  { key: "ironing", label: "Ironing", color: "bg-red-500/80" },
  { key: "quality_check", label: "QC", color: "bg-indigo-500/80" },
  { key: "ready_for_dispatch", label: "Dispatch", color: "bg-green-500/80" },
] as const;

function StagePipelineChart({ garments }: { garments: AssignedPipelineGarment[] }) {
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  // Server already filters to location='workshop' + valid pipeline stages,
  // but guard again in case the RPC shape changes.
  const stageGarments = new Map<string, AssignedPipelineGarment[]>();
  for (const g of garments) {
    const s = g.piece_stage ?? "";
    if (!s) continue;
    if (!stageGarments.has(s)) stageGarments.set(s, []);
    stageGarments.get(s)!.push(g);
  }
  const max = Math.max(...PIPELINE_STAGES.map((s) => (stageGarments.get(s.key)?.length ?? 0)), 1);
  const total = garments.length;
  if (total === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
          Workshop Pipeline
        </h3>
        <span className="text-xs text-muted-foreground font-medium">
          {total} garment{total !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="space-y-1.5">
        {PIPELINE_STAGES.map((stage) => {
          const gs = stageGarments.get(stage.key) ?? [];
          const count = gs.length;
          const pct = (count / max) * 100;
          const isExpanded = expandedStage === stage.key;

          return (
            <div key={stage.key}>
              <div
                className={cn(
                  "flex items-center gap-2 rounded",
                  count > 0 && "cursor-pointer hover:bg-muted/20 -mx-1 px-1 py-0.5 transition-colors",
                )}
                onClick={() => count > 0 && setExpandedStage(isExpanded ? null : stage.key)}
              >
                <span className="text-[11px] font-medium text-muted-foreground w-16 text-right shrink-0 tabular-nums">
                  {stage.label}
                </span>
                <div className="flex-1 h-5 bg-muted/30 rounded overflow-hidden">
                  {count > 0 && (
                    <div
                      className={cn("h-full rounded transition-all", stage.color)}
                      style={{ width: `${pct}%`, minWidth: "4px" }}
                    />
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 w-8 justify-end">
                  <span className={cn(
                    "text-xs font-bold tabular-nums",
                    count > 0 ? "text-foreground" : "text-muted-foreground/40",
                  )}>
                    {count}
                  </span>
                  {count > 0 && (
                    <ChevronDown className={cn("w-3 h-3 text-muted-foreground/60 transition-transform", isExpanded && "rotate-180")} />
                  )}
                </div>
              </div>

              <div
                className={cn(
                  "grid transition-[grid-template-rows] duration-200 ease-out",
                  isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
              >
                <div className="overflow-hidden">
                  <div className="pt-2 pb-1 pl-[74px]">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                      {gs.map((g) => {
                        const tripNum = g.trip_number ?? 1;
                        const worker = getWorkerName(g);
                        return (
                          <Link
                            key={g.id}
                            to="/assigned/garment/$garmentId"
                            params={{ garmentId: g.id }}
                            className={cn(
                              "p-2 bg-background rounded-lg border border-border/60 text-sm shadow-sm hover:border-primary/40 hover:shadow-md transition-all",
                              tripNum > 1 && "border-l-2 border-l-amber-400",
                              g.express && "ring-1 ring-red-200",
                            )}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <GarmentTypeBadgeCompact type={g.garment_type ?? "final"} />
                                <span className="font-mono font-bold text-xs text-muted-foreground">#{g.order_id}</span>
                                {g.garment_id && (
                                  <span className="font-mono text-[10px] text-muted-foreground/60 truncate">{g.garment_id}</span>
                                )}
                                {g.express && <Zap className="w-3 h-3 text-red-500 fill-red-500 shrink-0" />}
                                {tripNum > 1 && (
                                  <StatusPill color="amber" className="shrink-0">Trip {tripNum}</StatusPill>
                                )}
                              </div>
                              <ArrowRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                            </div>
                            <div className="space-y-1">
                              {g.customer_name && (
                                <div className="text-xs font-semibold text-foreground truncate">{g.customer_name}</div>
                              )}
                              {worker && (
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground text-[10px] uppercase font-bold">Worker</span>
                                  <span className="text-xs font-medium truncate max-w-[100px]">{worker}</span>
                                </div>
                              )}
                              {g.style_name && (
                                <div className="pt-1 border-t border-border/40">
                                  <span className="text-xs font-medium text-primary leading-tight">{g.style_name}</span>
                                </div>
                              )}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Quick Order List (compact, for overview sections) ───────

function QuickOrderList({
  title,
  icon: Icon,
  iconBg,
  iconColor,
  orders,
  totalCount,
  limit,
  onViewAll,
  renderRight,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  orders: AssignedQuickOrder[];
  totalCount: number;
  limit: number;
  onViewAll?: () => void;
  renderRight: (og: AssignedQuickOrder) => React.ReactNode;
}) {
  if (orders.length === 0) return null;
  const shown = orders.slice(0, limit);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/70">
        <div className="flex items-center gap-2">
          <div className={cn("inline-flex items-center justify-center w-7 h-7 rounded-lg", iconBg)}>
            <Icon className={cn("w-3.5 h-3.5", iconColor)} />
          </div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
            {title}
          </h3>
          <StatusPill color="zinc" className="ml-0.5">{totalCount}</StatusPill>
        </div>
        {totalCount > limit && onViewAll && (
          <button
            onClick={onViewAll}
            className="text-xs font-semibold text-primary hover:underline cursor-pointer inline-flex items-center gap-1"
          >
            View all
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="divide-y divide-border/60">
        {shown.map((og) => (
          <Link
            key={og.order_id}
            to="/assigned/$orderId"
            params={{ orderId: String(og.order_id) }}
            className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="font-mono font-bold text-sm">#{og.order_id}</span>
              {og.express && <Zap className="w-3.5 h-3.5 text-red-500 fill-red-500 shrink-0" />}
              <span className="text-sm text-foreground truncate">{og.customer_name}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {summarizeCounts(og.brova_count, og.final_count, og.garments_count)}
              </span>
            </div>
            {renderRight(og)}
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Overview Dashboard ───────────────────────────────────────

function OverviewDashboard({
  stats,
  quickLists,
  pipelineGarments,
  onNavigate,
}: {
  stats: { overdue: number; due_soon: number; active: number; ready: number; returns: number; total: number; at_shop: number; in_transit: number };
  quickLists: { overdue: AssignedQuickOrder[]; due_soon: AssignedQuickOrder[]; ready: AssignedQuickOrder[]; returns: AssignedQuickOrder[] };
  pipelineGarments: AssignedPipelineGarment[];
  onNavigate: (tab: string) => void;
}) {
  const cards: {
    key: string;
    label: string;
    count: number;
    icon: React.ComponentType<{ className?: string }>;
    tone: "urgent" | "warning" | "info" | "success" | "accent" | "neutral";
  }[] = [
    { key: "attention", label: "Overdue",           count: stats.overdue,   icon: AlertTriangle, tone: "urgent" },
    { key: "attention", label: "Due Soon",          count: stats.due_soon,  icon: Clock,         tone: "warning" },
    { key: "production",label: "In Production",     count: stats.active,    icon: Activity,      tone: "info" },
    { key: "ready",     label: "Ready to Dispatch", count: stats.ready,     icon: CheckCircle2,  tone: "success" },
    { key: "attention", label: "Returns",           count: stats.returns,   icon: RotateCcw,     tone: "accent" },
    { key: "all",       label: "Total Orders",      count: stats.total,     icon: List,          tone: "neutral" },
  ];

  const toneStyles: Record<typeof cards[number]["tone"], { iconBg: string; iconColor: string; accentBar: string }> = {
    urgent:  { iconBg: "bg-red-50",     iconColor: "text-red-600",     accentBar: "bg-red-500" },
    warning: { iconBg: "bg-orange-50",  iconColor: "text-orange-600",  accentBar: "bg-orange-500" },
    info:    { iconBg: "bg-blue-50",    iconColor: "text-blue-600",    accentBar: "bg-blue-500" },
    success: { iconBg: "bg-emerald-50", iconColor: "text-emerald-600", accentBar: "bg-emerald-500" },
    accent:  { iconBg: "bg-amber-50",   iconColor: "text-amber-600",   accentBar: "bg-amber-500" },
    neutral: { iconBg: "bg-muted",      iconColor: "text-muted-foreground", accentBar: "bg-border" },
  };

  return (
    <div className="space-y-5">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((card) => {
          const Icon = card.icon;
          const s = toneStyles[card.tone];
          const isZero = card.count === 0;
          return (
            <button
              key={card.label}
              onClick={() => onNavigate(card.key)}
              className={cn(
                "group relative flex flex-col items-start gap-3 p-4 rounded-xl border border-border bg-card text-left cursor-pointer transition-all",
                "hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5",
                "pointer-coarse:active:scale-[0.98] pointer-coarse:active:translate-y-0",
                isZero && "opacity-60",
              )}
            >
              <div className={cn("inline-flex items-center justify-center w-9 h-9 rounded-lg", s.iconBg)}>
                <Icon className={cn("w-4.5 h-4.5", s.iconColor)} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-3xl font-black tabular-nums leading-none text-foreground">
                  {card.count}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {card.label}
                </span>
              </div>
              <span className={cn("absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full transition-opacity opacity-0 group-hover:opacity-100", s.accentBar)} />
            </button>
          );
        })}
      </div>

      {/* Stage pipeline visualization */}
      <StagePipelineChart garments={pipelineGarments} />

      {/* Location summary — compact inline strip */}
      {(stats.at_shop > 0 || stats.in_transit > 0) && (
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <span className="font-bold uppercase tracking-wider text-muted-foreground">Location:</span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold">
            <Package className="w-3 h-3" />
            {pipelineGarments.length} at workshop
          </span>
          {stats.at_shop > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 text-green-700 font-semibold">
              <Store className="w-3 h-3" />
              {stats.at_shop} at shop
            </span>
          )}
          {stats.in_transit > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 font-semibold">
              <Truck className="w-3 h-3" />
              {stats.in_transit} in transit
            </span>
          )}
        </div>
      )}

      {/* Urgent orders — overdue + due soon side by side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <QuickOrderList
          title="Overdue"
          icon={AlertTriangle}
          iconBg="bg-red-50"
          iconColor="text-red-600"
          orders={quickLists.overdue}
          totalCount={stats.overdue}
          limit={5}
          onViewAll={() => onNavigate("attention")}
          renderRight={(og) => {
            const u = getDeliveryUrgency(og.days_to_delivery);
            return <span className={cn("text-xs font-bold shrink-0 tabular-nums", u.cls)}>{getDaysLabel(u.days)}</span>;
          }}
        />
        <QuickOrderList
          title="Due Soon"
          icon={Clock}
          iconBg="bg-orange-50"
          iconColor="text-orange-600"
          orders={quickLists.due_soon}
          totalCount={stats.due_soon}
          limit={5}
          onViewAll={() => onNavigate("attention")}
          renderRight={(og) => {
            const u = getDeliveryUrgency(og.days_to_delivery);
            return <span className={cn("text-xs font-bold shrink-0 tabular-nums", u.cls)}>{getDaysLabel(u.days)}</span>;
          }}
        />
      </div>

      {/* Ready for dispatch + Returns side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <QuickOrderList
          title="Ready for Dispatch"
          icon={CheckCircle2}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          orders={quickLists.ready}
          totalCount={stats.ready}
          limit={5}
          onViewAll={() => onNavigate("ready")}
          renderRight={(og) => (
            <div className="flex items-center gap-1 shrink-0">
              {og.brova_count > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{og.brova_count}B</span>}
              {og.final_count > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">{og.final_count}F</span>}
            </div>
          )}
        />
        <QuickOrderList
          title="Returns"
          icon={RotateCcw}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
          orders={quickLists.returns}
          totalCount={stats.returns}
          limit={5}
          onViewAll={() => onNavigate("attention")}
          renderRight={(og) => (
            <StatusPill color="amber">
              Trip {og.max_trip ?? 1}
            </StatusPill>
          )}
        />
      </div>
    </div>
  );
}

// ── Secondary Filter Chips ──────────────────────────────────

function FilterChips({
  filters,
  active,
  onToggle,
  onReset,
}: {
  filters: { key: string; label: string; icon: React.ComponentType<{ className?: string }>; count: number }[];
  active: Set<string>;
  onToggle: (key: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {filters.map((f) => {
        const Icon = f.icon;
        const isActive = active.has(f.key);
        return (
          <button
            key={f.key}
            onClick={() => onToggle(f.key)}
            className={cn(
              "group inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer transition-all",
              isActive
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground",
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {f.label}
            <span
              className={cn(
                "ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold tabular-nums",
                isActive
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary",
              )}
            >
              {f.count}
            </span>
          </button>
        );
      })}
      {active.size > 0 && (
        <button
          onClick={onReset}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
          title="Clear filters"
        >
          <X className="w-3.5 h-3.5" />
          Clear
        </button>
      )}
    </div>
  );
}

// ── Order List (shared between tabs) ────────────────────────

function OrderList({
  orders,
  totalCount,
  page,
  pageSize,
  onPageChange,
  isMobile,
  emptyText,
}: {
  orders: AssignedOrderRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  isMobile: boolean;
  emptyText?: string;
}) {
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const toggleExpanded = (id: number) =>
    setExpandedOrderId((prev) => (prev === id ? null : id));
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  if (totalCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-muted/60 mb-4">
          <ClipboardList className="w-6 h-6 text-muted-foreground/60" />
        </div>
        <p className="text-sm font-semibold text-foreground">{emptyText ?? "No orders match this filter"}</p>
        <p className="text-xs text-muted-foreground mt-1">Try clearing filters or switching tabs</p>
      </div>
    );
  }

  return (
    <>
      {isMobile ? (
        <div className="space-y-2">
          {orders.map((group) => (
            <AssignedOrderCard
              key={group.order_id}
              group={group}
              expanded={expandedOrderId === group.order_id}
              onToggle={() => toggleExpanded(group.order_id)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border shadow-sm overflow-x-auto bg-card py-0 gap-0">
          <OrdersTable
            orders={orders}
            expandedId={expandedOrderId}
            onToggle={toggleExpanded}
          />
        </div>
      )}
      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
        totalItems={totalCount}
        pageSize={pageSize}
      />
    </>
  );
}

// ── Page ─────────────────────────────────────────────────────

const LIST_TABS = ["production", "ready", "attention", "all"] as const;
type ListTab = typeof LIST_TABS[number];
const ALL_TABS = ["overview", ...LIST_TABS] as const;
const VALID_TABS = new Set<string>(ALL_TABS);
const VALID_FILTERS = new Set<AssignedChip>(["express", "delivery", "soaking"]);
const PAGE_SIZE = 20;

function AssignedPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { tab: searchTab, filter: searchFilter } = Route.useSearch();

  // Derive state from URL
  const primaryTab = (VALID_TABS.has(searchTab ?? "") ? searchTab! : "overview") as typeof ALL_TABS[number];
  const chipFilters: AssignedChip[] = (searchFilter ?? "")
    .split(",")
    .filter((f): f is AssignedChip => VALID_FILTERS.has(f as AssignedChip));
  const chipSet = new Set<AssignedChip>(chipFilters);
  const isListTab = primaryTab !== "overview";
  const activeListTab: ListTab = isListTab ? (primaryTab as ListTab) : "all";

  const [page, setPage] = useState(1);
  // Reset page whenever the tab or chip selection changes so the user doesn't
  // land on an empty page after narrowing the filter.
  useEffect(() => {
    setPage(1);
  }, [primaryTab, searchFilter]);

  const overviewQuery = useAssignedOverview();
  const pageQuery = useAssignedOrdersPage({
    tab: activeListTab,
    chips: chipFilters,
    page,
    pageSize: PAGE_SIZE,
  });

  const setTab = useCallback((tab: string, filter?: string) => {
    navigate({
      to: "/assigned",
      search: { tab: tab === "overview" ? undefined : tab, filter: filter || undefined },
      replace: true,
    });
  }, [navigate]);

  const setPrimaryTab = useCallback((tab: string) => {
    setTab(tab);
  }, [setTab]);

  const toggleChip = useCallback((key: string) => {
    const next = new Set(chipSet);
    const chip = key as AssignedChip;
    if (next.has(chip)) next.delete(chip);
    else next.add(chip);
    const filterStr = Array.from(next).join(",");
    setTab(primaryTab, filterStr);
  }, [chipSet, primaryTab, setTab]);

  const resetChips = useCallback(() => {
    setTab(primaryTab);
  }, [primaryTab, setTab]);

  const stats = overviewQuery.data?.stats;
  const quickLists = overviewQuery.data?.quick_lists;
  const pipelineGarments = overviewQuery.data?.pipeline_garments ?? [];
  const pageRows = pageQuery.data?.rows ?? [];
  const pageTotalCount = pageQuery.data?.totalCount ?? 0;
  const chipCounts = pageQuery.data?.chipCounts ?? { express: 0, delivery: 0, soaking: 0 };

  const chipOptions = [
    { key: "express",  label: "Express",  icon: Zap,      count: chipCounts.express  },
    { key: "delivery", label: "Delivery", icon: Home,     count: chipCounts.delivery },
    { key: "soaking",  label: "Soaking",  icon: Droplets, count: chipCounts.soaking  },
  ];

  const primaryTabs = [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "production", label: "In Production", icon: Activity,      count: stats?.active,                badgeCls: "bg-blue-100 text-blue-700" },
    { key: "ready",      label: "Ready",         icon: CheckCircle2,  count: stats?.ready,                 badgeCls: "bg-emerald-100 text-emerald-700" },
    { key: "attention",  label: "Attention",     icon: AlertTriangle, count: (stats?.overdue ?? 0) + (stats?.due_soon ?? 0), badgeCls: (stats?.overdue ?? 0) > 0 ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700" },
    { key: "all",        label: "All Orders",    icon: List,          count: stats?.total },
  ];

  const isInitialLoading =
    (primaryTab === "overview" && overviewQuery.isLoading) ||
    (isListTab && pageQuery.isLoading && pageRows.length === 0);

  const subtitle = stats
    ? `${stats.total} order${stats.total !== 1 ? "s" : ""} in production${stats.returns > 0 ? ` · ${stats.returns} with returns` : ""}`
    : "Loading…";

  return (
    <div className="p-4 sm:p-6 max-w-4xl xl:max-w-7xl mx-auto pb-10">
      <PageHeader
        icon={ClipboardList}
        title="Production Tracker"
        subtitle={subtitle}
      />

      <Tabs value={primaryTab} onValueChange={(v) => setTab(v)}>
        <TabsList className="h-auto gap-0.5 flex-nowrap overflow-x-auto overflow-y-hidden mb-3">
          {primaryTabs.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger key={t.key} value={t.key} className="gap-1.5">
                <Icon className="w-3.5 h-3.5" />
                {t.label}
                {t.count !== undefined && (
                  <Badge variant="secondary" className={cn("ml-0.5 text-xs", t.badgeCls)}>
                    {t.count}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {isInitialLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="bg-card border rounded-xl border-l-4 border-l-border p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-16 rounded" />
                    <Skeleton className="h-4 w-24 rounded" />
                    <Skeleton className="h-4 w-12 rounded" />
                  </div>
                  <Skeleton className="h-4 w-28 rounded" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3.5 w-16 rounded" />
                    <Skeleton className="h-3.5 w-20 rounded" />
                  </div>
                  <Skeleton className="h-3.5 w-24 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Overview tab */}
            <TabsContent value="overview">
              {stats && quickLists && (
                <OverviewDashboard
                  stats={stats}
                  quickLists={quickLists}
                  pipelineGarments={pipelineGarments}
                  onNavigate={setPrimaryTab}
                />
              )}
            </TabsContent>

            {/* List tabs */}
            {LIST_TABS.map((tabKey) => (
              <TabsContent key={tabKey} value={tabKey}>
                <div className="space-y-3">
                  <FilterChips filters={chipOptions} active={chipSet} onToggle={toggleChip} onReset={resetChips} />
                  <OrderList
                    orders={pageRows}
                    totalCount={pageTotalCount}
                    page={page}
                    pageSize={PAGE_SIZE}
                    onPageChange={setPage}
                    isMobile={isMobile}
                    emptyText={
                      tabKey === "production" ? "No orders in production"
                        : tabKey === "ready" ? "No orders ready for dispatch"
                        : tabKey === "attention" ? "No orders need attention"
                        : "No orders found"
                    }
                  />
                </div>
              </TabsContent>
            ))}
          </>
        )}
      </Tabs>
    </div>
  );
}
