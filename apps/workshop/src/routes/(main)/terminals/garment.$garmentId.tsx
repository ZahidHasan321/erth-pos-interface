import { useState, useEffect } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useGarment } from "@/hooks/useWorkshopGarments";
import { getFeedbackByGarmentAndTrip } from "@/api/feedback";
import {
  buildAlterationFilter,
  buildAltOutFilter,
  getAltOutEffectiveMeasurement,
} from "@/lib/alteration-filter";
import {
  useCompleteAndAdvance,
  useStartGarment,
  useCancelStartGarment,
  useQcPass,
  useQcFail,
} from "@/hooks/useGarmentMutations";
import { WorkerDropdown } from "@/components/shared/WorkerDropdown";
import { WorkerHistoryChips, type PlanStep } from "@/components/shared/plan-dialog-shared";
import { HISTORY_KEY_MAP } from "@/components/shared/GarmentDetailSections";
import { DishdashaOverlay } from "@/components/shared/DishdashaOverlay";
import { TerminalQualityTemplatePrint } from "@/components/print/TerminalQualityTemplatePrint";
import { Skeleton } from "@repo/ui/skeleton";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  PIECE_STAGE_LABELS,
  PRODUCTION_STAGES,
  getNextPlanStage,
} from "@/lib/constants";
import { STYLE_IMAGE_MAP, ACCESSORY_ICONS } from "@/lib/style-images";
import {
  ArrowLeft,
  Play,
  Printer,
  Star,
  Check,
  X,
  AlertTriangle,
  RotateCcw,
  Loader2,
  Scissors,
  Ruler,
  Shirt,
} from "lucide-react";
import { IconNeedle, IconIroning1, IconStack2, IconSparkles } from "@tabler/icons-react";
import type {
  WorkshopGarment,
  PieceStage,
  ProductionPlan,
  TripHistoryEntry,
  QCFlag,
  Measurement,
} from "@repo/database";
import { isAlteration, getAlterationNumber } from "@repo/database";

export const Route = createFileRoute("/(main)/terminals/garment/$garmentId")({
  component: TerminalGarmentPage,
});

// ── Constants ──────────────────────────────────────────────────

const QC_CATEGORIES = [
  { key: "seam", label: "Seam" },
  { key: "ironing", label: "Ironing" },
  { key: "front_pocket", label: "Front Pocket" },
  { key: "collar", label: "Collar" },
  { key: "jabzour", label: "Jabzour" },
  { key: "hemming", label: "Hemming" },
];

/** Flat list of measurement fields the QC inspector can flag, grouped for the picker. */
const QC_MEASUREMENT_FIELDS: { group: string; fields: { key: keyof Measurement; label: string }[] }[] = [
  {
    group: "Collar & Shoulder",
    fields: [
      { key: "collar_width", label: "Collar Width" },
      { key: "collar_height", label: "Collar Height" },
      { key: "shoulder", label: "Shoulder" },
    ],
  },
  {
    group: "Chest",
    fields: [
      { key: "chest_full", label: "Chest Full" },
      { key: "chest_upper", label: "Chest Upper" },
      { key: "chest_front", label: "Chest Front" },
      { key: "chest_back", label: "Chest Back" },
    ],
  },
  {
    group: "Sleeve & Armhole",
    fields: [
      { key: "sleeve_length", label: "Sleeve Length" },
      { key: "sleeve_width", label: "Sleeve Width" },
      { key: "elbow", label: "Elbow" },
      { key: "armhole", label: "Armhole" },
      { key: "armhole_front", label: "Armhole Front" },
    ],
  },
  {
    group: "Waist & Length",
    fields: [
      { key: "waist_full", label: "Waist Full" },
      { key: "waist_front", label: "Waist Front" },
      { key: "waist_back", label: "Waist Back" },
      { key: "length_front", label: "Length Front" },
      { key: "length_back", label: "Length Back" },
      { key: "bottom", label: "Bottom" },
    ],
  },
  {
    group: "Pockets & Jabzour",
    fields: [
      { key: "top_pocket_length", label: "Top Pocket Length" },
      { key: "top_pocket_width", label: "Top Pocket Width" },
      { key: "side_pocket_length", label: "Side Pocket Length" },
      { key: "side_pocket_width", label: "Side Pocket Width" },
      { key: "jabzour_length", label: "Jabzour Length" },
      { key: "jabzour_width", label: "Jabzour Width" },
    ],
  },
];

