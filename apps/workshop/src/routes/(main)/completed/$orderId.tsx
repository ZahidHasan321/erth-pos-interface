import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useOrderGarments } from "@/hooks/useWorkshopGarments";
import { ProductionPipeline } from "@/components/shared/ProductionPipeline";
import { StageBadge, BrandBadge, ExpressBadge, TrialBadge } from "@/components/shared/StageBadge";
import { MetadataChip } from "@/components/shared/PageShell";
import { Skeleton } from "@repo/ui/skeleton";
import { cn, formatDate } from "@/lib/utils";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Home,
  Package,
  Phone,
} from "lucide-react";
import type { WorkshopGarment, TripHistoryEntry } from "@repo/database";

export const Route = createFileRoute("/(main)/completed/$orderId")({
  component: CompletedOrderDetailPage,
  head: () => ({ meta: [{ title: "Completed Order" }] }),
});

const PLAN_STEPS = [
  { key: "soaker", label: "Soaker", responsibility: "soaking", stageOrder: 1 },
  { key: "cutter", label: "Cutter", responsibility: "cutting", stageOrder: 2 },
  { key: "post_cutter", label: "Post-Cutter", responsibility: "post_cutting", stageOrder: 3 },
  { key: "sewer", label: "Sewer", responsibility: "sewing", stageOrder: 4 },
  { key: "finisher", label: "Finisher", responsibility: "finishing", stageOrder: 5 },
  { key: "ironer", label: "Ironer", responsibility: "ironing", stageOrder: 6 },
  { key: "quality_checker", label: "QC Inspector", responsibility: "quality_check", stageOrder: 7 },
] as const;

function parseTripHistory(raw: TripHistoryEntry[] | string | null | undefined): TripHistoryEntry[] {
  if (!raw) return [];
  if (typeof raw === "string") return JSON.parse(raw);
  return Array.isArray(raw) ? raw : [];
}

// ── Main Page ──────────────────────────────────────────────────

