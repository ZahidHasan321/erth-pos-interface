import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useGarment } from "@/hooks/useWorkshopGarments";
import {
  useCompleteAndAdvance,
  useStartGarment,
  useQcPass,
  useQcFail,
} from "@/hooks/useGarmentMutations";
import { WorkerDropdown } from "@/components/shared/WorkerDropdown";
import {
  GarmentHeader,
  WorkerHistorySection,
  NotesSection,
  HISTORY_KEY_MAP,
} from "@/components/shared/GarmentDetailSections";
import { DishdashaOverlay } from "@/components/shared/DishdashaOverlay";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  PIECE_STAGE_LABELS,
  STAGE_NEXT,
  PRODUCTION_STAGES,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  Play,
  Star,
  Check,
  X,
} from "lucide-react";
import type { WorkshopGarment, PieceStage, ProductionPlan } from "@repo/database";

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
        <p className="text-lg font-semibold text-muted-foreground">Garment not found</p>
        <Button variant="outline" className="mt-4" onClick={() => router.history.back()}>
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
  const showFloatingBar = isProductionStage && !isQC;

  return (
    <div className={cn(
      "p-3 sm:p-4 max-w-7xl mx-auto",
      showFloatingBar ? "pb-24" : "pb-8",
    )}>
      <button
        onClick={() => router.history.back()}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline cursor-pointer transition-colors mb-3"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to {stageLabel}
      </button>

      <GarmentHeader garment={garment} />

      {/* Main content: overlay + production team + QC */}
      <div className="mt-3 flex flex-col lg:flex-row gap-3 items-start">
        {/* Dishdasha spec sheet */}
        <div className="lg:w-[55%] shrink-0">
          <DishdashaOverlay garment={garment} measurement={garment.measurement} />
        </div>

        {/* Production team + notes */}
        <div className="flex-1 min-w-0 space-y-3">
          <WorkerHistorySection garment={garment} />
          {garment.notes && <NotesSection notes={garment.notes} />}
        </div>

        {/* QC panel (only on quality_check stage) */}
        {isQC && (
          <div className="lg:w-[320px] shrink-0 lg:sticky lg:top-4 lg:self-start">
            <QCActions garment={garment} />
          </div>
        )}
      </div>

      {showFloatingBar && <TerminalActions garment={garment} />}
    </div>
  );
}

// ── Terminal Actions (floating bar) ─────────────────────────────

function TerminalActions({ garment }: { garment: WorkshopGarment }) {
  const router = useRouter();
  const startMut = useStartGarment();
  const completeMut = useCompleteAndAdvance();

  const stage = garment.piece_stage ?? "";
  const nextStage = STAGE_NEXT[stage];
  const historyKey = HISTORY_KEY_MAP[stage] ?? stage;
  const plan = garment.production_plan as ProductionPlan | null;
  const plannedWorker = (plan as any)?.[historyKey] ?? "";

  const [worker, setWorker] = useState(plannedWorker);
  const [workerOverride, setWorkerOverride] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!nextStage) return null;

  const nextLabel =
    PIECE_STAGE_LABELS[nextStage as keyof typeof PIECE_STAGE_LABELS] ?? nextStage;

  const handleComplete = async () => {
    if (!worker) return;
    setConfirmOpen(false);
    try {
      await completeMut.mutateAsync({ id: garment.id, worker, stage, nextStage });
      toast.success(`${garment.garment_id ?? "Garment"} advanced to ${nextLabel}`);
      router.history.back();
    } catch (err: any) {
      toast.error(`Failed to advance: ${err?.message ?? "Unknown error"}`);
    }
  };

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-t shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            {worker && !workerOverride ? (
              <button
                onClick={() => setWorkerOverride(true)}
                className="flex items-center gap-2 text-sm cursor-pointer hover:opacity-80 transition-opacity"
              >
                <span className="text-xs uppercase tracking-wider text-emerald-600 font-bold">By</span>
                <span className="font-bold text-emerald-900 truncate text-base">{worker}</span>
                <span className="text-xs text-muted-foreground">(change)</span>
              </button>
            ) : (
              <WorkerDropdown
                responsibility={stage}
                value={worker}
                onChange={(v) => { setWorker(v); setWorkerOverride(false); }}
                placeholder="Who completed this?"
              />
            )}
          </div>

          <div className="flex gap-2 shrink-0">
            {!garment.start_time && (
              <Button
                variant="outline"
                className="h-12 px-5 text-base font-bold"
                onClick={() => {
                  startMut.mutate(garment.id, {
                    onSuccess: () => toast.success(`Started working on ${garment.garment_id ?? "garment"}`),
                    onError: (err) => toast.error(`Failed to start: ${err?.message ?? "Unknown error"}`),
                  });
                }}
                disabled={startMut.isPending}
              >
                <Play className="w-5 h-5 mr-1.5" />
                Start
              </Button>
            )}
            <Button
              className="h-12 px-6 text-base font-bold bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-all"
              onClick={() => setConfirmOpen(true)}
              disabled={!worker || completeMut.isPending}
            >
              Done
              <ArrowRight className="w-5 h-5 ml-1.5" />
            </Button>
          </div>
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
              Mark <span className="font-bold text-foreground">{garment.garment_id}</span> as done and move to <span className="font-bold text-foreground">{nextLabel}</span>?
            </p>
            <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-3">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-bold">By</span>
              <span className="font-bold text-base">{worker}</span>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11 flex-1 text-base" onClick={() => setConfirmOpen(false)}>
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
    toast.success(`${garment.garment_id} passed QC — Ready for Dispatch`);
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
            mode === "pass" ? "bg-emerald-600 text-white shadow" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Check className="w-4 h-4 inline mr-1" /> Pass
        </button>
        <button
          onClick={() => setMode("fail")}
          className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${
            mode === "fail" ? "bg-red-600 text-white shadow" : "text-muted-foreground hover:text-foreground"
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
                  <p className="text-xs uppercase tracking-wider text-emerald-600 font-bold">QC Inspector</p>
                  <p className="text-sm font-semibold text-emerald-900">{worker}</p>
                </div>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setWorkerOverride(true)}>
                  Change
                </Button>
              </div>
            ) : (
              <WorkerDropdown responsibility="quality_check" value={worker} onChange={setWorker} placeholder="QC Inspector" />
            )}
          </div>

          <div className="space-y-3">
            {QC_CATEGORIES.map((cat) => (
              <div key={cat.key} className="flex items-center justify-between gap-2 py-1">
                <span className="text-sm font-medium">{cat.label}</span>
                <StarRating value={ratings[cat.key] ?? 0} onChange={(v) => setRatings((p) => ({ ...p, [cat.key]: v }))} />
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
            <p className="text-xs text-muted-foreground text-center">Rate all 5 categories to pass</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Return to Stage</label>
            <Select value={returnStage} onValueChange={(v) => setReturnStage(v as PieceStage)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FAIL_RETURN_STAGES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Reason</label>
            <Input placeholder="Describe the issue…" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>

          <Button variant="destructive" className="w-full h-10 text-sm font-bold" onClick={handleFail} disabled={!canFail || failMut.isPending}>
            <X className="w-4 h-4 mr-1.5" /> Send Back
          </Button>
        </div>
      )}
    </div>
  );
}