const QC_MEASUREMENT_FIELD_LABELS: Record<string, string> = Object.fromEntries(
  QC_MEASUREMENT_FIELDS.flatMap((g) => g.fields.map((f) => [f.key as string, f.label])),
);

const FAIL_RETURN_STAGES: { value: PieceStage; historyKey: string; label: string; icon: React.ComponentType<{ className?: string }>; color: string; accent: string }[] = [
  { value: "cutting",      historyKey: "cutter",      label: "Cutting",      icon: Scissors,    color: "text-amber-600",   accent: "bg-amber-500" },
  { value: "post_cutting",  historyKey: "post_cutter", label: "Post-Cutting",  icon: IconStack2,  color: "text-orange-600",  accent: "bg-orange-500" },
  { value: "sewing",        historyKey: "sewer",       label: "Sewing",        icon: IconNeedle,  color: "text-purple-600",  accent: "bg-purple-500" },
  { value: "finishing",      historyKey: "finisher",    label: "Finishing",      icon: IconSparkles, color: "text-emerald-600", accent: "bg-emerald-500" },
  { value: "ironing",        historyKey: "ironer",      label: "Ironing",        icon: IconIroning1, color: "text-red-600",     accent: "bg-red-500" },
];

/** Steps for WorkerHistoryChips display in QC fail mode */
const WORKER_HISTORY_STEPS: (PlanStep & { historyKey: string })[] = [
  { key: "cutter",      historyKey: "cutting",      label: "Cut",      responsibility: "cutting",      icon: Scissors,     color: "text-amber-600",   accent: "bg-amber-500" },
  { key: "post_cutter", historyKey: "post_cutting",  label: "Post-Cut",  responsibility: "post_cutting",  icon: IconStack2,   color: "text-orange-600",  accent: "bg-orange-500" },
  { key: "sewer",       historyKey: "sewing",        label: "Sew",       responsibility: "sewing",        icon: IconNeedle,   color: "text-purple-600",  accent: "bg-purple-500" },
  { key: "finisher",    historyKey: "finishing",      label: "Finish",    responsibility: "finishing",     icon: IconSparkles,  color: "text-emerald-600", accent: "bg-emerald-500" },
  { key: "ironer",      historyKey: "ironing",        label: "Iron",      responsibility: "ironing",       icon: IconIroning1,  color: "text-red-600",     accent: "bg-red-500" },
];

// ── Star Rating ────────────────────────────────────────────────

function StarRating({
  value,
  onChange,
}: {
  value: number;
  onChange?: (v: number) => void;
}) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange?.(n)}
          disabled={!onChange}
          className={`text-2xl transition-all ${n <= value ? "text-amber-500" : "text-zinc-300"} ${onChange ? "hover:scale-110" : ""}`}
        >
          <Star className={`w-7 h-7 ${n <= value ? "fill-amber-500" : ""}`} />
        </button>
      ))}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────

