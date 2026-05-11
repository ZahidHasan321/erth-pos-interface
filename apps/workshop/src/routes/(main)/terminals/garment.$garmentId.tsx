import { useState, useEffect } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useGarment } from "@/hooks/useWorkshopGarments";
import { getFeedbackByGarmentAndTrip } from "@/api/feedback";
import {
  buildAlterationFilter,
  buildAltOutFilter,
  buildOptionChanges,
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
import { StatusBanner } from "@/components/shared/PageShell";
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
import { cn, formatDate } from "@/lib/utils";
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
        <Skeleton className="h-64 rounded-md" />
        <Skeleton className="h-48 rounded-md" />
      </div>
    );
  }

  if (!garment) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto text-center py-24">
        <p className="text-base font-medium text-muted-foreground">
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
  const qcFailOptionActuals = qcFailContext?.optionActuals ?? null;
  // Option diffs (add/remove/change/hashwa) derived from prior-trip feedback —
  // tells the sewer what to physically do, not just what the final state is.
  // QC-fail rework re-uses the alteration filter but option changes don't
  // apply (worker is fixing a defect, not enacting a spec change).
  const optionChanges = (isAltIn && !hasQcFail) ? buildOptionChanges(priorFeedback) : [];
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

        {!isQC && (
          <div className="mb-3 flex items-center gap-2.5 flex-wrap rounded-md border bg-card px-3 py-2">
            <span className={cn(
              "text-xs font-medium capitalize px-2 py-0.5 rounded-md border border-transparent shrink-0",
              garment.garment_type === "brova"
                ? "bg-[var(--status-info-bg)] text-[var(--status-info)]"
                : "bg-muted text-foreground",
            )}>
              {garment.garment_type}
            </span>
            <span className="font-mono text-base shrink-0">
              {garment.garment_id ?? garment.id.slice(0, 8)}
            </span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground shrink-0">
              {stageLabel}
            </span>
            {garment.customer_name && (
              <span className="text-sm text-muted-foreground truncate min-w-0 tracking-tight">
                {garment.customer_name}
              </span>
            )}
            {garment.invoice_number && (
              <span className="text-xs text-muted-foreground shrink-0">#{garment.invoice_number}</span>
            )}
            {garment.delivery_date_order && (
              <span className="text-xs text-[var(--status-warn)] font-medium ml-auto shrink-0">
                Due {formatDate(garment.delivery_date_order)}
              </span>
            )}
          </div>
        )}

        {isRepair && (
          <div className="mb-3">
            <StatusBanner
              tone={hasQcFail ? "bad" : "warn"}
              icon={hasQcFail ? AlertTriangle : RotateCcw}
            >
              <p className="text-sm font-medium">
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
            </StatusBanner>
          </div>
        )}

        {(isAltIn || isAltOut) && alterationFilter && alterationFilter.fieldReasons.size > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border bg-card px-3.5 py-2 text-xs">
            <span className="font-medium text-muted-foreground">Cell colors:</span>
            {/* Swatch colors must match the printed QC sheet palette in index.css (terminal-qc-measure-cell-reason-*) so the worker sees the same hues on screen and on paper. */}
            {/* eslint-disable-next-line no-restricted-syntax */}
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm border-2 border-emerald-500 bg-emerald-100" />
              Customer Request
            </span>
            {/* eslint-disable-next-line no-restricted-syntax */}
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
            qcFailOptionActuals={qcFailOptionActuals}
            optionChanges={optionChanges}
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
            <QualityCheckForm
              garment={garment}
              measurement={effectiveMeasurement}
              isAlteration={(isAltIn || isAltOut) && !hasQcFail}
              alterationFilter={baseAlterationFilter}
            />
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
          qcFailActuals={qcFailActuals}
          qcFailOptionActuals={qcFailOptionActuals}
          optionChanges={optionChanges}
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
    <span className="text-xs font-mono text-[var(--status-ok)] tabular-nums">
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
        <div className="bg-card border rounded-md p-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              {worker && !workerOverride ? (
                <button
                  onClick={() => setWorkerOverride(true)}
                  className="flex items-center gap-2 text-sm cursor-pointer hover:opacity-80 transition-opacity"
                >
                  <span className="text-sm font-medium text-muted-foreground">
                    {isSewing ? "Unit" : "By"}
                  </span>
                  <span className="text-base font-medium truncate">
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
            <div className="flex items-center gap-2 px-3 py-2 bg-[var(--status-ok-bg)] border border-[color:var(--status-ok)]/30 rounded-md">
              <div className="w-2 h-2 rounded-full bg-[var(--status-ok)] animate-pulse shrink-0" />
              <span className="text-sm font-medium text-[var(--status-ok)]">
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
              className="h-14 px-7 text-lg font-medium shadow-md animate-in fade-in zoom-in-95 duration-200"
              onClick={handleStart}
              disabled={visualMode === "starting"}
            >
              {visualMode === "starting" ? (
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              ) : (
                <Play className="w-5 h-5 mr-2" />
              )}
              {visualMode === "starting" ? "Starting…" : "Start"}
            </Button>
          ) : (
            <>
              <Button
                key="cancel"
                variant="outline"
                size="lg"
                className="h-14 px-7 text-lg font-medium shadow-md animate-in fade-in slide-in-from-right-4 duration-200"
                onClick={handleCancel}
                disabled={visualMode === "cancelling"}
              >
                {visualMode === "cancelling" ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <X className="w-5 h-5 mr-2" />
                )}
                {visualMode === "cancelling" ? "Cancelling…" : "Cancel"}
              </Button>
              <Button
                key="done"
                size="lg"
                className="h-14 px-7 text-lg font-medium shadow-md animate-in fade-in slide-in-from-right-4 duration-300"
                onClick={() => setConfirmOpen(true)}
                disabled={!worker || completeMut.isPending}
              >
                <Check className="w-5 h-5 mr-2" />
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
            <DialogTitle className="text-base font-medium">Confirm Completion</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-sm text-muted-foreground">
              Mark{" "}
              <span className="font-medium text-foreground">
                {garment.garment_id}
              </span>{" "}
              as done and move to{" "}
              <span className="font-medium text-foreground">{nextLabel}</span>?
            </p>
            <div className="bg-muted rounded-md p-3 flex items-center gap-3">
              <span className="text-sm font-medium text-muted-foreground">
                {isSewing ? "Unit" : "By"}
              </span>
              <span className="text-base font-medium">{worker}</span>
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
              className="h-11 flex-1 text-base font-medium"
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