function CompletedOrderDetailPage() {
  const { orderId } = Route.useParams();
  const orderIdNum = Number(orderId);
  const router = useRouter();
  const { data: garments = [], isLoading } = useOrderGarments(orderIdNum);

  if (isLoading) {
    return (
      <div className="p-4 max-w-5xl mx-auto space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (garments.length === 0) {
    return (
      <div className="p-4 max-w-5xl mx-auto">
        <BackButton onClick={() => router.history.back()} />
        <div className="text-center py-12 border border-dashed rounded-xl bg-muted/5">
          <p className="text-lg font-semibold text-muted-foreground">
            No garments found for this order
          </p>
        </div>
      </div>
    );
  }

  const brovas = garments.filter((g) => g.garment_type === "brova");
  const finals = garments.filter((g) => g.garment_type === "final");

  return (
    <div className="p-3 sm:p-4 max-w-5xl mx-auto pb-8">
      <BackButton onClick={() => router.history.back()} />

      <OrderHeader garments={garments} orderId={orderIdNum} />

      {/* Garments — grouped: brovas first, then finals */}
      <div className="mt-4 space-y-4">
        {brovas.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-purple-700 flex items-center gap-1.5">
              <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md text-xs">Brova</span>
              {brovas.length} garment{brovas.length !== 1 ? "s" : ""}
            </h3>
            {brovas.map((g) => (
              <CompletedGarmentCard key={g.id} garment={g} />
            ))}
          </div>
        )}
        {finals.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1.5">
              <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md text-xs">Final</span>
              {finals.length} garment{finals.length !== 1 ? "s" : ""}
            </h3>
            {finals.map((g) => (
              <CompletedGarmentCard key={g.id} garment={g} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Back Button ───────────────────────────────────────────────

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline cursor-pointer transition-colors mb-3"
    >
      <ArrowLeft className="w-4 h-4" />
      Back to Completed Orders
    </button>
  );
}

// ── Order Header ───────────────────────────────────────────────

function OrderHeader({ garments, orderId }: { garments: WorkshopGarment[]; orderId: number }) {
  const first = garments[0];
  const brands = [...new Set(garments.map((g) => g.order_brand).filter(Boolean))] as string[];
  const hasExpress = garments.some((g) => g.express);
  const brovaCount = garments.filter((g) => g.garment_type === "brova").length;
  const finalCount = garments.filter((g) => g.garment_type === "final").length;
  const summary = [brovaCount && `${brovaCount} Brova`, finalCount && `${finalCount} Final${finalCount > 1 ? "s" : ""}`]
    .filter(Boolean)
    .join(" + ");
  const maxTrip = Math.max(...garments.map((g) => g.trip_number ?? 1));

  return (
    <div className="bg-card border rounded-xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-black text-lg">#{orderId}</span>
            <span className="font-semibold text-sm">{first.customer_name ?? "—"}</span>
            {brands.map((b) => <BrandBadge key={b} brand={b} />)}
            {hasExpress && <ExpressBadge />}
            {first.home_delivery_order && (
              <MetadataChip icon={Home} variant="indigo">Delivery</MetadataChip>
            )}
            <span className="text-xs font-semibold uppercase px-2 py-0.5 rounded-md bg-green-100 text-green-800 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Completed
            </span>
          </div>

          <div className="flex items-center flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
            {first.invoice_number && <span>INV-{first.invoice_number}</span>}
            <span className="flex items-center gap-1">
              <Package className="w-3.5 h-3.5" /> {summary}
            </span>
            {first.customer_mobile && (
              <span className="flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" /> {first.customer_mobile}
              </span>
            )}
            {maxTrip > 1 && (
              <span className="text-xs font-semibold text-amber-700">
                {maxTrip - 1} return{maxTrip > 2 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {first.delivery_date_order && (
          <div className="shrink-0 text-right">
            <span className="inline-flex items-center gap-1 text-sm font-bold tabular-nums px-2 py-1 rounded-md bg-muted text-foreground">
              <Clock className="w-3.5 h-3.5" />
              {formatDate(first.delivery_date_order)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Completed Garment Card ────────────────────────────────────

function CompletedGarmentCard({ garment }: { garment: WorkshopGarment }) {
  const plan = (garment.production_plan ?? {}) as Record<string, string>;
  const history = (garment.worker_history ?? {}) as Record<string, string>;
  const hasSoaking = !!garment.soaking;
  const tripNum = garment.trip_number ?? 1;
  const tripEntries = parseTripHistory(garment.trip_history as TripHistoryEntry[] | string | null | undefined);

  const visibleSteps = PLAN_STEPS.filter(
    (s) => s.key !== "soaker" || hasSoaking,
  );

  const fulfillment = garment.fulfillment_type;

  return (
    <div className={cn(
      "bg-card border rounded-xl p-3 shadow-sm",
      garment.express && "border-orange-200",
    )}>
      {/* Garment header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span
            className={cn(
              "text-xs font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border",
              garment.garment_type === "brova"
                ? "bg-purple-100 text-purple-800 border-purple-200"
                : "bg-blue-100 text-blue-800 border-blue-200",
            )}
          >
            {garment.garment_type}
          </span>
          <span className="font-mono font-bold text-sm">
            {garment.garment_id ?? garment.id.slice(0, 8)}
          </span>
          {garment.express && <ExpressBadge />}
          {tripNum > 1 && <TrialBadge tripNumber={tripNum} />}
          <StageBadge stage={garment.piece_stage} garmentType={garment.garment_type} inProduction={garment.in_production} location={garment.location} />
          {fulfillment && (
            <span className="text-xs font-semibold uppercase px-1.5 py-0.5 rounded bg-green-100 text-green-800">
              {fulfillment === "collected" ? "Collected" : "Delivered"}
            </span>
          )}
        </div>

        {garment.delivery_date && (
          <div className="shrink-0 text-right text-[11px] tabular-nums leading-tight text-muted-foreground">
            Due <span className="font-semibold">{formatDate(String(garment.delivery_date))}</span>
          </div>
        )}
      </div>

      {/* Fabric & style info */}
      {(garment.fabric_name || garment.style_name) && (
        <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
          {garment.style_name && <span>Style: <span className="font-medium text-foreground">{garment.style_name}</span></span>}
          {garment.fabric_name && (
            <span>
              Fabric: <span className="font-medium text-foreground">{garment.fabric_name}</span>
              {garment.fabric_color && <span className="ml-0.5">({garment.fabric_color})</span>}
            </span>
          )}
        </div>
      )}

      {/* Production pipeline — fully completed */}
      {garment.production_plan && (
        <div className="mt-2">
          <ProductionPipeline currentStage="completed" compact hasSoaking={hasSoaking} />
        </div>
      )}

      {/* Worker assignments — show who did each step */}
      {garment.production_plan && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {visibleSteps.map((step) => {
            const worker = history[step.key] ?? plan[step.key];
            if (!worker) return null;
            return (
              <span key={step.key} className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                <Check className="w-2.5 h-2.5" />
                <span className="font-medium">{step.label}:</span>
                <span className="font-semibold">{worker}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Trip history for garments that had returns */}
      {tripNum > 1 && tripEntries.length > 0 && (
        <div className="mt-2 border-t pt-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Trip History ({tripEntries.length} trip{tripEntries.length > 1 ? "s" : ""})
          </p>
          <div className="space-y-1">
            {tripEntries.map((entry) => (
              <div key={entry.trip} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono font-bold text-foreground">Trip {entry.trip}</span>
                {entry.reentry_stage && (
                  <span className="px-1 py-0.5 rounded bg-zinc-100 text-zinc-600 text-[10px]">
                    Re-entered at {entry.reentry_stage.replace(/_/g, " ")}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
