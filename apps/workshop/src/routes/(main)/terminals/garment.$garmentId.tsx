import { useState, useEffect } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useGarment } from "@/hooks/useWorkshopGarments";
import { getFeedbackByGarmentAndTrip } from "@/api/feedback";
import { buildAlterationFilter } from "@/lib/alteration-filter";
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
} from "lucide-react";
import { IconNeedle, IconIroning1, IconStack2, IconSparkles } from "@tabler/icons-react";
import type {
  WorkshopGarment,
  PieceStage,
  ProductionPlan,
  TripHistoryEntry,
} from "@repo/database";
import { isAlteration, getAlterationNumber } from "@repo/database";

export const Route = createFileRoute("/(main)/terminals/garment/$garmentId")({
  component: TerminalGarmentPage,
});

// ── Constants ──────────────────────────────────────────────────

const QC_CATEGORIES = [
  { key: "stitching", label: "Stitching Quality" },
  { key: "measurement", label: "Measurement Accuracy" },
  { key: "fabric", label: "Fabric Condition" },
  { key: "finishing", label: "Finishing Quality" },
  { key: "appearance", label: "Overall Appearance" },
];

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
  const isAlt = garment ? isAlteration(currentTrip, garment.garment_type) : false;
  const priorTrip = isAlt ? currentTrip - 1 : 0;
  const { data: priorFeedback } = useQuery({
    queryKey: ["garment-feedback", garment?.id, priorTrip],
    queryFn: () => getFeedbackByGarmentAndTrip(garment!.id, priorTrip),
    enabled: !!garment && isAlt && priorTrip >= 1,
    staleTime: 60_000,
  });

  if (isLoading) {
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
  const isRepair = hasQcFail || isAlt;

  const alterationFilter = isAlt ? buildAlterationFilter(priorFeedback) : null;

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
              : "bg-orange-50 border-orange-200 text-orange-800",
          )}>
            {hasQcFail ? (
              <AlertTriangle className="w-5 h-5 shrink-0" />
            ) : (
              <RotateCcw className="w-5 h-5 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-bold">
                {hasQcFail ? "QC Fix (alt_p)" : `Alteration ${altNum}`}
                {" "}<span className="font-normal">— partial re-entry, not standard production</span>
              </p>
              {hasQcFail && lastQcFail?.fail_reason && (
                <p className="text-xs mt-0.5 opacity-80">Reason: {lastQcFail.fail_reason}</p>
              )}
            </div>
          </div>
        )}

        {isAlt && alterationFilter && alterationFilter.fieldReasons.size > 0 && (
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
          measurement={garment.measurement}
          alterationFilter={alterationFilter}
          notes={garment.notes}
        />

        <div className="mt-4">
          {isQC ? (
            <QCActions garment={garment} />
          ) : isProductionStage ? (
            <TerminalActions garment={garment} />
          ) : null}
        </div>
      </div>

      <div className="terminal-print-only hidden" aria-hidden="true">
        <TerminalQualityTemplatePrint garment={garment} alterationFilter={alterationFilter} />
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
  const nextStage = getNextPlanStage(stage, plan as Record<string, string> | null);
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

function QCActions({ garment }: { garment: WorkshopGarment }) {
  const router = useRouter();
  const passMut = useQcPass();
  const failMut = useQcFail();

  const plan = garment.production_plan as ProductionPlan | null;
  const plannedQC = plan?.quality_checker ?? "";

  const [mode, setMode] = useState<"pass" | "fail">("pass");
  const [worker, setWorker] = useState(plannedQC);
  const [workerOverride, setWorkerOverride] = useState(false);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [returnStage, setReturnStage] = useState<PieceStage>("sewing");
  const [reason, setReason] = useState("");

  const allRated = QC_CATEGORIES.every((cat) => (ratings[cat.key] ?? 0) > 0);
  const canPass = !!worker && allRated;
  const canFail = !!reason;

  const handlePass = async () => {
    if (!canPass) return;
    await passMut.mutateAsync({ id: garment.id, worker, ratings });
    router.history.back();
  };

  const handleFail = async () => {
    if (!canFail) return;
    await failMut.mutateAsync({ id: garment.id, returnStage, reason });
    toast.warning(
      `${garment.garment_id} returned to ${PIECE_STAGE_LABELS[returnStage as keyof typeof PIECE_STAGE_LABELS] ?? returnStage}`,
    );
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
              Rate all 5 categories to pass
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

          {/* Return stage — visual single-select chips */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Send back to
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {FAIL_RETURN_STAGES.map((s) => {
                const Icon = s.icon;
                const isSelected = returnStage === s.value;
                const previousWorker = (garment.worker_history as Record<string, string> | null)?.[s.historyKey];
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setReturnStage(s.value)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all",
                      isSelected
                        ? "border-red-300 bg-red-50 shadow-sm"
                        : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100",
                    )}
                  >
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
            Send Back
          </Button>
        </div>
      )}
    </div>
  );
}
