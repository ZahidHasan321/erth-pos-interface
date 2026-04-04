import { useState } from "react";
import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useOrderGarments } from "@/hooks/useWorkshopGarments";
import {
  useUpdateGarmentDetails,
} from "@/hooks/useGarmentMutations";
import { PlanDialog } from "@/components/shared/PlanDialog";
import { ProductionPipeline } from "@/components/shared/ProductionPipeline";
import { StageBadge, BrandBadge, ExpressBadge, TrialBadge, AlterationInBadge } from "@/components/shared/StageBadge";
import { MetadataChip } from "@/components/shared/PageShell";
import { Skeleton } from "@repo/ui/skeleton";
import { cn, formatDate } from "@/lib/utils";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clock,
  History,
  Package,
  Home,
  Edit3,
  Phone,
  Play,
} from "lucide-react";
import type { WorkshopGarment, TripHistoryEntry } from "@repo/database";

export const Route = createFileRoute("/(main)/assigned/$orderId")({
  component: AssignedOrderDetailPage,
  head: () => ({ meta: [{ title: "Order Details" }] }),
});

// ── Constants ──────────────────────────────────────────────────

const PLAN_STEPS = [
  { key: "soaker", label: "Soaker", responsibility: "soaking", stageOrder: 1 },
  { key: "cutter", label: "Cutter", responsibility: "cutting", stageOrder: 2 },
  { key: "post_cutter", label: "Post-Cutter", responsibility: "post_cutting", stageOrder: 3 },
  { key: "sewer", label: "Sewer", responsibility: "sewing", stageOrder: 4 },
  { key: "finisher", label: "Finisher", responsibility: "finishing", stageOrder: 5 },
  { key: "ironer", label: "Ironer", responsibility: "ironing", stageOrder: 6 },
  { key: "quality_checker", label: "QC Inspector", responsibility: "quality_check", stageOrder: 7 },
] as const;

const STAGE_ORDER: Record<string, number> = {
  waiting_cut: 0,
  soaking: 1,
  cutting: 2,
  post_cutting: 3,
  sewing: 4,
  finishing: 5,
  ironing: 6,
  quality_check: 7,
  ready_for_dispatch: 8,
};

/** Extract current trip entry from trip_history */
function getCurrentTripEntry(garment: WorkshopGarment): TripHistoryEntry | null {
  const raw = garment.trip_history;
  const entries: TripHistoryEntry[] = !raw
    ? []
    : typeof raw === "string"
      ? JSON.parse(raw)
      : Array.isArray(raw)
        ? (raw as TripHistoryEntry[])
        : [];
  const tripNum = garment.trip_number ?? 1;
  return entries.find((t) => t.trip === tripNum) ?? null;
}