function TerminalGarmentPage() {
  const { garmentId } = Route.useParams();
  const { data: garment, isLoading } = useGarment(garmentId);
  const router = useRouter();

  useEffect(() => {
    return () => {
      document.body.classList.remove("terminal-printing");
    };
  }, []);

  const currentTrip = garment?.trip_number ?? 1;
  const isAltOut = garment?.garment_type === "alteration";
  const isAltIn = garment ? isAlteration(currentTrip, garment.garment_type) && !isAltOut : false;
  const priorTrip = isAltIn ? currentTrip - 1 : 0;
  const { data: priorFeedback, isLoading: priorFeedbackLoading } = useQuery({
    queryKey: ["garment-feedback", garment?.id, priorTrip],
    queryFn: () => getFeedbackByGarmentAndTrip(garment!.id, priorTrip),
    enabled: !!garment && isAltIn && priorTrip >= 1,
    staleTime: 60_000,
  });

  if (isLoading || priorFeedbackLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (!garment) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto text-center py-24">
        <p className="text-lg font-semibold text-muted-foreground">
          Garment not found
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.history.back()}
        >
          Go Back
        </Button>
      </div>
    );
  }

  const stage = garment.piece_stage ?? "";
  const stageLabel =
    PIECE_STAGE_LABELS[stage as keyof typeof PIECE_STAGE_LABELS] ?? stage;
  const isQC = stage === "quality_check";
  const isProductionStage = PRODUCTION_STAGES.includes(stage as any);

  // Repair detection — unified: any trip >= 2 is alteration; QC fail this trip is alt_p.
  const tripHistory = garment.trip_history as TripHistoryEntry[] | null;
  const tripEntry = tripHistory?.find((t) => t.trip === currentTrip);
  const hasQcFail = !!tripEntry?.qc_attempts?.some((a) => a.result === "fail");
  const lastQcFail = tripEntry?.qc_attempts?.filter((a) => a.result === "fail").at(-1);
  const altNum = getAlterationNumber(currentTrip, garment.garment_type);
  const isRepair = hasQcFail || isAltIn || isAltOut;

  const altOutHasBaseline = isAltOut
    && (!!garment.full_measurement_set || !!garment.original_garment_measurement);
  const alterationFilter = isAltIn
    ? buildAlterationFilter(priorFeedback)
    : isAltOut
      ? buildAltOutFilter(garment, altOutHasBaseline)
      : null;
  const effectiveMeasurement = isAltOut
    ? getAltOutEffectiveMeasurement(garment)
    : garment.measurement;

  const handlePrint = () => {
    const className = "terminal-printing";

    const cleanup = () => {
      document.body.classList.remove(className);
      window.removeEventListener("afterprint", cleanup);
    };

    document.body.classList.add(className);
    window.addEventListener("afterprint", cleanup);
    window.setTimeout(cleanup, 2000);

    window.print();
  };

  return (
    <div className="p-3 sm:p-4 max-w-7xl mx-auto pb-8">
      <div className="terminal-screen-content">
        <div className="mb-3 flex items-center justify-between gap-2">
          <button
            onClick={() => router.history.back()}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to {stageLabel}
          </button>

          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-1.5" />
            Print
          </Button>
        </div>

        {isRepair && (
          <div className={cn(
            "mb-3 flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5",
            hasQcFail
              ? "bg-red-50 border-red-200 text-red-800"
              : isAltOut
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-orange-50 border-orange-200 text-orange-800",
          )}>
            {hasQcFail ? (
              <AlertTriangle className="w-5 h-5 shrink-0" />
            ) : (
              <RotateCcw className="w-5 h-5 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-bold">
                {hasQcFail
                  ? "QC Fix (alt_p)"
                  : isAltOut
                    ? `Alteration Out${altNum && altNum >= 1 ? ` ${altNum}` : ""}`
                    : `Alteration ${altNum}`}
                {isAltOut && (
                  <span className="font-normal">
                    {" "}— customer-brought garment, only flagged cells need work
                  </span>
                )}
              </p>
              {hasQcFail && lastQcFail?.fail_reason && (
                <p className="text-xs mt-0.5 opacity-80">Reason: {lastQcFail.fail_reason}</p>
              )}
            </div>
          </div>
        )}

        {(isAltIn || isAltOut) && alterationFilter && alterationFilter.fieldReasons.size > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs">
            <span className="font-semibold text-zinc-700">Cell colors:</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm border-2 border-emerald-500 bg-emerald-100" />
              Customer Request
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm border-2 border-red-500 bg-red-100" />
              Workshop Error
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm border-2 border-zinc-500 bg-zinc-200" />
              Shop Error
            </span>
          </div>
        )}

        <DishdashaOverlay
          garment={garment}
          measurement={effectiveMeasurement}
          alterationFilter={alterationFilter}
          notes={garment.notes}
        />

        <div className="mt-4">
          {isQC ? (
            <QCActions garment={garment} measurement={effectiveMeasurement} />
          ) : isProductionStage ? (
            <TerminalActions garment={garment} />
          ) : null}
        </div>
      </div>

      <div className="terminal-print-only hidden" aria-hidden="true">
        <TerminalQualityTemplatePrint
          garment={garment}
          alterationFilter={alterationFilter}
          measurement={effectiveMeasurement}
        />
      </div>
    </div>
  );
}

// ── Elapsed Timer ───────────────────────────────────────────────

function ElapsedTimer({ since }: { since: string | Date }) {
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const ms = Date.now() - new Date(since).getTime();
  const mins = Math.floor(ms / 60_000);
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;

  const display =
    hrs > 0 ? `${hrs}h ${remainMins}m` : mins > 0 ? `${mins}m` : "just now";

  return (
    <span className="text-xs font-mono text-emerald-600 tabular-nums">
      {display}
    </span>
  );
}

