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
import { buildQcFailContext } from "@/lib/qc-corrections";
import {
  useCompleteAndAdvance,
  useStartGarment,
  useCancelStartGarment,
} from "@/hooks/useGarmentMutations";
import { WorkerDropdown } from "@/components/shared/WorkerDropdown";
import { HISTORY_KEY_MAP, GarmentHeader } from "@/components/shared/GarmentDetailSections";
import { DishdashaOverlay } from "@/components/shared/DishdashaOverlay";
import { TerminalQualityTemplatePrint } from "@/components/print/TerminalQualityTemplatePrint";
import { QualityCheckForm } from "@/components/terminals/QualityCheckForm";
import { Skeleton } from "@repo/ui/skeleton";
import { Button } from "@repo/ui/button";
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
  Check,
  X,
  AlertTriangle,
  RotateCcw,
  Loader2,
} from "lucide-react";
import type {
  WorkshopGarment,
  ProductionPlan,
  TripHistoryEntry,
} from "@repo/database";
import { isAlteration, getAlterationNumber } from "@repo/database";

export const Route = createFileRoute("/(main)/terminals/garment/$garmentId")({
  component: TerminalGarmentPage,
});

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
  const baseAlterationFilter = isAltIn
    ? buildAlterationFilter(priorFeedback)
    : isAltOut
      ? buildAltOutFilter(garment, altOutHasBaseline)
      : null;
  const qcFailContext = hasQcFail ? buildQcFailContext(garment) : null;
  // QC fail describes the most-recent issue the worker must fix; it takes
  // precedence over the prior-trip alteration filter when both are present.
  const alterationFilter = qcFailContext?.filter ?? baseAlterationFilter;
  const qcFailActuals = qcFailContext?.actuals ?? null;
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

        {!isQC && (
          <DishdashaOverlay
            garment={garment}
            measurement={effectiveMeasurement}
            alterationFilter={alterationFilter}
            qcFailActuals={qcFailActuals}
            notes={garment.notes}
          />
        )}

        {isQC && (
          <div className="mb-3">
            <GarmentHeader garment={garment} showExtras />
          </div>
        )}

        <div className="mt-4">
          {isQC ? (
            <QualityCheckForm garment={garment} measurement={effectiveMeasurement} />
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
  const isSewing = stage === "sewing";
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
                    {isSewing ? "Unit" : "By"}
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
                {isSewing ? "Unit" : "By"}
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
