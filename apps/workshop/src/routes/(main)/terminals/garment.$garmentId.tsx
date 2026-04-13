import { useState, useEffect } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useGarment } from "@/hooks/useWorkshopGarments";
import {
  useCompleteAndAdvance,
  useStartGarment,
  useCancelStartGarment,
  useQcPass,
  useQcFail,
} from "@/hooks/useGarmentMutations";
import { WorkerDropdown } from "@/components/shared/WorkerDropdown";
import {
  NotesSection,
  HISTORY_KEY_MAP,
} from "@/components/shared/GarmentDetailSections";
import { DishdashaOverlay } from "@/components/shared/DishdashaOverlay";
import { TerminalQualityTemplatePrint } from "@/components/print/TerminalQualityTemplatePrint";
import { Skeleton } from "@repo/ui/skeleton";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/select";
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
} from "lucide-react";
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

const FAIL_RETURN_STAGES: { value: PieceStage; label: string }[] = [
  { value: "cutting", label: "Back to Cutting" },
  { value: "post_cutting", label: "Back to Post-Cutting" },
  { value: "sewing", label: "Back to Sewing" },
  { value: "finishing", label: "Back to Finishing" },
  { value: "ironing", label: "Back to Ironing" },
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

  // Repair detection
  const tripHistory = garment.trip_history as TripHistoryEntry[] | null;
  const currentTrip = garment.trip_number ?? 1;
  const tripEntry = tripHistory?.find((t) => t.trip === currentTrip);
  const hasQcFail = !!tripEntry?.qc_attempts?.some((a) => a.result === "fail");
  const lastQcFail = tripEntry?.qc_attempts?.filter((a) => a.result === "fail").at(-1);
  const isBrovaReturn = garment.garment_type === "brova" && currentTrip >= 2 && currentTrip <= 3;
  const isAlt = isAlteration(currentTrip, garment.garment_type);
  const altNum = getAlterationNumber(currentTrip, garment.garment_type);
  const isRepair = hasQcFail || isBrovaReturn || isAlt;

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
              : isAlt
                ? "bg-orange-50 border-orange-200 text-orange-800"
                : "bg-amber-50 border-amber-200 text-amber-800",
          )}>
            {hasQcFail ? (
              <AlertTriangle className="w-5 h-5 shrink-0" />
            ) : (
              <RotateCcw className="w-5 h-5 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-bold">
                {hasQcFail ? "QC Fix" : isAlt ? `Alteration ${altNum}` : `Brova Return ${currentTrip - 1}`}
                {" "}<span className="font-normal">— not standard production</span>
              </p>
              {hasQcFail && lastQcFail?.fail_reason && (
                <p className="text-xs mt-0.5 opacity-80">Reason: {lastQcFail.fail_reason}</p>
              )}
            </div>
          </div>
        )}

        <DishdashaOverlay
          garment={garment}
          measurement={garment.measurement}
        />

        {garment.notes && (
          <div className="mt-3">
            <NotesSection notes={garment.notes} />
          </div>
        )}

        <div className="mt-4">
          {isQC ? (
            <QCActions garment={garment} />
          ) : isProductionStage ? (
            <TerminalActions garment={garment} />
          ) : null}
        </div>
      </div>

      <div className="terminal-print-only hidden" aria-hidden="true">
        <TerminalQualityTemplatePrint garment={garment} />
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
              <Check className="w-5 h-5 mr-1.5" />
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
            <Check className="w-4 h-4 mr-1.5" /> Pass & Send to Dispatch
          </Button>

          {!allRated && worker && (
            <p className="text-xs text-muted-foreground text-center">
              Rate all 5 categories to pass
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Return to Stage
            </label>
            <Select
              value={returnStage}
              onValueChange={(v) => setReturnStage(v as PieceStage)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FAIL_RETURN_STAGES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Reason</label>
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
            <X className="w-4 h-4 mr-1.5" /> Send Back
          </Button>
        </div>
      )}
    </div>
  );
}
