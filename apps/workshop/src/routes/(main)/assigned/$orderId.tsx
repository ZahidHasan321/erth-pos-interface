import { useState } from "react";
import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useOrderGarments } from "@/hooks/useWorkshopGarments";
import { useUpdateGarmentDetails } from "@/hooks/useGarmentMutations";
import { PlanDialog } from "@/components/shared/PlanDialog";
import { ReturnPlanDialog } from "@/components/shared/ReturnPlanDialog";
import { ProductionPipeline } from "@/components/shared/ProductionPipeline";
import {
  StageBadge,
  BrandBadge,
  ExpressBadge,
  AlterationInBadge,
  QcFixBadge,
  AlterationBadge,
} from "@/components/shared/StageBadge";
import { MetadataChip } from "@/components/shared/PageShell";
import { Skeleton } from "@repo/ui/skeleton";
import { Label } from "@repo/ui/label";
import { ConfirmedDatePicker } from "@/components/shared/ConfirmedDatePicker";
import { useUpdateOrderDeliveryDate } from "@/hooks/useGarmentMutations";
import { cn, formatDate, toLocalDateStr, parseUtcTimestamp, getKuwaitDayRange } from "@/lib/utils";
import { getGarmentEditability } from "@/lib/editability";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  History,
  Lock,
  Package,
  Home,
  Edit3,
  Phone,
  Play,
  Zap,
} from "lucide-react";
import { getAlterationNumber } from "@repo/database";
import type { WorkshopGarment, TripHistoryEntry } from "@repo/database";

export const Route = createFileRoute("/(main)/assigned/$orderId")({
  component: AssignedOrderDetailPage,
  head: () => ({ meta: [{ title: "Order Details" }] }),
});

// ── Constants ──────────────────────────────────────────────────

