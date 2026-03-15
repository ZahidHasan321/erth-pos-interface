import { useState } from "react";
import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useAssignedViewGarments } from "@/hooks/useWorkshopGarments";
import {
  useUpdateGarmentDetails,
  useUpdateOrderDeliveryDate,
  useUpdateOrderAssignedDate,
} from "@/hooks/useGarmentMutations";
import { PlanDialog } from "@/components/shared/PlanDialog";
import { ProductionPipeline } from "@/components/shared/ProductionPipeline";
import { StageBadge, BrandBadge, ExpressBadge, TrialBadge, AlterationInBadge } from "@/components/shared/StageBadge";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  Clock,
  Package,
  Home,
  Timer,
  Edit3,
  Phone,
} from "lucide-react";
import type { WorkshopGarment } from "@repo/database";

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
  needs_repair: 2,
  needs_redo: 1,
};

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
  const { data: all = [], isLoading } = useAssignedViewGarments();
  const updateMut = useUpdateGarmentDetails();
  const deliveryDateMut = useUpdateOrderDeliveryDate();
  const assignedDateMut = useUpdateOrderAssignedDate();

  // Show ALL garments for this order — regardless of location or stage
  const garments = all.filter((g) => g.order_id === orderIdNum);

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
        <div className="text-center py-24 border-2 border-dashed rounded-2xl">
          <p className="text-lg font-semibold text-muted-foreground">
            No garments found for this order
          </p>
        </div>
      </div>
    );
  }

  // Compute shared plan: the plan that most planned garments share
  const plannedGarments = garments.filter((g) => g.production_plan);
  const sharedPlan = (() => {
    if (plannedGarments.length === 0) return null;
    // Use first planned garment's plan as reference
    const ref = (plannedGarments[0].production_plan ?? {}) as Record<string, string>;
    // Check if all planned garments match
    const allSame = plannedGarments.every((g) => {
      const p = (g.production_plan ?? {}) as Record<string, string>;
      return PLAN_STEPS.every((s) => (p[s.key] ?? "") === (ref[s.key] ?? ""));
    });
    return allSame ? ref : null;
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
      <OrderHeader
        garments={garments}
        orderId={orderIdNum}
        deliveryDateMut={deliveryDateMut}
        assignedDateMut={assignedDateMut}
      />

      {/* Shared production plan at order level */}
      {sharedPlan && (
        <SharedPlanSection
          plan={sharedPlan}
          date={sharedDate ?? undefined}
          garments={plannedGarments}
          updateMut={updateMut}
        />
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
                  <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md text-[10px]">Brova</span>
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
                  <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md text-[10px]">Final</span>
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
  deliveryDateMut,
  assignedDateMut,
}: {
  garments: WorkshopGarment[];
  orderId: number;
  deliveryDateMut: ReturnType<typeof useUpdateOrderDeliveryDate>;
  assignedDateMut: ReturnType<typeof useUpdateOrderAssignedDate>;
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
    (g) => g.location === "shop" && (g.piece_stage === "needs_repair" || g.piece_stage === "needs_redo"),
  );
  const brovasAtShop = brovas.filter((g) => g.location === "shop");
  const maxTrip = Math.max(...garments.map((g) => g.trip_number ?? 1));
  const urgency = getDeliveryUrgency(first.delivery_date_order);

  const statusLabel = (() => {
    if (garments.every((g) => g.piece_stage === "completed" || g.location === "shop"))
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

  const handleDeliveryChange = async (d: Date | null) => {
    if (!d) return;
    const date = d.toISOString().slice(0, 10);
    await deliveryDateMut.mutateAsync({ orderId, date });
    toast.success("Delivery date updated");
  };

  const handleAssignedChange = async (d: Date | null) => {
    if (!d) return;
    const date = d.toISOString().slice(0, 10);
    await assignedDateMut.mutateAsync({ orderId, date });
    toast.success("Assigned date updated");
  };

  return (
    <div className="bg-white border rounded-xl p-4 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        {/* Left — order info */}
        <div className="min-w-0">
          {/* Top row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-black text-lg">#{orderId}</span>
            <span className="font-semibold text-sm">{first.customer_name ?? "—"}</span>
            {brands.map((b) => <BrandBadge key={b} brand={b} />)}
            {hasExpress && <ExpressBadge />}
            {first.home_delivery_order && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 border border-indigo-200">
                <Home className="w-3 h-3" /> Delivery
              </span>
            )}
            <span className={cn("text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md", statusLabel.cls)}>
              {statusLabel.text}
            </span>
          </div>

          {/* Info row */}
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

        {/* Right — dates */}
        <div className="flex flex-col gap-2 p-3 bg-muted/30 rounded-lg border shrink-0 sm:w-52">
          <div className="space-y-1">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" /> Delivery
              {daysLabel && (
                <span className={cn("text-[10px] font-bold ml-0.5", urgency.className)}>
                  ({daysLabel})
                </span>
              )}
            </Label>
            <DatePicker
              value={first.delivery_date_order ?? ""}
              onChange={handleDeliveryChange}
              className={cn("h-8 text-sm font-semibold", urgency.className)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Timer className="w-3 h-3" /> Assigned (all)
            </Label>
            <DatePicker
              value={first.assigned_date ?? ""}
              onChange={handleAssignedChange}
              className="h-8 text-sm font-semibold"
            />
          </div>
        </div>
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
    toast.success(`Updated plan for ${garments.length} garment${garments.length !== 1 ? "s" : ""}`);
  };

  return (
    <div className="mt-3 bg-white border rounded-xl p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Production Plan
        </h3>
        <button
          onClick={() => setPlanOpen(true)}
          className="text-xs text-primary hover:underline cursor-pointer font-medium"
        >
          Edit plan for all
        </button>
      </div>

      {/* Date row */}
      {date && (
        <div className="flex items-center gap-1 mb-2 text-sm text-muted-foreground">
          <Timer className="w-3.5 h-3.5" />
          Assigned: <span className="font-semibold text-foreground">{formatDate(date)}</span>
        </div>
      )}

      {/* Worker pills */}
      <div className="flex flex-wrap gap-1.5">
        {visibleSteps.map((step) => {
          const worker = plan[step.key];
          if (!worker) return null;
          return (
            <span
              key={step.key}
              className="inline-flex items-center gap-1 text-[11px] bg-zinc-100 text-zinc-700 px-2 py-1 rounded-md"
            >
              <span className="text-muted-foreground">{step.label}:</span>
              <span className="font-semibold">{worker}</span>
            </span>
          );
        })}
      </div>

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
    (garment.piece_stage === "needs_repair" || garment.piece_stage === "needs_redo");
  // Alteration (In) only for trip 3+ (went back twice already)
  const isAlterationIn = needsRepairAtShop && tripNum >= 3;
  const isBrovaReturn = needsRepairAtShop && tripNum === 2;
  const isAtShopPostProduction =
    garment.location === "shop" && !needsRepairAtShop;

  const [planOpen, setPlanOpen] = useState(false);

  const visibleSteps = PLAN_STEPS.filter(
    (s) => s.key !== "soaker" || hasSoaking,
  );

  const handlePlanConfirm = async (
    newPlan: Record<string, string>,
    date: string,
  ) => {
    await updateMut.mutateAsync({
      id: garment.id,
      updates: {
        assigned_date: date || null,
        production_plan: newPlan,
      },
    });
    toast.success(`${garment.garment_id ?? "Garment"} updated`);
  };

  const handleGarmentDeliveryChange = async (d: Date | null) => {
    if (!d) return;
    const date = d.toISOString().slice(0, 10);
    await updateMut.mutateAsync({
      id: garment.id,
      updates: { delivery_date: date },
    });
    toast.success(`${garment.garment_id ?? "Garment"} delivery date updated`);
  };

  const handleGarmentAssignedChange = async (d: Date | null) => {
    if (!d) return;
    const date = d.toISOString().slice(0, 10);
    await updateMut.mutateAsync({
      id: garment.id,
      updates: { assigned_date: date },
    });
    toast.success(`${garment.garment_id ?? "Garment"} assigned date updated`);
  };

  return (
    <div className={cn(
      "bg-white border rounded-xl p-3 shadow-sm",
      garment.express && "border-orange-200",
    )}>
      {/* Garment header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span
            className={cn(
              "text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border",
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
            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500 text-white">
              Brova Return
            </span>
          )}
          <StageBadge stage={garment.piece_stage} />
          <span className={cn(
            "text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded",
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

        <button
          onClick={() => setPlanOpen(true)}
          className="p-1 rounded hover:bg-muted cursor-pointer transition-colors shrink-0"
          title="Edit production plan"
        >
          <Edit3 className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Pipeline */}
      {garment.production_plan && (
        <div className="mt-2">
          <ProductionPipeline currentStage={garment.piece_stage} compact hasSoaking={hasSoaking} />
          {isAtShopPostProduction && (
            <p className="text-[10px] text-green-700 font-semibold mt-1">
              Production complete — at shop
            </p>
          )}
          {isAlterationIn && (
            <p className="text-[10px] text-orange-700 font-semibold mt-1">
              Needs to return for alteration
            </p>
          )}
          {isBrovaReturn && (
            <p className="text-[10px] text-amber-700 font-semibold mt-1">
              Brova return — needs changes
            </p>
          )}
          {needsRepairAtShop && tripNum === 1 && (
            <p className="text-[10px] text-amber-700 font-semibold mt-1">
              Needs changes after 1st trial
            </p>
          )}
        </div>
      )}

      {/* No plan yet */}
      {!garment.production_plan && (
        <p className="mt-2 text-xs text-muted-foreground italic">
          {garment.piece_stage === "waiting_for_acceptance"
            ? "Waiting for brova acceptance before production"
            : isAlterationIn
              ? "Needs to return for alteration — awaiting scheduling"
              : isBrovaReturn
                ? "Brova return — awaiting scheduling"
                : needsRepairAtShop
                  ? "Needs changes — awaiting scheduling"
                  : "Not yet scheduled"}
        </p>
      )}

      {/* Per-garment dates */}
      <div className="grid grid-cols-2 gap-2 mt-2 max-w-xs lg:ml-auto">
        <div className="space-y-0.5">
          <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-0.5">
            <Clock className="w-3 h-3" /> Delivery
          </Label>
          <DatePicker
            value={garment.delivery_date ?? ""}
            onChange={handleGarmentDeliveryChange}
            className="h-7 text-xs font-semibold"
          />
        </div>
        <div className="space-y-0.5">
          <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-0.5">
            <Timer className="w-3 h-3" /> Assigned
          </Label>
          <DatePicker
            value={garment.assigned_date ?? ""}
            onChange={handleGarmentAssignedChange}
            className="h-7 text-xs font-semibold"
          />
        </div>
      </div>

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
                  "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded",
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
                <span className="text-[10px] text-amber-600 font-semibold">Overrides:</span>
                {diffs.map((step) => (
                  <span key={step.key} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                    <span className="font-medium">{step.label}:</span>
                    <span className="font-semibold">{plan[step.key]}</span>
                  </span>
                ))}
              </>
            )}
            {sharedPlan && completed.length > 0 && diffs.length === 0 && completed.map((step) => (
              <span key={step.key} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                <Check className="w-2.5 h-2.5" />
                <span className="font-medium">{step.label}:</span>
                <span className="font-semibold">{history[step.key]}</span>
              </span>
            ))}
          </div>
        );
      })()}

      {/* PlanDialog for editing */}
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
      />
    </div>
  );
}