// ── Terminal Actions (floating buttons) ─────────────────────────

function TerminalActions({ garment }: { garment: WorkshopGarment }) {
  const router = useRouter();
  const startMut = useStartGarment();
  const cancelMut = useCancelStartGarment();
  const completeMut = useCompleteAndAdvance();

  const stage = garment.piece_stage ?? "";
  const plan = garment.production_plan as ProductionPlan | null;
  const nextStage = getNextPlanStage(
    stage,
    plan as Record<string, string> | null,
    garment.qc_rework_stages,
  );
  const historyKey = HISTORY_KEY_MAP[stage] ?? stage;
  const plannedWorker = (plan as any)?.[historyKey] ?? "";

  const [worker, setWorker] = useState(plannedWorker);
  const [workerOverride, setWorkerOverride] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Track visual mode locally so we control the transition timing
  const isStarted = !!garment.start_time;
  const [visualMode, setVisualMode] = useState<"idle" | "starting" | "started" | "cancelling">(
    isStarted ? "started" : "idle",
  );

  // Sync visual mode when garment data changes (after mutation settles)
  useEffect(() => {
    if (isStarted && visualMode === "idle") {
      // Was starting → now confirmed started
      setVisualMode("started");
    } else if (!isStarted && visualMode === "started") {
      // Was cancelling → now confirmed cancelled
      setVisualMode("idle");
    }
  }, [isStarted]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!nextStage) return null;

  const nextLabel =
    PIECE_STAGE_LABELS[nextStage as keyof typeof PIECE_STAGE_LABELS] ??
    nextStage;

  const handleStart = () => {
    setVisualMode("starting");
    startMut.mutate(garment.id, {
      onSuccess: () => setVisualMode("started"),
      onError: (err) => {
        setVisualMode("idle");
        toast.error(`Failed to start: ${err?.message ?? "Unknown error"}`);
      },
    });
  };

  const handleCancel = () => {
    setVisualMode("cancelling");
    cancelMut.mutate(garment.id, {
      onSuccess: () => setVisualMode("idle"),
      onError: (err) => {
        setVisualMode("started");
        toast.error(`Failed to cancel: ${err?.message ?? "Unknown error"}`);
      },
    });
  };

  const handleComplete = async () => {
    if (!worker) return;
    setConfirmOpen(false);
    try {
      await completeMut.mutateAsync({
        id: garment.id,
        worker,
        stage,
        nextStage,
      });
      router.history.back();
    } catch (err: any) {
      toast.error(`Could not advance garment to next stage: ${err?.message ?? (String(err) || "no error message")}`);
    }
  };

  const showStarted = visualMode === "started" || visualMode === "cancelling";

  return (
    <>
      {/* Worker selection card — only visible once started */}
      {showStarted && (
        <div className="bg-card border rounded-xl shadow-sm p-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              {worker && !workerOverride ? (
                <button
                  onClick={() => setWorkerOverride(true)}
                  className="flex items-center gap-2 text-sm cursor-pointer hover:opacity-80 transition-opacity"
                >
                  <span className="text-xs uppercase tracking-wider text-emerald-600 font-bold">
                    By
                  </span>
                  <span className="font-bold text-emerald-900 truncate text-base">
                    {worker}
                  </span>
                  <span className="text-xs text-muted-foreground">(change)</span>
                </button>
              ) : (
                <WorkerDropdown
                  responsibility={stage}
                  value={worker}
                  onChange={(v) => {
                    setWorker(v);
                    setWorkerOverride(false);
                  }}
                  placeholder="Who completed this?"
                />
              )}
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="text-sm font-bold text-emerald-700">
                In Progress
              </span>
              <ElapsedTimer since={garment.start_time!} />
            </div>
          </div>
        </div>
      )}

      {/* Floating action buttons — bottom-right */}
      <div className="fixed bottom-6 right-6 z-50 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center gap-3 transition-all duration-300 ease-in-out">
          {!showStarted ? (
            <Button
              key="start"
              size="lg"
              className="h-16 px-8 text-2xl font-bold rounded-full bg-blue-600 hover:bg-blue-700 shadow-lg animate-in fade-in zoom-in-95 duration-200"
              onClick={handleStart}
              disabled={visualMode === "starting"}
            >
              {visualMode === "starting" ? (
                <Loader2 className="w-6 h-6 mr-2.5 animate-spin" />
              ) : (
                <Play className="w-6 h-6 mr-2.5" />
              )}
              {visualMode === "starting" ? "Starting…" : "Start"}
            </Button>
          ) : (
            <>
              <Button
                key="cancel"
                variant="outline"
                size="lg"
                className="h-16 px-8 text-2xl font-bold rounded-full shadow-lg animate-in fade-in slide-in-from-right-4 duration-200"
                onClick={handleCancel}
                disabled={visualMode === "cancelling"}
              >
                {visualMode === "cancelling" ? (
                  <Loader2 className="w-6 h-6 mr-2.5 animate-spin" />
                ) : (
                  <X className="w-6 h-6 mr-2.5" />
                )}
                {visualMode === "cancelling" ? "Cancelling…" : "Cancel"}
              </Button>
              <Button
                key="done"
                size="lg"
                className="h-16 px-8 text-2xl font-bold rounded-full bg-emerald-600 hover:bg-emerald-700 shadow-lg animate-in fade-in slide-in-from-right-4 duration-300"
                onClick={() => setConfirmOpen(true)}
                disabled={!worker || completeMut.isPending}
              >
                <Check className="w-6 h-6 mr-2.5" />
                Done
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg">Confirm Completion</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-sm text-muted-foreground">
              Mark{" "}
              <span className="font-bold text-foreground">
                {garment.garment_id}
              </span>{" "}
              as done and move to{" "}
              <span className="font-bold text-foreground">{nextLabel}</span>?
            </p>
            <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-3">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
                By
              </span>
              <span className="font-bold text-base">{worker}</span>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="h-11 flex-1 text-base"
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="h-11 flex-1 text-base font-bold bg-emerald-600 hover:bg-emerald-700"
              onClick={handleComplete}
              disabled={completeMut.isPending}
            >
              {completeMut.isPending ? (
                <Loader2 className="w-5 h-5 mr-1.5 animate-spin" />
              ) : (
                <Check className="w-5 h-5 mr-1.5" />
              )}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── QC Actions ─────────────────────────────────────────────────

function QCActions({
  garment,
  measurement,
}: {
  garment: WorkshopGarment;
  measurement: Measurement | null | undefined;
}) {
  const router = useRouter();
  const passMut = useQcPass();
  const failMut = useQcFail();

  const plan = garment.production_plan as ProductionPlan | null;
  const plannedQC = plan?.quality_checker ?? "";

  const [mode, setMode] = useState<"pass" | "fail">("pass");
  const [worker, setWorker] = useState(plannedQC);
  const [workerOverride, setWorkerOverride] = useState(false);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [returnStages, setReturnStages] = useState<Set<PieceStage>>(new Set());
  const [reason, setReason] = useState("");
  const [flags, setFlags] = useState<QCFlag[]>([]);

  const allRated = QC_CATEGORIES.every((cat) => (ratings[cat.key] ?? 0) > 0);
  const canPass = !!worker && allRated;
  const canFail = !!reason && returnStages.size > 0;

  // First stage in production order — the entry point after fail.
  const firstReturnStage = (() => {
    if (returnStages.size === 0) return null;
    for (const s of FAIL_RETURN_STAGES) {
      if (returnStages.has(s.value)) return s.value;
    }
    return null;
  })();

  const toggleReturnStage = (value: PieceStage) => {
    setReturnStages((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const handlePass = async () => {
    if (!canPass) return;
    await passMut.mutateAsync({
      id: garment.id,
      worker,
      ratings,
      measurementIssues: null,
    });
    router.history.back();
  };

  const handleFail = async () => {
    if (!canFail || !firstReturnStage) return;
    const ordered = FAIL_RETURN_STAGES
      .filter((s) => returnStages.has(s.value))
      .map((s) => s.value);
    await failMut.mutateAsync({
      id: garment.id,
      returnStages: ordered,
      reason,
      flags,
    });
    const stageNames = ordered
      .map((s) => PIECE_STAGE_LABELS[s as keyof typeof PIECE_STAGE_LABELS] ?? s)
      .join(" → ");
    toast.warning(`${garment.garment_id} returned to ${stageNames}`);
    router.history.back();
  };

  return (
    <div className="bg-card border rounded-xl p-4 shadow-sm">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
        Quality Check
      </h3>

      <div className="flex rounded-lg bg-muted/50 p-1 mb-4">
        <button
          onClick={() => setMode("pass")}
          className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${
            mode === "pass"
              ? "bg-emerald-600 text-white shadow"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Check className="w-4 h-4 inline mr-1" /> Pass
        </button>
        <button
          onClick={() => setMode("fail")}
          className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${
            mode === "fail"
              ? "bg-red-600 text-white shadow"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <X className="w-4 h-4 inline mr-1" /> Fail
        </button>
      </div>

      {mode === "pass" ? (
        <div className="space-y-4">
          <div>
            {worker && !workerOverride ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-emerald-600 font-bold">
                    QC Inspector
                  </p>
                  <p className="text-sm font-semibold text-emerald-900">
                    {worker}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={() => setWorkerOverride(true)}
                >
                  Change
                </Button>
              </div>
            ) : (
              <WorkerDropdown
                responsibility="quality_check"
                value={worker}
                onChange={setWorker}
                placeholder="QC Inspector"
              />
            )}
          </div>

          <div className="space-y-3">
            {QC_CATEGORIES.map((cat) => (
              <div
                key={cat.key}
                className="flex items-center justify-between gap-2 py-1"
              >
                <span className="text-sm font-medium">{cat.label}</span>
                <StarRating
                  value={ratings[cat.key] ?? 0}
                  onChange={(v) => setRatings((p) => ({ ...p, [cat.key]: v }))}
                />
              </div>
            ))}
          </div>

          <Button
            className="w-full h-10 text-sm font-bold bg-emerald-600 hover:bg-emerald-700"
            onClick={handlePass}
            disabled={!canPass || passMut.isPending}
          >
            {passMut.isPending ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Check className="w-4 h-4 mr-1.5" />
            )}
            Pass & Send to Dispatch
          </Button>

          {!allRated && worker && (
            <p className="text-xs text-muted-foreground text-center">
              Rate all {QC_CATEGORIES.length} categories to pass
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Worker history — who worked on each stage */}
          <WorkerHistoryChips
            steps={WORKER_HISTORY_STEPS}
            workerHistory={garment.worker_history as Record<string, string> | null}
          />

          {/* Return stages — multi-select */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Send back to
              </label>
              {firstReturnStage && (
                <span className="text-[11px] text-muted-foreground">
                  Re-runs in order →{" "}
                  <span className="font-semibold text-foreground">
                    {FAIL_RETURN_STAGES
                      .filter((s) => returnStages.has(s.value))
                      .map((s) => s.label)
                      .join(" → ")}
                  </span>
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {FAIL_RETURN_STAGES.map((s) => {
                const Icon = s.icon;
                const isSelected = returnStages.has(s.value);
                const previousWorker = (garment.worker_history as Record<string, string> | null)?.[s.historyKey];
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => toggleReturnStage(s.value)}
                    className={cn(
                      "relative flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all",
                      isSelected
                        ? "border-red-400 bg-red-50 ring-1 ring-red-300 shadow-sm"
                        : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100",
                    )}
                  >
                    {isSelected && (
                      <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center">
                        <Check className="w-3 h-3" strokeWidth={3} />
                      </span>
                    )}
                    <Icon className={cn("w-4 h-4 shrink-0", isSelected ? s.color : "text-muted-foreground")} />
                    <div className="min-w-0">
                      <p className={cn("text-sm font-medium", isSelected ? "text-foreground" : "text-muted-foreground")}>
                        {s.label}
                      </p>
                      {previousWorker && (
                        <p className="text-xs text-muted-foreground truncate">{previousWorker}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Reason</label>
            <Input
              placeholder="Describe the issue…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <QCFlagsEditor
            garment={garment}
            measurement={measurement}
            flags={flags}
            onChange={setFlags}
          />

          <Button
            variant="destructive"
            className="w-full h-10 text-sm font-bold"
            onClick={handleFail}
            disabled={!canFail || failMut.isPending}
          >
            {failMut.isPending ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <X className="w-4 h-4 mr-1.5" />
            )}
            {returnStages.size > 1 ? `Send Back (${returnStages.size} stages)` : "Send Back"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── QC Flags Editor (measurement + style flagging on fail) ──────

const STYLE_COMPONENT_FIELDS: { key: keyof WorkshopGarment; label: string }[] = [
  { key: "collar_type", label: "Collar" },
  { key: "collar_button", label: "Collar Button" },
  { key: "cuffs_type", label: "Cuffs" },
  { key: "front_pocket_type", label: "Front Pocket" },
  { key: "jabzour_1", label: "Jabzour 1" },
  { key: "jabzour_2", label: "Jabzour 2" },
];

const ACCESSORY_FLAGS: { key: keyof WorkshopGarment; label: string; iconKey: keyof typeof ACCESSORY_ICONS }[] = [
  { key: "wallet_pocket", label: "Wallet Pocket", iconKey: "wallet" },
  { key: "pen_holder", label: "Pen Holder", iconKey: "pen" },
  { key: "mobile_pocket", label: "Mobile Pocket", iconKey: "phone" },
  { key: "small_tabaggi", label: "Small Tabaggi", iconKey: "smallTabaggi" },
];

function QCFlagsEditor({
  garment,
  measurement,
  flags,
  onChange,
}: {
  garment: WorkshopGarment;
  measurement: Measurement | null | undefined;
  flags: QCFlag[];
  onChange: (next: QCFlag[]) => void;
}) {
  const [tab, setTab] = useState<"measurement" | "style">("style");

  const flaggedKeys = new Set(flags.map((f) => f.field));

  const toggle = (field: string, kind: "measurement" | "style") => {
    if (flaggedKeys.has(field)) {
      onChange(flags.filter((f) => f.field !== field));
    } else {
      onChange([...flags, { field, kind }]);
    }
  };

  const updateNote = (field: string, note: string) => {
    onChange(
      flags.map((f) =>
        f.field === field ? { ...f, note: note.trim() || undefined } : f,
      ),
    );
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
          <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
            Flag what's wrong
          </span>
          {flags.length > 0 && (
            <span className="rounded-full bg-amber-600 text-white text-[10px] font-bold px-1.5 py-0.5">
              {flags.length}
            </span>
          )}
        </div>
        <span className="text-[11px] text-amber-700/70">Optional</span>
      </div>

      {/* Tab toggle */}
      <div className="flex rounded-md bg-white/60 border border-amber-200 p-0.5">
        <button
          type="button"
          onClick={() => setTab("style")}
          className={cn(
            "flex-1 py-1.5 rounded text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all",
            tab === "style"
              ? "bg-amber-600 text-white"
              : "text-amber-800 hover:bg-amber-100",
          )}
        >
          <Shirt className="w-3.5 h-3.5" /> Style
        </button>
        <button
          type="button"
          onClick={() => setTab("measurement")}
          className={cn(
            "flex-1 py-1.5 rounded text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all",
            tab === "measurement"
              ? "bg-amber-600 text-white"
              : "text-amber-800 hover:bg-amber-100",
          )}
        >
          <Ruler className="w-3.5 h-3.5" /> Measurement
        </button>
      </div>

      {tab === "style" && (
        <StyleFlagPicker
          garment={garment}
          flaggedKeys={flaggedKeys}
          onToggle={(field) => toggle(field, "style")}
        />
      )}

      {tab === "measurement" && (
        <MeasurementFlagPicker
          measurement={measurement}
          flaggedKeys={flaggedKeys}
          onToggle={(field) => toggle(field, "measurement")}
        />
      )}

      {/* Selected flags list with optional note */}
      {flags.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-amber-200">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
            Selected
          </p>
          <ul className="space-y-1.5">
            {flags.map((f) => (
              <li
                key={f.field}
                className="flex items-start gap-2 rounded-md bg-white border border-amber-200 px-2.5 py-1.5"
              >
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 mt-0.5",
                    f.kind === "style"
                      ? "bg-purple-100 text-purple-700"
                      : "bg-blue-100 text-blue-700",
                  )}
                >
                  {f.kind === "style" ? "Style" : "Meas"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-zinc-900">
                    {flagFieldLabel(f.field)}
                  </p>
                  <Input
                    placeholder="Note (optional) — what's wrong"
                    value={f.note ?? ""}
                    onChange={(e) => updateNote(f.field, e.target.value)}
                    className="h-7 text-xs mt-1"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onChange(flags.filter((x) => x.field !== f.field))
                  }
                  className="text-zinc-400 hover:text-red-600 shrink-0 mt-0.5"
                  aria-label="Remove"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function flagFieldLabel(field: string): string {
  if (QC_MEASUREMENT_FIELD_LABELS[field]) return QC_MEASUREMENT_FIELD_LABELS[field];
  const style = STYLE_COMPONENT_FIELDS.find((s) => s.key === field);
  if (style) return style.label;
  const acc = ACCESSORY_FLAGS.find((a) => a.key === field);
  if (acc) return acc.label;
  return field;
}

function StyleFlagPicker({
  garment,
  flaggedKeys,
  onToggle,
}: {
  garment: WorkshopGarment;
  flaggedKeys: Set<string>;
  onToggle: (field: string) => void;
}) {
  // Style components — only show ones the garment actually has.
  const components = STYLE_COMPONENT_FIELDS
    .map((c) => {
      const code = (garment as any)[c.key] as string | null | undefined;
      if (!code) return null;
      const img = STYLE_IMAGE_MAP[code];
      return { ...c, code, image: img?.image, valueLabel: img?.label ?? code };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  // Booleans — only show ones that are true on the garment.
  const accessories = ACCESSORY_FLAGS.filter(
    (a) => !!(garment as any)[a.key],
  );

  if (components.length === 0 && accessories.length === 0) {
    return (
      <p className="text-xs text-amber-700/70 italic text-center py-3">
        No style components on this garment.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {components.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {components.map((c) => {
            const isFlagged = flaggedKeys.has(c.key as string);
            return (
              <button
                key={c.key as string}
                type="button"
                onClick={() => onToggle(c.key as string)}
                className={cn(
                  "relative rounded-lg border bg-white p-1.5 transition-all text-center",
                  isFlagged
                    ? "border-red-400 ring-2 ring-red-300 shadow-sm"
                    : "border-zinc-200 hover:border-amber-300",
                )}
              >
                {isFlagged && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center z-10">
                    <Check className="w-3 h-3" strokeWidth={3} />
                  </span>
                )}
                {c.image ? (
                  <img
                    src={c.image}
                    alt={c.valueLabel}
                    className="w-full h-14 object-contain"
                  />
                ) : (
                  <div className="w-full h-14 flex items-center justify-center text-xs text-muted-foreground italic">
                    no image
                  </div>
                )}
                <p className="text-[10px] font-medium text-zinc-700 truncate mt-1">
                  {c.label}
                </p>
                <p className="text-[9px] text-zinc-500 truncate">{c.valueLabel}</p>
              </button>
            );
          })}
        </div>
      )}

      {accessories.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {accessories.map((a) => {
            const isFlagged = flaggedKeys.has(a.key as string);
            return (
              <button
                key={a.key as string}
                type="button"
                onClick={() => onToggle(a.key as string)}
                className={cn(
                  "relative rounded-lg border bg-white p-1.5 transition-all text-center",
                  isFlagged
                    ? "border-red-400 ring-2 ring-red-300 shadow-sm"
                    : "border-zinc-200 hover:border-amber-300",
                )}
              >
                {isFlagged && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center z-10">
                    <Check className="w-3 h-3" strokeWidth={3} />
                  </span>
                )}
                <img
                  src={ACCESSORY_ICONS[a.iconKey]}
                  alt={a.label}
                  className="w-full h-10 object-contain"
                />
                <p className="text-[10px] font-medium text-zinc-700 truncate mt-1">
                  {a.label}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MeasurementFlagPicker({
  measurement,
  flaggedKeys,
  onToggle,
}: {
  measurement: Measurement | null | undefined;
  flaggedKeys: Set<string>;
  onToggle: (field: string) => void;
}) {
  return (
    <div className="space-y-2.5">
      {QC_MEASUREMENT_FIELDS.map((g) => (
        <div key={g.group}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1">
            {g.group}
          </p>
          <div className="flex flex-wrap gap-1">
            {g.fields.map((f) => {
              const fieldKey = f.key as string;
              const isFlagged = flaggedKeys.has(fieldKey);
              const value = measurement
                ? (measurement as Record<string, unknown>)[fieldKey]
                : null;
              return (
                <button
                  key={fieldKey}
                  type="button"
                  onClick={() => onToggle(fieldKey)}
                  className={cn(
                    "relative inline-flex items-center gap-1 px-2 py-1.5 rounded-md border text-xs font-medium transition-all",
                    isFlagged
                      ? "border-red-400 bg-red-50 text-red-800 ring-1 ring-red-300"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-amber-300 hover:bg-amber-50/50",
                  )}
                >
                  {isFlagged && <Check className="w-3 h-3" strokeWidth={3} />}
                  <span>{f.label}</span>
                  {value != null && value !== "" && (
                    <span className="text-[10px] tabular-nums text-zinc-500 font-normal">
                      {String(value)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