const PLAN_STEPS = [
  { key: "soaker", label: "Soaker", responsibility: "soaking", stageOrder: 1 },
  { key: "cutter", label: "Cutter", responsibility: "cutting", stageOrder: 2 },
  {
    key: "post_cutter",
    label: "Post-Cutter",
    responsibility: "post_cutting",
    stageOrder: 3,
  },
  { key: "sewer", label: "Sewing Unit", responsibility: "sewing", stageOrder: 4 },
  {
    key: "finisher",
    label: "Finisher",
    responsibility: "finishing",
    stageOrder: 5,
  },
  { key: "ironer", label: "Ironer", responsibility: "ironing", stageOrder: 6 },
  {
    key: "quality_checker",
    label: "QC Inspector",
    responsibility: "quality_check",
    stageOrder: 7,
  },
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
function getCurrentTripEntry(
  garment: WorkshopGarment,
): TripHistoryEntry | null {
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
    (parseUtcTimestamp(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
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
  const anyBrovaAccepted = garments.some(
    (g) =>
      g.garment_type === "brova" &&
      (g.acceptance_status === true || g.piece_stage === "completed"),
  );

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (garments.length === 0) {
    return (
      <div className="p-4">
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
    const ref = (plannedGarments[0].production_plan ?? {}) as Record<
      string,
      string
    >;
    const nonSoakSteps = PLAN_STEPS.filter((s) => s.key !== "soaker");
    const allSame = plannedGarments.every((g) => {
      const p = (g.production_plan ?? {}) as Record<string, string>;
      return nonSoakSteps.every((s) => (p[s.key] ?? "") === (ref[s.key] ?? ""));
    });
    if (!allSame) return null;
    // For soaker, only compare garments that both have soaking
    const soakingGarments = plannedGarments.filter((g) => g.soaking);
    if (soakingGarments.length > 1) {
      const refSoaker =
        ((soakingGarments[0].production_plan ?? {}) as Record<string, string>)
          .soaker ?? "";
      const soakersSame = soakingGarments.every((g) => {
        const soaker =
          ((g.production_plan ?? {}) as Record<string, string>).soaker ?? "";
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
    <div className="p-3 sm:p-4 pb-8">
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
                  <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md text-xs">
                    Brova
                  </span>
                  {brovas.length} garment{brovas.length !== 1 ? "s" : ""}
                </h3>
                {brovas.map((g) => (
                  <GarmentPlanCard
                    key={g.id}
                    garment={g}
                    updateMut={updateMut}
                    sharedPlan={sharedPlan}
                    anyBrovaAccepted={anyBrovaAccepted}
                  />
                ))}
              </div>
            )}
            {finals.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1.5">
                  <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md text-xs">
                    Final
                  </span>
                  {finals.length} garment{finals.length !== 1 ? "s" : ""}
                </h3>
                {finals.map((g) => (
                  <GarmentPlanCard
                    key={g.id}
                    garment={g}
                    updateMut={updateMut}
                    sharedPlan={sharedPlan}
                    anyBrovaAccepted={anyBrovaAccepted}
                  />
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
  const brands = [
    ...new Set(garments.map((g) => g.order_brand).filter(Boolean)),
  ] as string[];
  const hasExpress = garments.some((g) => g.express);
  const brovas = garments.filter((g) => g.garment_type === "brova");
  const finals = garments.filter((g) => g.garment_type === "final");
  const atShop = garments.filter((g) => g.location === "shop");
  const waitingAcceptance = garments.filter(
    (g) => g.piece_stage === "waiting_for_acceptance",
  );
  const inProd = garments.filter((g) => g.in_production && g.production_plan);
  const readyDispatch = garments.filter(
    (g) => g.piece_stage === "ready_for_dispatch",
  );
  const needsRepairAtShop = garments.filter(
    (g) =>
      g.location === "shop" &&
      g.piece_stage !== "discarded" &&
      (g.feedback_status === "needs_repair" ||
        g.feedback_status === "needs_redo"),
  );
  const brovasAtShop = brovas.filter((g) => g.location === "shop");
  const anyBrovaAccepted = brovas.some(
    (g) => g.acceptance_status === true || g.piece_stage === "completed",
  );
  const maxTrip = Math.max(...garments.map((g) => g.trip_number ?? 1));
  const maxAltNumber = getAlterationNumber(maxTrip);
  const urgency = getDeliveryUrgency(first.delivery_date_order);

  const statusLabel = (() => {
    if (
      first.order_phase === "completed" ||
      garments.every((g) => g.piece_stage === "completed")
    )
      return { text: "Completed", cls: "bg-green-100 text-green-800" };
    if (readyDispatch.length === garments.length)
      return {
        text: "Ready for dispatch",
        cls: "bg-emerald-100 text-emerald-800",
      };
    // At shop needing fix: pending return to workshop. "(In)" is reserved for
    // garments actively being fixed in production.
    if (needsRepairAtShop.length > 0) {
      const nextAlt = Math.max(...needsRepairAtShop.map((g) => g.trip_number ?? 1));
      return { text: `Pending return — Alt ${nextAlt}`, cls: "bg-orange-100 text-orange-800" };
    }
    if (
      brovas.length > 0 &&
      brovasAtShop.length === brovas.length &&
      finals.length === 0
    )
      return {
        text: `At shop — Trial ${maxTrip}`,
        cls: "bg-green-100 text-green-800",
      };
    if (
      waitingAcceptance.length > 0 &&
      inProd.length === 0 &&
      atShop.length > 0
    ) {
      if (brovas.length > 0 && anyBrovaAccepted)
        return {
          text: "Awaiting finals release",
          cls: "bg-violet-100 text-violet-800",
        };
      return {
        text: "Awaiting brova trial",
        cls: "bg-amber-100 text-amber-800",
      };
    }
    if (brovas.length > 0 && finals.length === 0)
      return {
        text: maxAltNumber !== null
          ? `Alt ${maxAltNumber} in production`
          : "Brova in production",
        cls: "bg-purple-100 text-purple-800",
      };
    if (
      brovas.length === 0 &&
      finals.length > 0 &&
      waitingAcceptance.length > 0
    )
      return {
        text: "Finals pending release",
        cls: "bg-amber-100 text-amber-800",
      };
    if (inProd.length > 0)
      return { text: "In production", cls: "bg-blue-100 text-blue-800" };
    return { text: "In progress", cls: "bg-zinc-100 text-zinc-800" };
  })();

  const bCount = brovas.length;
  const fCount = finals.length;
  const summary = [
    bCount && `${bCount} Brova`,
    fCount && `${fCount} Final${fCount > 1 ? "s" : ""}`,
  ]
    .filter(Boolean)
    .join(" + ");

  const daysLabel =
    urgency.days !== null
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
            <span className="font-semibold text-sm">
              {first.customer_name ?? "—"}
            </span>
            {brands.map((b) => (
              <BrandBadge key={b} brand={b} />
            ))}
            {hasExpress && <ExpressBadge />}
            {first.home_delivery_order && (
              <MetadataChip icon={Home} variant="indigo">
                Delivery
              </MetadataChip>
            )}
            <span
              className={cn(
                "text-xs font-semibold uppercase px-2 py-0.5 rounded-md",
                statusLabel.cls,
              )}
            >
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
            {first.order_date && (
              <span className="flex items-center gap-1" title="Ordered on">
                <Clock className="w-3.5 h-3.5" /> Ordered {formatDate(first.order_date)}
              </span>
            )}
          </div>
        </div>

        {/* Order-level delivery date — editable (cascades to shared garments) */}
        <OrderDeliveryDateEditor
          orderId={orderId}
          value={first.delivery_date_order ?? null}
          urgencyClassName={cn(
            urgency.days !== null && urgency.days < 0 && "bg-red-100 text-red-800",
            urgency.days !== null && urgency.days >= 0 && urgency.days <= 2 && "bg-amber-100 text-amber-800",
            (urgency.days === null || urgency.days > 2) && "bg-muted text-foreground",
          )}
          daysLabel={daysLabel}
          daysLabelClassName={urgency.className}
        />
      </div>
    </div>
  );
}

function OrderDeliveryDateEditor({
  orderId,
  value,
  urgencyClassName,
  daysLabel,
  daysLabelClassName,
}: {
  orderId: number;
  value: string | null;
  urgencyClassName: string;
  daysLabel: string | null;
  daysLabelClassName: string;
}) {
  const mut = useUpdateOrderDeliveryDate();
  return (
    <div className="shrink-0 text-right space-y-1">
      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1 justify-end">
        <Clock className="w-3 h-3" /> Delivery Date
      </Label>
      <div className={cn("inline-flex rounded-md p-0.5", urgencyClassName)}>
        <ConfirmedDatePicker
          value={value}
          onConfirm={async (d) => {
            const ds = toLocalDateStr(d);
            if (!ds) return;
            await mut.mutateAsync({ orderId, date: ds });
          }}
          label="order delivery date"
          extraDescription="Garments sharing this date will also be updated; garments with custom dates (e.g. express) stay unchanged."
          className="h-8 text-sm font-semibold bg-transparent border-0"
          displayFormat="PPP"
        />
      </div>
      {daysLabel && (
        <p className={cn("text-xs font-bold", daysLabelClassName)}>{daysLabel}</p>
      )}
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
  const editableGarments = garments.filter((g) => getGarmentEditability(g).canEditPlan);
  const skippedCount = garments.length - editableGarments.length;
  const anyCanEdit = editableGarments.length > 0;
  const allReturns = editableGarments.length > 0 && editableGarments.every((g) => (g.trip_number ?? 1) >= 2);
  const planLabel = allReturns ? "Alteration Plan" : "Production Plan";
  // Bulk lock = union of per-garment locks (if any editable garment has stage X done, no bulk edit for X).
  const sharedLockedSteps = (() => {
    const union = new Set<string>();
    for (const g of editableGarments) {
      for (const k of getGarmentEditability(g).lockedPlanSteps) union.add(k);
    }
    return union;
  })();

  const visibleSteps = PLAN_STEPS.filter(
    (s) => s.key !== "soaker" || hasSoaking,
  );

  const handlePlanConfirm = async (
    newPlan: Record<string, string>,
    newDate: string,
  ) => {
    // Only apply to garments whose plan is still editable (not started, not done).
    // Started/done garments are protected by updateGarmentDetails anyway, but
    // skipping them here makes the skipped count in the UI accurate.
    await Promise.all(
      editableGarments.map((g) =>
        updateMut.mutateAsync({
          id: g.id,
          updates: {
            assigned_date: newDate || null,
            production_plan: newPlan,
          },
        }),
      ),
    );
    if (skippedCount > 0) {
      toast.info(
        `Updated ${editableGarments.length} garment${editableGarments.length !== 1 ? "s" : ""} — ${skippedCount} in production skipped`,
      );
    }
  };

  return (
    <div className="mt-3 bg-card border rounded-xl p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {planLabel}
        </h3>
        {anyCanEdit ? (
          <button
            onClick={() => setPlanOpen(true)}
            className="text-xs text-primary hover:underline cursor-pointer font-medium"
          >
            {skippedCount > 0
              ? `Edit plan for ${editableGarments.length} of ${garments.length}`
              : "Edit plan for all"}
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
          garmentCount={editableGarments.length}
          defaultDate={date}
          defaultPlan={plan}
          title={`Edit ${planLabel}`}
          confirmLabel={skippedCount > 0 ? `Save for ${editableGarments.length}` : "Save for All"}
          hasSoaking={editableGarments.some((g) => g.soaking)}
          lockedSteps={sharedLockedSteps}
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
  anyBrovaAccepted,
}: {
  garment: WorkshopGarment;
  updateMut: ReturnType<typeof useUpdateGarmentDetails>;
  sharedPlan: Record<string, string> | null;
  anyBrovaAccepted: boolean;
}) {
  const plan = (garment.production_plan ?? {}) as Record<string, string>;
  const history = (garment.worker_history ?? {}) as Record<string, string>;
  const currentStageOrder = STAGE_ORDER[garment.piece_stage ?? ""] ?? 0;
  const hasSoaking = !!garment.soaking;
  const tripNum = garment.trip_number ?? 1;
  const needsRepairAtShop =
    garment.location === "shop" &&
    garment.piece_stage !== "discarded" &&
    (garment.feedback_status === "needs_repair" ||
      garment.feedback_status === "needs_redo");
  // "(In)" = in production going through fix. Any trip >= 2 currently in the
  // workshop pipeline (workshop/transit), except discarded. At-shop rejected
  // garments are a separate pending-return state, not alt-in.
  const isAlterationIn =
    garment.piece_stage !== "discarded" &&
    tripNum >= 2 &&
    garment.location !== "shop";
  const isAtShopPostProduction =
    garment.location === "shop" && !needsRepairAtShop;
  const hasStarted = !!garment.start_time;
  const isReturn = tripNum > 1;
  const currentTripEntry = getCurrentTripEntry(garment);
  const reentryStage = currentTripEntry?.reentry_stage ?? null;
  const qcFailCount =
    currentTripEntry?.qc_attempts?.filter((a) => a.result === "fail").length ??
    0;
  const hasQcFailThisTrip = qcFailCount > 0;
  const editability = getGarmentEditability(garment);
  const canEdit = editability.canEditPlan;

  const [planOpen, setPlanOpen] = useState(false);

  const visibleSteps = PLAN_STEPS.filter(
    (s) => s.key !== "soaker" || hasSoaking,
  );

  const contextMessage = (() => {
    const altN = getAlterationNumber(tripNum);
    const altPrefix = altN !== null ? `Alt ${altN} — ` : "";
    // Done states
    if (garment.piece_stage === "discarded")
      return { text: "Discarded (redo)", cls: "text-red-700" };
    if (garment.piece_stage === "completed")
      return { text: "Completed", cls: "text-green-700" };
    if (garment.piece_stage === "ready_for_dispatch")
      return {
        text: `${altPrefix}Production complete — ready for dispatch`,
        cls: "text-emerald-700",
      };
    // Transit
    if (garment.location === "transit_to_shop")
      return { text: `${altPrefix}In transit to shop`, cls: "text-cyan-700" };
    if (garment.location === "transit_to_workshop")
      return { text: `${altPrefix}In transit to workshop`, cls: "text-orange-700" };
    // Shop states
    if (needsRepairAtShop) {
      // Next alt cycle = current trip (will become trip+1 on return).
      const nextAlt = tripNum ?? 1;
      return { text: `Needs to return for Alt ${nextAlt}`, cls: "text-orange-700" };
    }
    if (garment.piece_stage === "awaiting_trial" && garment.location === "shop")
      return {
        text: altN !== null ? `At shop — Alt ${altN} trial` : "At shop — awaiting trial",
        cls: "text-green-700",
      };
    if (garment.piece_stage === "ready_for_pickup")
      return { text: "Ready for pickup", cls: "text-green-700" };
    if (isAtShopPostProduction) return null;
    // Workshop states
    if (garment.piece_stage === "waiting_for_acceptance") {
      if (anyBrovaAccepted)
        return {
          text: "Customer approved — ready to release finals",
          cls: "text-violet-700",
        };
      return {
        text: "Parked — awaiting brova acceptance",
        cls: "text-muted-foreground",
      };
    }
    if (garment.location === "workshop" && hasStarted)
      return { text: `${altPrefix}In production`, cls: "text-blue-700" };
    if (garment.location === "workshop" && !hasStarted && garment.in_production)
      return {
        text: `${altPrefix}Scheduled — waiting to start`,
        cls: "text-muted-foreground",
      };
    if (
      garment.location === "workshop" &&
      !hasStarted &&
      !garment.in_production
    )
      return {
        text: `${altPrefix}Received — not yet started`,
        cls: "text-muted-foreground",
      };
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

  const isDiscarded = garment.piece_stage === "discarded";
  const replacedByGarmentId = (garment as typeof garment & {
    replaced_by_garment_id: string | null;
  }).replaced_by_garment_id;

  return (
    <div
      className={cn(
        "bg-card border rounded-xl p-3 shadow-sm",
        garment.express && "border-orange-200",
        isReturn && "border-l-4 border-l-orange-400",
        isAlterationIn && "bg-orange-50/40 border-orange-200",
        garment.piece_stage === "waiting_for_acceptance" &&
          !anyBrovaAccepted &&
          "opacity-50 bg-zinc-50",
        isDiscarded && "bg-red-50/40 border-red-200 opacity-75",
      )}
    >
      {/* Garment header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          {/* Identity row */}
          <div className="flex items-center gap-1.5 flex-wrap">
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
            {garment.express && (
              <Zap
                className="w-3.5 h-3.5 text-red-600 fill-red-600"
                aria-label="Express"
              />
            )}
            {garment.home_delivery_order && (
              <Home
                className="w-3.5 h-3.5 text-indigo-600"
                aria-label="Home delivery"
              />
            )}
          </div>

          {/* Status row — stage + location + alt/qc chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <StageBadge
              stage={garment.piece_stage}
              garmentType={garment.garment_type}
              inProduction={garment.in_production}
              location={garment.location}
              finalApprovalState={
                garment.garment_type === "final" &&
                garment.piece_stage === "waiting_for_acceptance"
                  ? anyBrovaAccepted
                    ? "approved"
                    : "pending"
                  : undefined
              }
            />
            <span
              className={cn(
                "text-xs font-semibold uppercase px-1.5 py-0.5 rounded",
                garment.location === "shop"
                  ? "bg-green-100 text-green-800"
                  : garment.location === "workshop"
                    ? "bg-blue-100 text-blue-800"
                    : garment.location === "transit_to_shop"
                      ? "bg-cyan-100 text-cyan-800"
                      : garment.location === "transit_to_workshop"
                        ? "bg-orange-100 text-orange-800"
                        : "bg-zinc-100 text-zinc-800",
              )}
            >
              {garment.location === "shop"
                ? "At Shop"
                : garment.location === "workshop"
                  ? "Workshop"
                  : garment.location === "transit_to_shop"
                    ? "Transit to Shop"
                    : garment.location === "transit_to_workshop"
                      ? "Transit to Workshop"
                      : garment.location}
            </span>
            {garment.piece_stage !== "discarded" && !isAlterationIn && (
              <AlterationBadge
                tripNumber={garment.trip_number}
                garmentType={garment.garment_type}
              />
            )}
            {garment.piece_stage !== "discarded" && isAlterationIn && (
              <AlterationInBadge tripNumber={tripNum} />
            )}
            {garment.piece_stage !== "discarded" && hasQcFailThisTrip && (
              <QcFixBadge
                tripNumber={garment.trip_number}
                tripHistory={garment.trip_history}
              />
            )}
          </div>
        </div>

        <div className="shrink-0 text-right space-y-1 text-[11px] tabular-nums leading-tight">
          {garment.delivery_date &&
            (() => {
              const days = Math.ceil(
                (parseUtcTimestamp(garment.delivery_date).getTime() - Date.now()) /
                  86400000,
              );
              const isDone =
                garment.piece_stage === "completed" ||
                garment.piece_stage === "ready_for_pickup";
              const daysText =
                days < 0
                  ? `${Math.abs(days)}d late`
                  : days === 0
                    ? "today"
                    : `${days}d`;
              return (
                <div
                  className={cn(
                    "flex items-center justify-end gap-1",
                    isDone
                      ? "text-muted-foreground"
                      : days < 0
                        ? "text-red-700"
                        : days <= 2
                          ? "text-amber-700"
                          : "text-muted-foreground",
                  )}
                >
                  <span>Due</span>
                  <span className="font-semibold">
                    {formatDate(String(garment.delivery_date))}
                  </span>
                  <span>({daysText})</span>
                </div>
              );
            })()}
          {garment.assigned_date &&
            (() => {
              const days = Math.ceil(
                (new Date(getKuwaitDayRange(garment.assigned_date).end).getTime() -
                  Date.now()) /
                  86400000,
              );
              const isPast = days < 0;
              const isDone =
                garment.piece_stage === "ready_for_dispatch" ||
                garment.piece_stage === "completed" ||
                garment.piece_stage === "ready_for_pickup";
              const daysText =
                days < 0
                  ? `${Math.abs(days)}d over`
                  : days === 0
                    ? "today"
                    : `${days}d`;
              return (
                <div
                  className={cn(
                    isPast && !isDone ? "text-red-600" : "text-muted-foreground",
                  )}
                >
                  Assigned{" "}
                  <span className="font-semibold">
                    {formatDate(garment.assigned_date)}
                  </span>
                  <span className="ml-0.5">({daysText})</span>
                </div>
              );
            })()}
          <div className="flex items-center justify-end gap-1 pt-0.5">
            {isDiscarded ? (
              replacedByGarmentId ? (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-[11px] font-semibold text-muted-foreground whitespace-nowrap">
                  Replacement created
                </span>
              ) : (
                <Link
                  to="/assigned/$orderId/add-garment"
                  params={{ orderId: String(garment.order_id) }}
                  search={{ replaces: garment.id }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-600 text-white text-xs font-semibold hover:bg-red-700 whitespace-nowrap"
                >
                  Create replacement
                  <ArrowRight className="w-3 h-3" />
                </Link>
              )
            ) : canEdit ? (
              <button
                onClick={() => setPlanOpen(true)}
                className="p-1.5 rounded-md hover:bg-muted cursor-pointer transition-colors"
                title="Edit production plan"
              >
                <Edit3 className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            ) : editability.canEditDeliveryDate ? (
              <div className="w-32" title="Change delivery date">
                <ConfirmedDatePicker
                  value={garment.delivery_date ?? ""}
                  onConfirm={async (d) => {
                    await updateMut.mutateAsync({
                      id: garment.id,
                      updates: { delivery_date: toLocalDateStr(d) },
                    });
                  }}
                  label="garment delivery date"
                  displayFormat="dd MMM"
                  className="h-7 text-[11px] px-2"
                />
              </div>
            ) : editability.readOnlyReason ? (
              <span
                className="text-[10px] text-muted-foreground font-semibold flex items-center gap-0.5"
                title={editability.readOnlyReason}
              >
                <Lock className="w-3 h-3" />
              </span>
            ) : null}
            <Link
              to="/assigned/garment/$garmentId"
              params={{ garmentId: garment.id }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-card text-xs font-semibold text-primary hover:bg-muted/50 transition-colors whitespace-nowrap"
              title="Open garment details"
            >
              Details
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Pipeline — hidden for discarded garments (dead, no pipeline state) */}
      {!isDiscarded && garment.production_plan && (
        <div className="mt-2">
          <ProductionPipeline
            currentStage={garment.piece_stage}
            compact
            hasSoaking={hasSoaking}
            reentryStage={isReturn ? reentryStage : undefined}
            qcFailCount={qcFailCount}
          />
          {contextMessage && (
            <p className={cn("text-xs font-semibold mt-1", contextMessage.cls)}>
              {contextMessage.text}
            </p>
          )}
        </div>
      )}

      {/* No plan yet (non-discarded) */}
      {!isDiscarded && !garment.production_plan && (
        <p className="mt-2 text-xs text-muted-foreground italic">
          {contextMessage ? contextMessage.text : "Not yet scheduled"}
        </p>
      )}

      {/* Worker summary — hidden for discarded (stale) */}
      {!isDiscarded &&
        garment.production_plan &&
        (() => {
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
              {!sharedPlan &&
                toShow.map((step) => {
                  const worker = history[step.key] ?? plan[step.key];
                  if (!worker) return null;
                  const isDone = currentStageOrder > step.stageOrder;
                  const isCurrent = currentStageOrder === step.stageOrder;
                  return (
                    <span
                      key={step.key}
                      className={cn(
                        "inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded",
                        isDone
                          ? "bg-emerald-50 text-emerald-700"
                          : isCurrent
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : "bg-zinc-50 text-muted-foreground",
                      )}
                    >
                      {isDone && <Check className="w-2.5 h-2.5" />}
                      <span className="font-medium">{step.label}:</span>
                      <span className="font-semibold">{worker}</span>
                    </span>
                  );
                })}
              {sharedPlan && diffs.length > 0 && (
                <>
                  <span className="text-xs text-amber-600 font-semibold">
                    Overrides:
                  </span>
                  {diffs.map((step) => (
                    <span
                      key={step.key}
                      className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200"
                    >
                      <span className="font-medium">{step.label}:</span>
                      <span className="font-semibold">{plan[step.key]}</span>
                    </span>
                  ))}
                </>
              )}
              {sharedPlan &&
                completed.length > 0 &&
                diffs.length === 0 &&
                completed.map((step) => (
                  <span
                    key={step.key}
                    className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700"
                  >
                    <Check className="w-2.5 h-2.5" />
                    <span className="font-medium">{step.label}:</span>
                    <span className="font-semibold">{history[step.key]}</span>
                  </span>
                ))}
            </div>
          );
        })()}

      {/* Compact trip history for returning garments — excludes current trip */}
      {isReturn && (
        <CompactTripHistory
          tripHistory={
            garment.trip_history as
              | TripHistoryEntry[]
              | string
              | null
              | undefined
          }
          currentTrip={tripNum}
        />
      )}

      {/* Plan dialog — ReturnPlanDialog for trip 2+ (matches scheduler), PlanDialog otherwise */}
      {canEdit && isReturn && (
        <ReturnPlanDialog
          open={planOpen}
          onOpenChange={setPlanOpen}
          onConfirm={handlePlanConfirm}
          garmentCount={1}
          defaultDate={garment.assigned_date ?? undefined}
          workerHistory={garment.worker_history as Record<string, string> | null}
          feedbackStatus={garment.feedback_status}
          tripNumber={garment.trip_number}
          feedbackNotes={garment.notes}
          garmentId={garment.id}
          tripHistory={garment.trip_history as TripHistoryEntry[] | string | null | undefined}
          title={`Edit Plan — ${garment.garment_id}`}
          lockedSteps={editability.lockedPlanSteps}
        />
      )}
      {canEdit && !isReturn && (
        <PlanDialog
          open={planOpen}
          onOpenChange={setPlanOpen}
          onConfirm={handlePlanConfirm}
          garmentCount={1}
          defaultDate={garment.assigned_date ?? undefined}
          defaultPlan={
            (garment.production_plan ?? sharedPlan) as Record<
              string,
              string
            > | null
          }
          title={`Edit Plan — ${garment.garment_id}`}
          confirmLabel="Save Changes"
          hasSoaking={hasSoaking}
          showDeliveryDate
          defaultDeliveryDate={
            garment.delivery_date ? String(garment.delivery_date) : undefined
          }
          lockedSteps={editability.lockedPlanSteps}
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
  sewer: "Sewing Unit",
  finisher: "Finisher",
  ironer: "Ironer",
  quality_checker: "QC",
};

// Worker-key order aligned with PLAN_STEPS / STAGE_ORDER.
const WORKER_KEYS_ORDERED = [
  "soaker",
  "cutter",
  "post_cutter",
  "sewer",
  "finisher",
  "ironer",
  "quality_checker",
] as const;

// Map reentry piece_stage → starting worker key for that trip.
const REENTRY_TO_WORKER: Record<string, string> = {
  waiting_cut: "soaker",
  soaking: "soaker",
  cutting: "cutter",
  post_cutting: "post_cutter",
  sewing: "sewer",
  finishing: "finisher",
  ironing: "ironer",
  quality_check: "quality_checker",
};

/**
 * Trip entries store the garment's *cumulative* worker_history, not just the
 * stages touched on that trip. Alterations normally start mid-pipeline
 * (reentry_stage), so filter the display to stages from that point onward.
 */
function filterWorkersForTrip(
  workers: Record<string, string>,
  reentryStage: string | null | undefined,
  trip: number,
): [string, string][] {
  const startKey = reentryStage ? REENTRY_TO_WORKER[reentryStage] : null;
  const startIdx =
    trip > 1 && startKey ? WORKER_KEYS_ORDERED.indexOf(startKey as never) : 0;
  return WORKER_KEYS_ORDERED.slice(Math.max(0, startIdx))
    .filter((k) => workers[k])
    .map((k) => [k, workers[k]]);
}

function CompactTripHistory({
  tripHistory: raw,
  currentTrip,
}: {
  tripHistory: TripHistoryEntry[] | string | null | undefined;
  currentTrip: number;
}) {
  const [open, setOpen] = useState(false);

  const allEntries: TripHistoryEntry[] = !raw
    ? []
    : typeof raw === "string"
      ? JSON.parse(raw)
      : Array.isArray(raw)
        ? raw
        : [];
  const entries = allEntries.filter((e) => e.trip < currentTrip);

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
        <ChevronDown
          className={cn(
            "w-3 h-3 ml-auto transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-250 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="mt-1.5 space-y-1.5 pb-0.5">
            {entries.map((entry, i) => (
              <div key={i} className="bg-muted/40 rounded-md px-2 py-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={cn(
                      "font-bold uppercase px-1.5 py-0.5 rounded",
                      entry.trip === 1
                        ? "bg-blue-100 text-blue-700"
                        : entry.trip === 2
                          ? "bg-amber-100 text-amber-700"
                          : "bg-orange-100 text-orange-700",
                    )}
                  >
                    {entry.trip === 1
                      ? "Original"
                      : entry.trip === 2
                        ? "Return"
                        : `Alt ${entry.trip - 2}`}
                  </span>
                  {entry.assigned_date && (
                    <span className="text-muted-foreground">
                      {formatDate(entry.assigned_date)}
                      {entry.completed_date && (
                        <span> → {formatDate(entry.completed_date)}</span>
                      )}
                    </span>
                  )}
                </div>
                {(() => {
                  const workers = entry.worker_history
                    ? filterWorkersForTrip(
                        entry.worker_history,
                        entry.reentry_stage,
                        entry.trip,
                      )
                    : [];
                  if (workers.length === 0) return null;
                  return (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {workers.map(([key, name]) => (
                        <span
                          key={key}
                          className="inline-flex items-center gap-0.5 text-[11px] bg-background px-1.5 py-0.5 rounded"
                        >
                          <span className="text-muted-foreground">
                            {WORKER_LABELS[key] ?? key}:
                          </span>
                          <span className="font-semibold">{name}</span>
                        </span>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
