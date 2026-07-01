import { useState } from "react";
import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useOrderGarments } from "@/hooks/useWorkshopGarments";
import { useUpdateGarmentDetails } from "@/hooks/useGarmentMutations";
import { ProductionPlanDialog } from "@/components/shared/ProductionPlanDialog";
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
import { cn, formatDate, toLocalDateStr, parseUtcTimestamp } from "@/lib/utils";
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

// Soaking is intentionally not in the plan — no per-worker (or per-unit)
// assignment is made; any user in the soaking group can pick up any garment.
const PLAN_STEPS = [
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

// Map current piece_stage → worker_key responsible for that stage. Used to
// surface "who's on it right now" as the headline fact in each card.
const STAGE_TO_WORKER_KEY: Record<string, string> = {
  soaking: "soaker",
  cutting: "cutter",
  post_cutting: "post_cutter",
  sewing: "sewer",
  finishing: "finisher",
  ironing: "ironer",
  quality_check: "quality_checker",
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
  // 3 levels — bad / warn / neutral. The old "yellow band" at ≤5d wasn't
  // actionable; staff act on overdue or imminent (≤2d) only.
  if (diff < 0)  return { className: "text-[var(--status-bad)]",  days: diff };
  if (diff <= 2) return { className: "text-[var(--status-warn)]", days: diff };
  return { className: "text-muted-foreground", days: diff };
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
        <Skeleton className="h-8 w-48 rounded-md" />
        <Skeleton className="h-28 rounded-md" />
        <Skeleton className="h-56 rounded-md" />
      </div>
    );
  }

  if (garments.length === 0) {
    return (
      <div className="p-4">
        <button
          onClick={() => router.history.back()}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Production Tracker
        </button>
        <div className="text-center py-10 border border-dashed border-border rounded-md bg-card">
          <p className="text-base text-muted-foreground">
            No garments found for this order
          </p>
        </div>
      </div>
    );
  }

  // Compute shared plan: the plan that most planned garments share.
  const plannedGarments = garments.filter((g) => g.production_plan);
  const sharedPlan = (() => {
    if (plannedGarments.length === 0) return null;
    const ref = (plannedGarments[0].production_plan ?? {}) as Record<
      string,
      string
    >;
    const allSame = plannedGarments.every((g) => {
      const p = (g.production_plan ?? {}) as Record<string, string>;
      return PLAN_STEPS.every((s) => (p[s.key] ?? "") === (ref[s.key] ?? ""));
    });
    if (!allSame) return null;
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
        <div className="mt-3 bg-[var(--status-warn-bg)] border border-transparent rounded-md px-3 py-2">
          <p className="text-sm font-medium text-[var(--status-warn)]">
            Garments have different worker assignments. Edit individually below
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
                <h3 className="text-base font-medium text-foreground flex items-center gap-2">
                  Brova
                  <span className="text-sm font-normal text-muted-foreground">
                    {brovas.length} garment{brovas.length !== 1 ? "s" : ""}
                  </span>
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
                <h3 className="text-base font-medium text-foreground flex items-center gap-2">
                  Final
                  <span className="text-sm font-normal text-muted-foreground">
                    {finals.length} garment{finals.length !== 1 ? "s" : ""}
                  </span>
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

  // §2.8 "Finals waiting on replacement brova": finals correctly stay parked
  // while a discarded brova's in-flight replacement brova exists (distinct from
  // §2.6's last-brova-gone auto-release). Computed from the order's own garments
  // (getOrderGarments returns all rows incl. discarded + replacements). The
  // replacement is in flight when it is neither completed nor discarded.
  const garmentById = new Map(garments.map((g) => [g.id, g]));
  const finalsWaitingOnReplacementBrova =
    waitingAcceptance.some((g) => g.garment_type === "final") &&
    brovas.some((b) => {
      if (b.piece_stage !== "discarded" || !b.replaced_by_garment_id) return false;
      const replacement = garmentById.get(b.replaced_by_garment_id);
      // Replacement may live outside the fetched set; absence ⇒ assume in flight.
      return (
        !replacement ||
        (replacement.piece_stage !== "completed" &&
          replacement.piece_stage !== "discarded")
      );
    });

  // Map every order-level state to ok/warn/info/neutral via tokens. Color =
  // urgency, not state-variety. The label text differentiates between similar
  // hues.
  const okCls   = "bg-[var(--status-ok-bg)] text-[var(--status-ok)]";
  const warnCls = "bg-[var(--status-warn-bg)] text-[var(--status-warn)]";
  const infoCls = "bg-[var(--status-info-bg)] text-[var(--status-info)]";
  const mutedCls = "bg-muted text-foreground";

  const statusLabel = (() => {
    if (
      first.order_phase === "completed" ||
      garments.every((g) => g.piece_stage === "completed")
    )
      return { text: "Completed", cls: okCls };
    if (readyDispatch.length === garments.length)
      return { text: "Ready for dispatch", cls: okCls };
    // At shop needing fix: pending return to workshop. "(In)" is reserved for
    // garments actively being fixed in production.
    if (needsRepairAtShop.length > 0) {
      const nextAlt = Math.max(...needsRepairAtShop.map((g) => g.trip_number ?? 1));
      return { text: `Pending return: Alt ${nextAlt}`, cls: warnCls };
    }
    if (
      brovas.length > 0 &&
      brovasAtShop.length === brovas.length &&
      finals.length === 0
    )
      return { text: `At shop: Trial ${maxTrip}`, cls: warnCls };
    if (
      waitingAcceptance.length > 0 &&
      inProd.length === 0 &&
      atShop.length > 0
    ) {
      if (brovas.length > 0 && anyBrovaAccepted)
        return { text: "Awaiting finals release", cls: warnCls };
      return { text: "Awaiting brova trial", cls: warnCls };
    }
    // §2.8 priority: between "Awaiting brova trial" and "Finals in production".
    if (finalsWaitingOnReplacementBrova)
      return { text: "Finals waiting on replacement brova", cls: warnCls };
    if (brovas.length > 0 && finals.length === 0)
      return {
        text: maxAltNumber !== null
          ? `Alt ${maxAltNumber} in production`
          : "Brova in production",
        cls: infoCls,
      };
    if (
      brovas.length === 0 &&
      finals.length > 0 &&
      waitingAcceptance.length > 0
    )
      return { text: "Finals pending release", cls: warnCls };
    if (inProd.length > 0)
      return { text: "In production", cls: infoCls };
    return { text: "In progress", cls: mutedCls };
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
    <div className="bg-card border border-border rounded-md p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-lg">#{orderId}</span>
            <span className="font-medium text-base tracking-tight">
              {first.customer_name ?? "-"}
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
                "text-xs font-medium px-2 py-0.5 rounded-md",
                statusLabel.cls,
              )}
            >
              {statusLabel.text}
            </span>
          </div>

          <div className="flex items-center flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
            {first.invoice_number && <span className="font-mono">INV-{first.invoice_number}</span>}
            <span className="flex items-center gap-1">
              <Package className="w-3.5 h-3.5" /> {summary}
            </span>
            {first.customer_mobile && (
              <span className="flex items-center gap-1 font-mono">
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

        {/* Order-level delivery date — editable (cascades to shared garments).
            Color only the days-left number, not the whole row. */}
        <OrderDeliveryDateEditor
          orderId={orderId}
          value={first.delivery_date_order ?? null}
          daysLabel={daysLabel}
          daysLabelClassName={urgency.className}
        />
      </div>

      {/* Order-level note ("special instructions") entered by the shop on the
          order-summary form. Distinct from per-garment / measurement notes. */}
      {first.order_notes && (
        <div className="mt-3 bg-[var(--status-warn-bg)] border border-border rounded-md p-3 space-y-1">
          <h4 className="text-sm font-medium text-[var(--status-warn)]">Order note</h4>
          <p className="text-base text-foreground whitespace-pre-wrap">{first.order_notes}</p>
        </div>
      )}
    </div>
  );
}

function OrderDeliveryDateEditor({
  orderId,
  value,
  daysLabel,
  daysLabelClassName,
}: {
  orderId: number;
  value: string | null;
  daysLabel: string | null;
  daysLabelClassName: string;
}) {
  const mut = useUpdateOrderDeliveryDate();
  return (
    <div className="shrink-0 text-right space-y-1">
      <Label className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
        <Clock className="w-3 h-3" /> Delivery date
      </Label>
      <ConfirmedDatePicker
        value={value}
        onConfirm={async (d) => {
          const ds = toLocalDateStr(d);
          if (!ds) return;
          await mut.mutateAsync({ orderId, date: ds });
        }}
        label="order delivery date"
        extraDescription="Garments sharing this date will also be updated; garments with custom dates (e.g. express) stay unchanged."
        className="h-8 text-sm font-medium bg-transparent border-0"
        displayFormat="PPP"
      />
      {daysLabel && (
        <p className={cn("text-sm font-medium", daysLabelClassName)}>{daysLabel}</p>
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

  const visibleSteps = PLAN_STEPS;

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
        `Updated ${editableGarments.length} garment${editableGarments.length !== 1 ? "s" : ""}, ${skippedCount} in production skipped`,
      );
    }
  };

  return (
    <div className="mt-3 bg-card border border-border rounded-md p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-muted-foreground">
          {planLabel}
        </h3>
        {anyCanEdit ? (
          <button
            onClick={() => setPlanOpen(true)}
            className="text-sm text-foreground hover:text-primary cursor-pointer font-medium"
          >
            {skippedCount > 0
              ? `Edit plan for ${editableGarments.length} of ${garments.length}`
              : "Edit plan for all"}
          </button>
        ) : anyStarted ? (
          <span className="text-sm text-muted-foreground flex items-center gap-1">
            <Play className="w-3 h-3" /> In progress
          </span>
        ) : null}
      </div>

      {/* Worker pills — all neutral. Worker name is the signal; role is the label. */}
      <div className="flex flex-wrap gap-1.5">
        {visibleSteps.map((step) => {
          const worker = plan[step.key];
          if (!worker) return null;
          return (
            <span
              key={step.key}
              className="inline-flex items-center gap-1 text-sm bg-muted px-2 py-0.5 rounded-md"
            >
              <span className="text-muted-foreground">{step.label}:</span>
              <span className="font-medium text-foreground">{worker}</span>
            </span>
          );
        })}
      </div>

      {anyCanEdit && (
        <ProductionPlanDialog
          mode="new"
          open={planOpen}
          onOpenChange={setPlanOpen}
          onConfirm={handlePlanConfirm}
          garmentCount={editableGarments.length}
          defaultDate={date}
          defaultPlan={plan}
          title={`Edit ${planLabel}`}
          confirmLabel={skippedCount > 0 ? `Save for ${editableGarments.length}` : "Save for All"}
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

  const visibleSteps = PLAN_STEPS;

  // Context message — muted text below the pipeline. The stage badge already
  // says WHAT stage; this adds one line of WHY-it-matters (action prompt or
  // state nuance). Color only when it's a true urgency cue (overdue-ish).
  const contextMessage = (() => {
    const altN = getAlterationNumber(tripNum);
    const altPrefix = altN !== null ? `Alt ${altN}: ` : "";
    if (garment.piece_stage === "discarded")
      return { text: "Discarded (redo)", cls: "text-[var(--status-bad)]" };
    if (garment.piece_stage === "completed")
      return { text: "Completed", cls: "text-muted-foreground" };
    if (garment.piece_stage === "ready_for_dispatch")
      return { text: `${altPrefix}Production complete, ready for dispatch`, cls: "text-[var(--status-ok)]" };
    if (garment.location === "transit_to_shop")
      return { text: `${altPrefix}In transit to shop`, cls: "text-muted-foreground" };
    if (garment.location === "transit_to_workshop")
      return { text: `${altPrefix}In transit to workshop`, cls: "text-muted-foreground" };
    if (needsRepairAtShop) {
      const nextAlt = tripNum ?? 1;
      return { text: `Needs to return for Alt ${nextAlt}`, cls: "text-[var(--status-warn)]" };
    }
    if (garment.piece_stage === "awaiting_trial" && garment.location === "shop")
      return {
        text: altN !== null ? `At shop: Alt ${altN} trial` : "At shop: awaiting trial",
        cls: "text-[var(--status-warn)]",
      };
    if (garment.piece_stage === "ready_for_pickup")
      return { text: "Ready for pickup", cls: "text-[var(--status-ok)]" };
    if (isAtShopPostProduction) return null;
    if (garment.piece_stage === "waiting_for_acceptance") {
      if (anyBrovaAccepted)
        return { text: "Customer approved, ready to release finals", cls: "text-[var(--status-ok)]" };
      return { text: "Parked: awaiting brova acceptance", cls: "text-muted-foreground" };
    }
    if (garment.location === "workshop" && hasStarted)
      return { text: `${altPrefix}In production`, cls: "text-muted-foreground" };
    if (garment.location === "workshop" && !hasStarted && garment.in_production)
      return { text: `${altPrefix}Scheduled, waiting to start`, cls: "text-muted-foreground" };
    if (garment.location === "workshop" && !hasStarted && !garment.in_production)
      return { text: `${altPrefix}Received, not yet started`, cls: "text-muted-foreground" };
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

  // Location — plain text. Metadata, not status.
  const locationLabel =
    garment.location === "shop"
      ? "at shop"
      : garment.location === "workshop"
        ? "at workshop"
        : garment.location === "transit_to_shop"
          ? "transit → shop"
          : garment.location === "transit_to_workshop"
            ? "transit → workshop"
            : garment.location;

  // Worker doing the current stage — headline fact when production is running.
  const currentWorkerKey = STAGE_TO_WORKER_KEY[garment.piece_stage ?? ""];
  const currentWorker = currentWorkerKey
    ? (history[currentWorkerKey] ?? plan[currentWorkerKey] ?? null)
    : null;

  // Days-left, single computation reused inline below.
  const deliveryDays = garment.delivery_date
    ? Math.ceil(
        (parseUtcTimestamp(garment.delivery_date).getTime() - Date.now()) /
          86400000,
      )
    : null;
  const isDone =
    garment.piece_stage === "completed" ||
    garment.piece_stage === "ready_for_pickup";
  const daysText =
    deliveryDays === null
      ? null
      : deliveryDays < 0
        ? `${Math.abs(deliveryDays)}d late`
        : deliveryDays === 0
          ? "due today"
          : `${deliveryDays}d left`;
  const daysCls =
    deliveryDays === null || isDone
      ? "text-muted-foreground"
      : deliveryDays < 0
        ? "text-[var(--status-bad)]"
        : deliveryDays <= 2
          ? "text-[var(--status-warn)]"
          : "text-muted-foreground";

  // Show the context line only when it's a true call-to-action (non-muted) or
  // when there's no current worker to anchor row 3. Drops noise like
  // "in production" / "scheduled — waiting to start" which the pipeline + days
  // already communicate.
  const showContext =
    contextMessage &&
    (contextMessage.cls !== "text-muted-foreground" || !currentWorker);

  return (
    <div
      className={cn(
        "bg-card border border-border rounded-md p-3",
        garment.piece_stage === "waiting_for_acceptance" &&
          !anyBrovaAccepted &&
          "opacity-60",
        isDiscarded && "border-l-2 border-l-[var(--status-bad)] opacity-70",
      )}
    >
      {/* Row 1: identity + actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-xs text-muted-foreground capitalize shrink-0">
            {garment.garment_type}
          </span>
          <Link
            to="/assigned/garment/$garmentId"
            params={{ garmentId: garment.id }}
            className="font-mono text-base text-foreground hover:text-primary hover:underline truncate"
          >
            {garment.garment_id ?? garment.id.slice(0, 8)}
          </Link>
          {garment.express && (
            <Zap
              className="w-4 h-4 text-[var(--status-bad)] fill-current shrink-0"
              aria-label="Express"
            />
          )}
          {garment.home_delivery_order && (
            <Home
              className="w-4 h-4 text-indigo-700 shrink-0"
              aria-label="Home delivery"
            />
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isDiscarded ? (
            replacedByGarmentId ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-xs font-medium text-muted-foreground whitespace-nowrap">
                Replacement created
              </span>
            ) : null
          ) : canEdit ? (
            <button
              onClick={() => setPlanOpen(true)}
              className="p-1.5 rounded-md hover:bg-muted cursor-pointer transition-colors"
              title="Edit production plan"
            >
              <Edit3 className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          ) : editability.canEditDeliveryDate ? (
            <div className="w-28" title="Change delivery date">
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
                className="h-7 text-xs px-2"
              />
            </div>
          ) : editability.readOnlyReason ? (
            <span
              className="text-xs text-muted-foreground flex items-center"
              title={editability.readOnlyReason}
            >
              <Lock className="w-3.5 h-3.5" />
            </span>
          ) : null}
          {!isDiscarded && (
            <Link
              to="/assigned/garment/$garmentId"
              params={{ garmentId: garment.id }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-card text-sm font-medium text-foreground hover:bg-muted hover:text-primary transition-colors whitespace-nowrap"
              title="Open garment details"
            >
              Details
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>

      {/* Row 2: status badges + days-left */}
      <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
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
        {daysText && (
          <span className={cn("text-sm font-medium tabular-nums shrink-0", daysCls)}>
            {daysText}
          </span>
        )}
      </div>

      {/* Row 3: current worker · location · (urgent context if any) */}
      <div className="mt-1 text-sm">
        {currentWorker ? (
          <>
            <span className="text-foreground font-medium">{currentWorker}</span>
            <span className="text-muted-foreground"> · {locationLabel}</span>
          </>
        ) : (
          <span className="text-muted-foreground">{locationLabel}</span>
        )}
        {showContext && contextMessage && (
          <span className={cn("ml-1.5", contextMessage.cls)}>
            · {contextMessage.text}
          </span>
        )}
      </div>

      {/* Pipeline — hidden for discarded (dead, no pipeline). Context line is
          already shown on Row 3 above when actionable; no need to repeat. */}
      {!isDiscarded && garment.production_plan && (
        <div className="mt-2.5">
          <ProductionPipeline
            currentStage={garment.piece_stage}
            compact
            hasSoaking={hasSoaking}
            reentryStage={isReturn ? reentryStage : undefined}
            qcFailCount={qcFailCount}
          />
        </div>
      )}

      {/* No plan yet — single muted line so the card stays compact */}
      {!isDiscarded && !garment.production_plan && (
        <p className="mt-2 text-sm text-muted-foreground italic">
          Not yet scheduled
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
            <div className="mt-2 flex flex-wrap gap-1.5 items-center">
              {!sharedPlan &&
                toShow.map((step) => {
                  const worker = history[step.key] ?? plan[step.key];
                  if (!worker) return null;
                  const isDone = currentStageOrder > step.stageOrder;
                  const isCurrent = currentStageOrder === step.stageOrder;
                  // All neutral. Done = check icon. Current = filled foreground dot.
                  // Pending = muted text. No colored backgrounds.
                  return (
                    <span
                      key={step.key}
                      className={cn(
                        "inline-flex items-center gap-1 text-sm px-1.5 py-0.5 rounded-md",
                        isCurrent
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {isDone ? (
                        <Check className="w-3 h-3 text-[var(--status-ok)]" />
                      ) : isCurrent ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-foreground" />
                      ) : null}
                      <span>{step.label}:</span>
                      <span className="font-medium text-foreground">{worker}</span>
                    </span>
                  );
                })}
              {sharedPlan && diffs.length > 0 && (
                <>
                  <span className="text-sm text-muted-foreground">
                    Overrides:
                  </span>
                  {diffs.map((step) => (
                    <span
                      key={step.key}
                      className="inline-flex items-center gap-1 text-sm px-1.5 py-0.5 rounded-md bg-[var(--status-warn-bg)] text-[var(--status-warn)]"
                    >
                      <span>{step.label}:</span>
                      <span className="font-medium">{plan[step.key]}</span>
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
                    className="inline-flex items-center gap-1 text-sm px-1.5 py-0.5 rounded-md text-muted-foreground"
                  >
                    <Check className="w-3 h-3 text-[var(--status-ok)]" />
                    <span>{step.label}:</span>
                    <span className="font-medium text-foreground">{history[step.key]}</span>
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

      {/* Trip 2+ uses rework mode (with feedback context), otherwise new mode. */}
      {canEdit && isReturn && (
        <ProductionPlanDialog
          mode="rework"
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
          title={`Edit Plan: ${garment.garment_id}`}
          lockedSteps={editability.lockedPlanSteps}
        />
      )}
      {canEdit && !isReturn && (
        <ProductionPlanDialog
          mode="new"
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
          title={`Edit Plan: ${garment.garment_id}`}
          confirmLabel="Save Changes"
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
    <div className="mt-2.5 border-t border-border pt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors w-full"
      >
        <History className="w-3.5 h-3.5" />
        <span className="font-medium">
          Previous {entries.length === 1 ? "trip" : `${entries.length} trips`}
        </span>
        <ChevronDown
          className={cn(
            "w-4 h-4 ml-auto transition-transform duration-200",
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
              <div key={i} className="bg-muted rounded-md px-2 py-1.5">
                <div className="flex items-center gap-2 text-sm">
                  {/* Trip number is metadata — neutral chip, mono number for scanning */}
                  <span className="font-medium font-mono px-1.5 py-0.5 rounded bg-card border border-border text-foreground">
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
                          className="inline-flex items-center gap-1 text-sm bg-card px-1.5 py-0.5 rounded"
                        >
                          <span className="text-muted-foreground">
                            {WORKER_LABELS[key] ?? key}:
                          </span>
                          <span className="font-medium">{name}</span>
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