function getDeliveryUrgency(date?: string) {
  if (!date) return { className: "", days: null };
  const diff = Math.ceil(
    (new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  if (diff < 0) return { className: "text-red-700", days: diff };
  if (diff <= 2) return { className: "text-orange-700", days: diff };
  if (diff <= 5) return { className: "text-yellow-800", days: diff };
  return { className: "text-green-700", days: diff };
}

// ── Main Page ──────────────────────────────────────────────────

function AssignedOrderDetailPage() {
  const { orderId } = Route.useParams();
  const orderIdNum = Number(orderId);
  const router = useRouter();
  const { data: garments = [], isLoading } = useOrderGarments(orderIdNum);
  const updateMut = useUpdateGarmentDetails();

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
        <button
          onClick={() => router.history.back()}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline cursor-pointer transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Production Tracker
        </button>
        <div className="text-center py-12 border border-dashed rounded-xl bg-muted/5">
          <p className="text-lg font-semibold text-muted-foreground">
            No garments found for this order
          </p>
        </div>
      </div>
    );
  }

  // Compute shared plan: the plan that most planned garments share
  // Skip "soaker" when comparing — soaking only applies to some garments,
  // so a missing soaker doesn't count as a different assignment.
  const plannedGarments = garments.filter((g) => g.production_plan);
  const sharedPlan = (() => {
    if (plannedGarments.length === 0) return null;
    const ref = (plannedGarments[0].production_plan ?? {}) as Record<string, string>;
    const nonSoakSteps = PLAN_STEPS.filter((s) => s.key !== "soaker");
    const allSame = plannedGarments.every((g) => {
      const p = (g.production_plan ?? {}) as Record<string, string>;
      return nonSoakSteps.every((s) => (p[s.key] ?? "") === (ref[s.key] ?? ""));
    });
    if (!allSame) return null;
    // For soaker, only compare garments that both have soaking
    const soakingGarments = plannedGarments.filter((g) => g.soaking);
    if (soakingGarments.length > 1) {
      const refSoaker = ((soakingGarments[0].production_plan ?? {}) as Record<string, string>).soaker ?? "";
      const soakersSame = soakingGarments.every((g) => {
        const soaker = ((g.production_plan ?? {}) as Record<string, string>).soaker ?? "";
        return soaker === refSoaker;
      });
      if (!soakersSame) return null;
    }
    return ref;
  })();

  const sharedDate = (() => {
    const dates = plannedGarments.map((g) => g.assigned_date).filter(Boolean);
    if (dates.length === 0) return null;
    return dates.every((d) => d === dates[0]) ? dates[0] : null;
  })();


  return (
    <div className="p-3 sm:p-4 max-w-5xl mx-auto pb-8">
      <button
        onClick={() => router.history.back()}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline cursor-pointer transition-colors mb-3"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Production Tracker
      </button>

      {/* Order header */}
      <OrderHeader garments={garments} orderId={orderIdNum} />

      {/* Shared production plan at order level */}
      {sharedPlan && (
        <SharedPlanSection
          plan={sharedPlan}
          date={sharedDate ?? undefined}
          garments={plannedGarments}
          updateMut={updateMut}
        />
      )}

      {/* Divergent plans indicator */}
      {!sharedPlan && plannedGarments.length > 1 && (
        <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          <p className="text-xs font-semibold text-amber-800">
            Garments have different worker assignments — edit individually below
          </p>
        </div>
      )}

      {/* Garments — grouped: brovas first, then finals */}
      {(() => {
        const brovas = garments.filter((g) => g.garment_type === "brova");
        const finals = garments.filter((g) => g.garment_type === "final");
        return (
          <div className="mt-4 space-y-4">
            {brovas.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-purple-700 flex items-center gap-1.5">
                  <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md text-xs">Brova</span>
                  {brovas.length} garment{brovas.length !== 1 ? "s" : ""}
                </h3>
                {brovas.map((g) => (
                  <GarmentPlanCard key={g.id} garment={g} updateMut={updateMut} sharedPlan={sharedPlan} />
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
                  <GarmentPlanCard key={g.id} garment={g} updateMut={updateMut} sharedPlan={sharedPlan} />
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ── Order Header ───────────────────────────────────────────────

function OrderHeader({
  garments,
  orderId,
}: {
  garments: WorkshopGarment[];
  orderId: number;
}) {
  const first = garments[0];
  const brands = [...new Set(garments.map((g) => g.order_brand).filter(Boolean))] as string[];
  const hasExpress = garments.some((g) => g.express);
  const brovas = garments.filter((g) => g.garment_type === "brova");
  const finals = garments.filter((g) => g.garment_type === "final");
  const atShop = garments.filter((g) => g.location === "shop");
  const waitingAcceptance = garments.filter((g) => g.piece_stage === "waiting_for_acceptance");
  const inProd = garments.filter((g) => g.in_production && g.production_plan);
  const readyDispatch = garments.filter((g) => g.piece_stage === "ready_for_dispatch");
  const brovasNeedRepair = brovas.filter(
    (g) => g.location === "shop" && (g.feedback_status === "needs_repair" || g.feedback_status === "needs_redo"),
  );
  const brovasAtShop = brovas.filter((g) => g.location === "shop");
  const maxTrip = Math.max(...garments.map((g) => g.trip_number ?? 1));
  const urgency = getDeliveryUrgency(first.delivery_date_order);

  const statusLabel = (() => {
    if (first.order_phase === "completed" || garments.every((g) => g.piece_stage === "completed"))
      return { text: "Completed", cls: "bg-green-100 text-green-800" };
    if (readyDispatch.length === garments.length)
      return { text: "Ready for dispatch", cls: "bg-emerald-100 text-emerald-800" };
    // Alteration (In) only for trip 3+ (went back twice already)
    if (brovasNeedRepair.length > 0 && maxTrip >= 3)
      return { text: "Alteration (In)", cls: "bg-orange-100 text-orange-800" };
    // Trip 2 at shop needing repair = brova return
    if (brovasNeedRepair.length > 0 && maxTrip === 2)
      return { text: "Brova Return", cls: "bg-amber-100 text-amber-800" };
    // Trip 1 at shop needing repair = needs changes after 1st trial
    if (brovasNeedRepair.length > 0)
      return { text: "Needs Changes", cls: "bg-amber-100 text-amber-800" };
    if (brovas.length > 0 && brovasAtShop.length === brovas.length && finals.length === 0)
      return { text: `At shop — Trial ${maxTrip}`, cls: "bg-green-100 text-green-800" };
    if (waitingAcceptance.length > 0 && inProd.length === 0 && atShop.length > 0)
      return { text: "Awaiting brova trial", cls: "bg-amber-100 text-amber-800" };
    if (brovas.length > 0 && finals.length === 0)
      return { text: maxTrip >= 3 ? `Alt #${maxTrip - 1} in production` : maxTrip === 2 ? "Brova return in production" : "Brova in production", cls: "bg-purple-100 text-purple-800" };
    if (brovas.length === 0 && finals.length > 0 && waitingAcceptance.length > 0)
      return { text: "Finals pending release", cls: "bg-amber-100 text-amber-800" };
    if (inProd.length > 0)
      return { text: "In production", cls: "bg-blue-100 text-blue-800" };
    return { text: "In progress", cls: "bg-zinc-100 text-zinc-800" };
  })();

  const bCount = brovas.length;
  const fCount = finals.length;
  const summary = [bCount && `${bCount} Brova`, fCount && `${fCount} Final${fCount > 1 ? "s" : ""}`]
    .filter(Boolean)
    .join(" + ");

  const daysLabel = urgency.days !== null
    ? urgency.days < 0
      ? `${Math.abs(urgency.days)}d overdue`
      : urgency.days === 0
        ? "Due today"
        : `${urgency.days}d left`
    : null;

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
            <span className={cn("text-xs font-semibold uppercase px-2 py-0.5 rounded-md", statusLabel.cls)}>
              {statusLabel.text}
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
          </div>
        </div>

        {/* Delivery date — read-only */}
        {first.delivery_date_order && (
          <div className="shrink-0 text-right">
            <span className={cn(
              "inline-flex items-center gap-1 text-sm font-bold tabular-nums px-2 py-1 rounded-md",
              urgency.days !== null && urgency.days < 0 && "bg-red-100 text-red-800",
              urgency.days !== null && urgency.days >= 0 && urgency.days <= 2 && "bg-amber-100 text-amber-800",
              (urgency.days === null || urgency.days > 2) && "bg-muted text-foreground",
            )}>
              <Clock className="w-3.5 h-3.5" />
              {formatDate(first.delivery_date_order)}
            </span>
            {daysLabel && (
              <p className={cn("text-xs font-bold mt-0.5", urgency.className)}>{daysLabel}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared Plan Section (order-level) ──────────────────────────

function SharedPlanSection({
  plan,
  date,
  garments,
  updateMut,
}: {
  plan: Record<string, string>;
  date?: string;
  garments: WorkshopGarment[];
  updateMut: ReturnType<typeof useUpdateGarmentDetails>;
}) {
  const [planOpen, setPlanOpen] = useState(false);
  const hasSoaking = garments.some((g) => g.soaking);
  const anyStarted = garments.some((g) => g.start_time);
  const anyCanEdit = garments.some(
    (g) =>
      g.location === "workshop" &&
      !g.start_time &&
      !["ready_for_dispatch", "completed", "ready_for_pickup"].includes(g.piece_stage ?? ""),
  );

  const visibleSteps = PLAN_STEPS.filter(
    (s) => s.key !== "soaker" || hasSoaking,
  );

  const handlePlanConfirm = async (
    newPlan: Record<string, string>,
    newDate: string,
  ) => {
    // Apply to all planned garments
    await Promise.all(
      garments.map((g) =>
        updateMut.mutateAsync({
          id: g.id,
          updates: {
            assigned_date: newDate || null,
            production_plan: newPlan,
          },
        }),
      ),
    );
  };

  return (
    <div className="mt-3 bg-card border rounded-xl p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Production Plan
        </h3>
        {anyCanEdit ? (
          <button
            onClick={() => setPlanOpen(true)}
            className="text-xs text-primary hover:underline cursor-pointer font-medium"
          >
            Edit plan for all
          </button>
        ) : anyStarted ? (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Play className="w-3 h-3" /> In progress
          </span>
        ) : null}
      </div>

      {/* Worker pills */}
      <div className="flex flex-wrap gap-1.5">
        {visibleSteps.map((step) => {
          const worker = plan[step.key];
          if (!worker) return null;
          return (
            <span
              key={step.key}
              className="inline-flex items-center gap-1 text-xs bg-zinc-100 text-zinc-700 px-2 py-1 rounded-md"
            >
              <span className="text-muted-foreground">{step.label}:</span>
              <span className="font-semibold">{worker}</span>
            </span>
          );
        })}
      </div>

      {anyCanEdit && (
        <PlanDialog
          open={planOpen}
          onOpenChange={setPlanOpen}
          onConfirm={handlePlanConfirm}
          garmentCount={garments.length}
          defaultDate={date}
          defaultPlan={plan}
          title="Edit Production Plan (All Garments)"
          confirmLabel="Save for All"
          hasSoaking={hasSoaking}
        />
      )}
    </div>
  );
}

// ── Garment Plan Card ──────────────────────────────────────────

function GarmentPlanCard({
  garment,
  updateMut,
  sharedPlan,
}: {
  garment: WorkshopGarment;
  updateMut: ReturnType<typeof useUpdateGarmentDetails>;
  sharedPlan: Record<string, string> | null;
}) {
  const plan = (garment.production_plan ?? {}) as Record<string, string>;
  const history = (garment.worker_history ?? {}) as Record<string, string>;
  const currentStageOrder = STAGE_ORDER[garment.piece_stage ?? ""] ?? 0;
  const hasSoaking = !!garment.soaking;
  const tripNum = garment.trip_number ?? 1;
  const needsRepairAtShop =
    garment.location === "shop" &&
    (garment.feedback_status === "needs_repair" || garment.feedback_status === "needs_redo");
  // Alteration (In) only for trip 3+ (went back twice already)
  const isAlterationIn = needsRepairAtShop && tripNum >= 3;
  const isBrovaReturn = needsRepairAtShop && tripNum === 2;
  const isAtShopPostProduction =
    garment.location === "shop" && !needsRepairAtShop;
  const hasStarted = !!garment.start_time;
  const isReturn = (garment.trip_number ?? 1) > 1;
  const currentTripEntry = getCurrentTripEntry(garment);
  const reentryStage = currentTripEntry?.reentry_stage ?? null;
  const qcFailCount = currentTripEntry?.qc_attempts?.filter((a) => a.result === "fail").length ?? 0;
  // For current trip: check if any stage from the re-entry point onward has been completed
  // by comparing worker_history against the current trip's expected stages
  const hasCurrentTripProgress = (() => {
    if (!currentTripEntry || !history || Object.keys(history).length === 0) return false;
    // If this is a re-entry, only count progress if worker_history has entries
    // for stages at or after the re-entry point (not leftover from prev trip)
    if (reentryStage) {
      const stageKeys = PLAN_STEPS.map((s) => s.responsibility);
      const reentryIdx = stageKeys.indexOf(reentryStage as typeof stageKeys[number]);
      if (reentryIdx < 0) return false;
      const relevantStages = stageKeys.slice(reentryIdx);
      const relevantKeys = relevantStages.map((s) => PLAN_STEPS.find((p) => p.responsibility === s)?.key).filter(Boolean);
      return relevantKeys.some((k) => k && history[k]);
    }
    return Object.keys(history).length > 0;
  })();
  const canEdit =
    garment.location === "workshop" &&
    !hasStarted &&
    !hasCurrentTripProgress &&
    !["ready_for_dispatch", "completed", "ready_for_pickup"].includes(garment.piece_stage ?? "");

  const [planOpen, setPlanOpen] = useState(false);

  const visibleSteps = PLAN_STEPS.filter(
    (s) => s.key !== "soaker" || hasSoaking,
  );

  const contextMessage = (() => {
    // Done states
    if (garment.piece_stage === "completed")
      return { text: "Completed", cls: "text-green-700" };
    if (garment.piece_stage === "ready_for_dispatch")
      return { text: "Production complete — ready for dispatch", cls: "text-emerald-700" };
    // Transit
    if (garment.location === "transit_to_shop")
      return { text: "In transit to shop", cls: "text-cyan-700" };
    if (garment.location === "transit_to_workshop")
      return { text: "In transit to workshop", cls: "text-orange-700" };
    // Shop states
    if (isAlterationIn)
      return { text: "Needs to return for alteration", cls: "text-orange-700" };
    if (isBrovaReturn)
      return { text: "Brova return — needs changes", cls: "text-amber-700" };
    if (needsRepairAtShop && tripNum === 1)
      return { text: "Needs changes after 1st trial", cls: "text-amber-700" };
    if (garment.piece_stage === "awaiting_trial" && garment.location === "shop")
      return { text: "At shop — awaiting trial", cls: "text-green-700" };
    if (garment.piece_stage === "ready_for_pickup")
      return { text: "Ready for pickup", cls: "text-green-700" };
    if (isAtShopPostProduction)
      return { text: "At shop", cls: "text-green-700" };
    // Workshop states
    if (garment.piece_stage === "waiting_for_acceptance")
      return { text: "Parked — awaiting brova acceptance", cls: "text-muted-foreground" };
    if (garment.location === "workshop" && hasStarted)
      return { text: "In production", cls: "text-blue-700" };
    if (garment.location === "workshop" && !hasStarted && garment.in_production)
      return { text: "Scheduled — waiting to start", cls: "text-muted-foreground" };
    if (garment.location === "workshop" && !hasStarted && !garment.in_production)
      return { text: "Received — not yet started", cls: "text-muted-foreground" };
    return null;
  })();

  const handlePlanConfirm = async (
    newPlan: Record<string, string>,
    date: string,
    _unit?: string,
    reentryStage?: string,
    newDeliveryDate?: string,
  ) => {
    const updates: Record<string, unknown> = {
      assigned_date: date || null,
      production_plan: newPlan,
    };
    if (reentryStage) {
      updates.piece_stage = reentryStage;
    }
    if (newDeliveryDate !== undefined) {
      updates.delivery_date = newDeliveryDate || null;
    }
    await updateMut.mutateAsync({ id: garment.id, updates });
  };

  return (
    <div className={cn(
      "bg-card border rounded-xl p-3 shadow-sm",
      garment.express && "border-orange-200",
      garment.piece_stage === "waiting_for_acceptance" && "opacity-50 bg-zinc-50",
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
          <Link
            to="/assigned/garment/$garmentId"
            params={{ garmentId: garment.id }}
            className="font-mono font-bold text-sm text-primary hover:underline"
          >
            {garment.garment_id ?? garment.id.slice(0, 8)}
          </Link>
          {garment.express && <ExpressBadge />}
          {(garment.trip_number ?? 1) > 1 && <TrialBadge tripNumber={garment.trip_number} />}
          {isAlterationIn && <AlterationInBadge />}
          {isBrovaReturn && (
            <span className="text-xs font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500 text-white">
              Brova Return
            </span>
          )}
          <StageBadge stage={garment.piece_stage} />
          <span className={cn(
            "text-xs font-semibold uppercase px-1.5 py-0.5 rounded",
            garment.location === "shop" ? "bg-green-100 text-green-800"
              : garment.location === "workshop" ? "bg-blue-100 text-blue-800"
              : garment.location === "transit_to_shop" ? "bg-cyan-100 text-cyan-800"
              : garment.location === "transit_to_workshop" ? "bg-orange-100 text-orange-800"
              : "bg-zinc-100 text-zinc-800",
          )}>
            {garment.location === "shop" ? "At Shop"
              : garment.location === "workshop" ? "Workshop"
              : garment.location === "transit_to_shop" ? "Transit to Shop"
              : garment.location === "transit_to_workshop" ? "Transit to Workshop"
              : garment.location}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right text-[11px] tabular-nums leading-tight">
            {garment.delivery_date && (() => {
              const days = Math.ceil((new Date(garment.delivery_date).getTime() - Date.now()) / 86400000);
              const isDone = garment.piece_stage === "completed" || garment.piece_stage === "ready_for_pickup";
              const daysText = days < 0 ? `${Math.abs(days)}d late` : days === 0 ? "today" : `${days}d`;
              return (
                <div className={cn(
                  isDone ? "text-muted-foreground" : days < 0 ? "text-red-700" : days <= 2 ? "text-amber-700" : "text-muted-foreground",
                )}>
                  Due <span className="font-semibold">{formatDate(String(garment.delivery_date))}</span>
                  <span className="ml-0.5">({daysText})</span>
                </div>
              );
            })()}
            {garment.assigned_date && (() => {
              const days = Math.ceil((new Date(garment.assigned_date + "T23:59:59").getTime() - Date.now()) / 86400000);
              const isPast = days < 0;
              const isDone = garment.piece_stage === "ready_for_dispatch" || garment.piece_stage === "completed" || garment.piece_stage === "ready_for_pickup";
              const daysText = days < 0 ? `${Math.abs(days)}d over` : days === 0 ? "today" : `${days}d`;
              return (
                <div className={cn(
                  isPast && !isDone ? "text-red-600" : "text-muted-foreground",
                )}>
                  Assigned <span className="font-semibold">{formatDate(garment.assigned_date)}</span>
                  <span className="ml-0.5">({daysText})</span>
                </div>
              );
            })()}
          </div>
          {canEdit ? (
            <button
              onClick={() => setPlanOpen(true)}
              className="p-1.5 rounded-md hover:bg-muted cursor-pointer transition-colors"
              title="Edit production plan"
            >
              <Edit3 className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          ) : hasStarted ? (
            <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-0.5" title="In progress — cannot edit">
              <Play className="w-3 h-3" />
            </span>
          ) : null}
        </div>
      </div>

      {/* Pipeline */}
      {garment.production_plan && (
        <div className="mt-2">
          <ProductionPipeline currentStage={garment.piece_stage} compact hasSoaking={hasSoaking} reentryStage={isReturn ? reentryStage : undefined} qcFailCount={qcFailCount} />
          {contextMessage && (
            <p className={cn("text-xs font-semibold mt-1", contextMessage.cls)}>
              {contextMessage.text}
            </p>
          )}
        </div>
      )}

      {/* No plan yet */}
      {!garment.production_plan && (
        <p className="mt-2 text-xs text-muted-foreground italic">
          {contextMessage ? contextMessage.text : "Not yet scheduled"}
        </p>
      )}


      {/* Worker summary — only show if different from shared plan, or no shared plan */}
      {garment.production_plan && (() => {
        // Find differences from shared plan
        const diffs = sharedPlan
          ? visibleSteps.filter((step) => {
              const mine = plan[step.key] ?? "";
              const shared = sharedPlan[step.key] ?? "";
              return mine !== shared && mine !== "";
            })
          : visibleSteps.filter((step) => plan[step.key]);

        // Also show completed stages (worker_history) regardless
        const completed = visibleSteps.filter((step) => {
          const isDone = currentStageOrder > step.stageOrder;
          return isDone && history[step.key];
        });

        const toShow = sharedPlan
          ? [...new Set([...diffs, ...completed])]
          : visibleSteps;

        if (toShow.length === 0 && sharedPlan) return null;

        return (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {!sharedPlan && toShow.map((step) => {
              const worker = history[step.key] ?? plan[step.key];
              if (!worker) return null;
              const isDone = currentStageOrder > step.stageOrder;
              const isCurrent = currentStageOrder === step.stageOrder;
              return (
                <span key={step.key} className={cn(
                  "inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded",
                  isDone ? "bg-emerald-50 text-emerald-700"
                    : isCurrent ? "bg-blue-50 text-blue-700 border border-blue-200"
                    : "bg-zinc-50 text-muted-foreground",
                )}>
                  {isDone && <Check className="w-2.5 h-2.5" />}
                  <span className="font-medium">{step.label}:</span>
                  <span className="font-semibold">{worker}</span>
                </span>
              );
            })}
            {sharedPlan && diffs.length > 0 && (
              <>
                <span className="text-xs text-amber-600 font-semibold">Overrides:</span>
                {diffs.map((step) => (
                  <span key={step.key} className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                    <span className="font-medium">{step.label}:</span>
                    <span className="font-semibold">{plan[step.key]}</span>
                  </span>
                ))}
              </>
            )}
            {sharedPlan && completed.length > 0 && diffs.length === 0 && completed.map((step) => (
              <span key={step.key} className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                <Check className="w-2.5 h-2.5" />
                <span className="font-medium">{step.label}:</span>
                <span className="font-semibold">{history[step.key]}</span>
              </span>
            ))}
          </div>
        );
      })()}

      {/* Compact trip history for returning garments */}
      {isReturn && <CompactTripHistory tripHistory={garment.trip_history as TripHistoryEntry[] | string | null | undefined} />}

      {/* PlanDialog for editing — includes delivery date + reentry for returns */}
      {canEdit && (
        <PlanDialog
          open={planOpen}
          onOpenChange={setPlanOpen}
          onConfirm={handlePlanConfirm}
          garmentCount={1}
          defaultDate={garment.assigned_date ?? undefined}
          defaultPlan={(garment.production_plan ?? sharedPlan) as Record<string, string> | null}
          title={`Edit Plan — ${garment.garment_id}`}
          confirmLabel="Save Changes"
          hasSoaking={hasSoaking}
          isAlteration={isReturn}
          showDeliveryDate
          defaultDeliveryDate={garment.delivery_date ? String(garment.delivery_date) : undefined}
        />
      )}
    </div>
  );
}

// ── Compact Trip History (inline in garment card) ─────────────

const WORKER_LABELS: Record<string, string> = {
  soaker: "Soaker",
  cutter: "Cutter",
  post_cutter: "Post-Cutter",
  sewer: "Sewer",
  finisher: "Finisher",
  ironer: "Ironer",
  quality_checker: "QC",
};

function CompactTripHistory({ tripHistory: raw }: { tripHistory: TripHistoryEntry[] | string | null | undefined }) {
  const [open, setOpen] = useState(false);

  const entries: TripHistoryEntry[] = !raw
    ? []
    : typeof raw === "string"
      ? JSON.parse(raw)
      : Array.isArray(raw)
        ? raw
        : [];

  if (entries.length === 0) return null;

  return (
    <div className="mt-2 border-t pt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors w-full"
      >
        <History className="w-3 h-3" />
        <span className="font-semibold">
          Previous {entries.length === 1 ? "trip" : `${entries.length} trips`}
        </span>
        <ChevronDown className={cn("w-3 h-3 ml-auto transition-transform duration-200", open && "rotate-180")} />
      </button>

      <div className={cn(
        "grid transition-[grid-template-rows] duration-250 ease-out",
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      )}>
        <div className="overflow-hidden">
          <div className="mt-1.5 space-y-1.5 pb-0.5">
            {entries.map((entry, i) => (
              <div key={i} className="bg-muted/40 rounded-md px-2 py-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className={cn(
                    "font-bold uppercase px-1.5 py-0.5 rounded",
                    entry.trip === 1 ? "bg-blue-100 text-blue-700"
                      : entry.trip === 2 ? "bg-amber-100 text-amber-700"
                      : "bg-orange-100 text-orange-700",
                  )}>
                    {entry.trip === 1 ? "Original" : entry.trip === 2 ? "Return" : `Alt ${entry.trip - 2}`}
                  </span>
                  {entry.assigned_date && (
                    <span className="text-muted-foreground">
                      {formatDate(entry.assigned_date)}
                      {entry.completed_date && <span> → {formatDate(entry.completed_date)}</span>}
                    </span>
                  )}
                </div>
                {entry.worker_history && Object.keys(entry.worker_history).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Object.entries(entry.worker_history).map(([key, name]) => (
                      <span key={key} className="inline-flex items-center gap-0.5 text-[11px] bg-background px-1.5 py-0.5 rounded">
                        <span className="text-muted-foreground">{WORKER_LABELS[key] ?? key}:</span>
                        <span className="font-semibold">{name}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
