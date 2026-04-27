import { useMemo, useState } from "react";
import { Check, Lock, RotateCcw, ChevronRight, Ruler, Shirt, Image as ImageIcon, Mic, Play, Pause, XCircle } from "lucide-react";
import { IconRosette } from "@tabler/icons-react";
import { useWorkshopWorkload } from "@/hooks/useWorkshopGarments";
import { cn, formatDate } from "@/lib/utils";
import type { ProductionPlan, QcAttempt, TripHistoryEntry } from "@repo/database";
import { getQcReturnStages } from "@repo/database";

// ── Shared types ────────────────────────────────────────────────────────────

export interface PlanStep {
  key: string;
  label: string;
  responsibility: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  accent: string;
}

export interface WorkerResource {
  id: string;
  resource_name: string;
  resource_type?: string | null;
  daily_target?: number | null;
  responsibility?: string | null;
  unit?: string | null;
}

// ── Workload hook ───────────────────────────────────────────────────────────

/** Compute per-step workload: plan-key → worker name → garment count */
export function useStepWorkload(steps: readonly { key: string }[]) {
  const { data: allGarments = [] } = useWorkshopWorkload();

  return useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const step of steps) {
      map[step.key] = {};
    }
    for (const g of allGarments) {
      if (!g.production_plan || !g.in_production) continue;
      const pp = g.production_plan as ProductionPlan;
      for (const step of steps) {
        const workerName = pp[step.key as keyof ProductionPlan];
        if (workerName) {
          map[step.key][workerName] = (map[step.key][workerName] ?? 0) + 1;
        }
      }
    }
    return map;
  }, [allGarments, steps]);
}

// ── Worker sorting ──────────────────────────────────────────────────────────

/** Sort workers: free first, then by load ascending, overloaded last */
export function sortWorkersByLoad(
  workers: WorkerResource[],
  stepWorkload: Record<string, number>,
): WorkerResource[] {
  return [...workers].sort((a, b) => {
    const aLoad = stepWorkload[a.resource_name] ?? 0;
    const bLoad = stepWorkload[b.resource_name] ?? 0;
    const aCap = a.daily_target ?? 0;
    const bCap = b.daily_target ?? 0;
    const aOver = aCap > 0 && aLoad >= aCap;
    const bOver = bCap > 0 && bLoad >= bCap;
    if (aOver !== bOver) return aOver ? 1 : -1;
    return aLoad - bLoad;
  });
}

// ── WorkloadBar ─────────────────────────────────────────────────────────────

export function WorkloadBar({ current, max }: { current: number; max: number }) {
  if (max <= 0) return null;
  const pct = Math.min((current / max) * 100, 100);
  const isOver = current >= max;
  return (
    <div className="flex items-center gap-2 mt-0.5">
      <div className="flex-1 h-1.5 bg-zinc-200 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            isOver ? "bg-red-500" : pct > 60 ? "bg-orange-400" : "bg-emerald-400",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn(
        "text-xs font-bold tabular-nums shrink-0",
        isOver ? "text-red-600" : "text-muted-foreground",
      )}>
        {current}/{max}
      </span>
    </div>
  );
}

// ── WorkerChip ──────────────────────────────────────────────────────────────

export function WorkerChip({
  worker,
  isSelected,
  load,
  capacity,
  onSelect,
}: {
  worker: WorkerResource;
  isSelected: boolean;
  load: number;
  capacity: number;
  onSelect: () => void;
}) {
  const isOver = capacity > 0 && load >= capacity;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={cn(
        "inline-flex items-center gap-1.5 border rounded-full px-3 py-1.5 text-xs font-medium transition-[color,background-color,border-color,box-shadow] cursor-pointer touch-manipulation pointer-coarse:active:scale-[0.97]",
        isSelected
          ? "border-primary bg-primary text-white shadow-sm"
          : isOver
            ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
            : "border-zinc-200 bg-card text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50",
      )}
    >
      {isSelected && <Check className="w-3 h-3 shrink-0" />}
      <span className="truncate max-w-[100px]">{worker.resource_name}</span>
      {worker.resource_type === "Senior" && (
        <span className={cn(
          "text-xs font-bold uppercase",
          isSelected ? "text-white/80" : "text-amber-500",
        )}>
          Sr
        </span>
      )}
      <span className={cn(
        "text-xs font-bold tabular-nums",
        isSelected
          ? "text-white/70"
          : isOver
            ? "text-red-500"
            : load > 0
              ? "text-orange-500"
              : "text-emerald-500",
      )}>
        {capacity > 0 ? `${load}/${capacity}` : load > 0 ? load : "0"}
      </span>
    </button>
  );
}

// ── StageSelector ───────────────────────────────────────────────────────────

export function StageSelector({
  steps,
  selectedStages,
  onToggle,
  lockedKeys,
}: {
  steps: readonly PlanStep[];
  selectedStages: Set<string>;
  onToggle: (key: string) => void;
  lockedKeys?: Set<string>;
}) {
  const locked = lockedKeys ?? new Set<string>();
  return (
    <div className="flex flex-wrap gap-1.5">
      {steps.map((step) => {
        const Icon = step.icon;
        const isSelected = selectedStages.has(step.key);
        const isLocked = locked.has(step.key);
        return (
          <button
            key={step.key}
            type="button"
            onClick={() => !isLocked && onToggle(step.key)}
            disabled={isLocked}
            aria-pressed={isSelected}
            title={isLocked ? "Stage already done or in progress" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border-2 transition-[color,background-color,border-color,box-shadow]",
              isLocked
                ? "border-zinc-200 bg-zinc-50 text-zinc-400 cursor-not-allowed"
                : isSelected
                  ? "border-primary bg-primary text-white shadow-md scale-[1.02]"
                  : "border-zinc-200 bg-card text-zinc-600 hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm cursor-pointer",
            )}
          >
            <Icon className={cn("w-3.5 h-3.5", isLocked ? "text-zinc-300" : isSelected ? "text-white" : step.color)} />
            {step.label}
            {isLocked && <Lock className="w-3 h-3 text-zinc-400" />}
          </button>
        );
      })}
      {/* QC — always on, locked */}
      <div
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border-2 border-indigo-300 bg-indigo-50 text-indigo-700"
        title="Quality Check is always required"
      >
        <IconRosette className="w-3.5 h-3.5 text-indigo-500" />
        QC
        <Lock className="w-3 h-3 text-indigo-400" />
      </div>
    </div>
  );
}

// ── PipelineStepHeader ──────────────────────────────────────────────────────

export function PipelineStepHeader({
  step,
  isFilled,
  workerName,
  unitName,
  previousWorker,
  onClear,
}: {
  step: PlanStep;
  isFilled: boolean;
  workerName?: string;
  unitName?: string;
  previousWorker?: string;
  onClear?: () => void;
}) {
  const Icon = step.icon;

  return (
    <div className="flex items-center gap-2.5">
      <div className={cn(
        "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
        isFilled ? step.accent + " text-white" : "bg-zinc-100",
      )}>
        {isFilled ? <Check className="w-4 h-4" /> : <Icon className={cn("w-4 h-4", step.color)} />}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-semibold">{step.label}</span>
        {isFilled && workerName && (
          <p className="text-xs text-muted-foreground truncate">
            {unitName && <span>{unitName} &middot; </span>}
            {workerName}
            {previousWorker && workerName !== previousWorker && (
              <span className="text-orange-500 ml-1">(was {previousWorker})</span>
            )}
          </p>
        )}
        {!isFilled && previousWorker && (
          <p className="text-xs text-muted-foreground italic">Previously: {previousWorker}</p>
        )}
      </div>
      {isFilled && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
        >
          Change
        </button>
      )}
    </div>
  );
}

// ── QcFailBanner ──────────────────────────────────────────────────────────
// Dedicated banner for QC-fail rework. Reads the current trip's qc_attempts
// from trip_history — NOT garment_feedback. Kept separate from customer
// feedback (ReturnContextBanner) so the two flows never overlap.

const STAGE_LABELS: Record<string, string> = {
  soaking: "Soaking",
  cutting: "Cutting",
  post_cutting: "Post-Cutting",
  sewing: "Sewing",
  finishing: "Finishing",
  ironing: "Ironing",
  quality_check: "Quality Check",
};

export interface QcFailBannerProps {
  tripHistory?: TripHistoryEntry[] | string | null;
  currentTrip?: number | null;
}

function parseTripHistory(raw: unknown): TripHistoryEntry[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as TripHistoryEntry[];
  if (typeof raw !== "string") return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? (v as TripHistoryEntry[]) : []; } catch { return []; }
}

export function QcFailBanner({ tripHistory, currentTrip }: QcFailBannerProps) {
  const history = parseTripHistory(tripHistory);
  if (!currentTrip || history.length === 0) return null;
  const entry = history.find((t) => t.trip === currentTrip);
  const fails: QcAttempt[] = (entry?.qc_attempts ?? []).filter((a) => a.result === "fail");
  if (fails.length === 0) return null;

  const latest = fails[fails.length - 1];
  const failCount = fails.length;

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <XCircle className="w-3.5 h-3.5 shrink-0 text-red-500" />
        <span className="text-xs font-bold uppercase tracking-wider text-red-700">
          QC Failed
        </span>
        {failCount > 1 && (
          <span className="text-xs font-medium text-red-500">
            ×{failCount}
          </span>
        )}
        {latest.date && (
          <span className="text-xs font-medium ml-auto text-red-500">
            {formatDate(latest.date)}
          </span>
        )}
      </div>

      <div className="rounded-md border border-white/60 bg-white/70 px-2.5 py-2 space-y-1 text-xs">
        {latest.inspector && (
          <div className="flex gap-1.5">
            <span className="text-muted-foreground">Inspector:</span>
            <span className="font-medium text-foreground">{latest.inspector}</span>
          </div>
        )}
        {getQcReturnStages(latest).length > 0 && (
          <div className="flex gap-1.5">
            <span className="text-muted-foreground">
              Return stage{getQcReturnStages(latest).length > 1 ? "s" : ""}:
            </span>
            <span className="font-medium text-foreground">
              {getQcReturnStages(latest)
                .map((s) => STAGE_LABELS[s] ?? s)
                .join(" → ")}
            </span>
          </div>
        )}
        {latest.fail_reason && (
          <div className="pt-1 border-t border-zinc-100">
            <p className="text-muted-foreground mb-0.5">Reason:</p>
            <p className="text-foreground">{latest.fail_reason}</p>
          </div>
        )}
        {latest.ratings && Object.keys(latest.ratings).length > 0 && (
          <div className="pt-1 border-t border-zinc-100">
            <p className="text-muted-foreground mb-1">Ratings:</p>
            <div className="flex flex-wrap gap-1">
              {Object.entries(latest.ratings).map(([k, v]) => (
                <span
                  key={k}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-100 text-[11px]"
                >
                  <span className="text-muted-foreground">{k}:</span>
                  <span className="font-semibold">{v}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── ReturnContextBanner ────────────────────────────────────────────────────

const MEASUREMENT_FIELD_LABELS: Record<string, string> = {
  collar_width: "Collar Width",
  collar_height: "Collar Height",
  length_front: "Length (Front)",
  length_back: "Length (Back)",
  top_pocket_length: "Top Pocket Length",
  top_pocket_width: "Top Pocket Width",
  top_pocket_distance: "Top Pocket Distance",
  side_pocket_length: "Side Pocket Length",
  side_pocket_width: "Side Pocket Width",
  side_pocket_distance: "Side Pocket Distance",
  side_pocket_opening: "Side Pocket Opening",
  waist_front: "Waist (Front)",
  waist_back: "Waist (Back)",
  armhole: "Arm Hole",
  chest_upper: "Chest (Upper)",
  chest_full: "Chest (Full)",
  chest_front: "Chest (Half)",
  elbow: "Elbow",
  sleeve_length: "Sleeves",
  bottom: "Bottom",
};

const OPTION_LABELS: Record<string, string> = {
  collar: "Collar Type",
  collarBtn: "Collar Button",
  frontPocket: "Front Pocket",
  cuff: "Cuffs",
  jabzour: "Jabzour",
  smallTabaggi: "Small Tabaggi",
};

interface MeasurementDiff {
  field: string;
  original_value?: number | null;
  actual_value?: number | string | null;
  difference?: number | null;
  reason?: string | null;
  notes?: string | null;
}

interface OptionCheck {
  option_name: string;
  expected_value?: string | null;
  actual_correct?: boolean;
  rejected?: boolean;
  new_value?: string | null;
  hashwa_rejected?: boolean;
  hashwa_new_value?: string | null;
  notes?: string | null;
}

export interface ReturnContextProps {
  feedbackStatus?: "needs_repair" | "needs_redo" | string | null;
  tripNumber?: number | null;
  notes?: string | null;
  measurementDiffs?: MeasurementDiff[] | null;
  optionsChecklist?: OptionCheck[] | null;
  photoUrls?: string[] | null;
  voiceNoteUrls?: string[] | null;
}

function VoiceNotePlayer({ url }: { url: string }) {
  const [playing, setPlaying] = useState(false);
  const [audio] = useState(() => typeof Audio !== "undefined" ? new Audio(url) : null);

  if (!audio) return null;

  audio.onended = () => setPlaying(false);

  const toggle = () => {
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      void audio.play();
      setPlaying(true);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-zinc-200 bg-white hover:bg-zinc-50 text-xs"
    >
      {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
      <Mic className="w-3 h-3 text-muted-foreground" />
      <span>Voice note</span>
    </button>
  );
}

export function ReturnContextBanner({
  feedbackStatus,
  tripNumber,
  notes,
  measurementDiffs,
  optionsChecklist,
  photoUrls,
  voiceNoteUrls,
}: ReturnContextProps) {
  if (!feedbackStatus) return null;

  const isRedo = feedbackStatus === "needs_redo";
  const label = isRedo ? "Redo Required" : "Repair Required";
  const tripLabel = tripNumber && tripNumber > 1 ? `Trip ${tripNumber}` : null;

  // Strip any "QC Fail:" lines (that's QC context, not customer feedback).
  // Keep the rest verbatim — staff may type multi-line notes and we don't want
  // to drop context.
  const feedbackNote = notes
    ?.split("\n")
    .filter((l) => !l.trim().startsWith("QC Fail:"))
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" • ") || null;

  // Workshop-actionable measurement errors: drop customer_request (already propagated)
  const actionableMeasurementDiffs = (measurementDiffs ?? []).filter(
    (d) => d.reason !== "customer_request" && d.reason !== "Customer Request",
  );

  // Rejected style options only — and drop rows where the "fix" equals the
  // original value (historical data before the save-path fix). For
  // smallTabaggi, a rejection is always a flip, so keep it.
  const rejectedOptions = (optionsChecklist ?? []).filter((o) => {
    const mainReal =
      o.rejected &&
      (o.option_name === "smallTabaggi" ||
        (!!o.new_value && o.new_value !== o.expected_value));
    const hashwaReal = o.hashwa_rejected && !!o.hashwa_new_value;
    return mainReal || hashwaReal;
  });

  const hasPhotos = (photoUrls?.length ?? 0) > 0;
  const hasVoice = (voiceNoteUrls?.length ?? 0) > 0;

  const tone = isRedo
    ? { border: "border-red-200", bg: "bg-red-50", accent: "text-red-700", body: "text-red-600", iconAccent: "text-red-500" }
    : { border: "border-amber-200", bg: "bg-amber-50", accent: "text-amber-700", body: "text-amber-600", iconAccent: "text-amber-500" };

  return (
    <div className={cn("rounded-lg border px-3 py-2.5 space-y-2.5", tone.border, tone.bg)}>
      <div className="flex items-center gap-2">
        <RotateCcw className={cn("w-3.5 h-3.5 shrink-0", tone.iconAccent)} />
        <span className={cn("text-xs font-bold uppercase tracking-wider", tone.accent)}>
          {label}
        </span>
        {tripLabel && (
          <span className={cn("text-xs font-medium ml-auto", tone.iconAccent)}>
            {tripLabel}
          </span>
        )}
      </div>

      {feedbackNote && (
        <p className={cn("text-xs line-clamp-2", tone.body)}>"{feedbackNote}"</p>
      )}

      {actionableMeasurementDiffs.length > 0 && (
        <div className="rounded-md border border-white/60 bg-white/70 px-2.5 py-2 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Ruler className={cn("w-3 h-3", tone.iconAccent)} />
            <span className={cn("text-[11px] font-bold uppercase tracking-wider", tone.accent)}>
              Measurement Errors
            </span>
          </div>
          <ul className="space-y-1">
            {actionableMeasurementDiffs.map((d, i) => {
              const fieldLabel = MEASUREMENT_FIELD_LABELS[d.field] ?? d.field;
              const diff = d.difference != null ? (d.difference > 0 ? `+${d.difference}` : `${d.difference}`) : null;
              return (
                <li key={`${d.field}-${i}`} className="text-xs leading-tight">
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="font-medium text-foreground">{fieldLabel}</span>
                    <span className="text-muted-foreground">
                      {d.original_value ?? "—"} → <span className="font-semibold text-foreground">{d.actual_value ?? "—"}</span>
                    </span>
                    {diff && (
                      <span className={cn("text-[10px] font-bold px-1 rounded bg-white border", tone.accent)}>
                        {diff}
                      </span>
                    )}
                    {d.reason && (
                      <span className="text-[10px] text-muted-foreground italic">
                        ({d.reason.replace(/_/g, " ")})
                      </span>
                    )}
                  </div>
                  {d.notes && (
                    <p className="text-[11px] text-muted-foreground pl-1 mt-0.5">— {d.notes}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {rejectedOptions.length > 0 && (
        <div className="rounded-md border border-white/60 bg-white/70 px-2.5 py-2 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Shirt className={cn("w-3 h-3", tone.iconAccent)} />
            <span className={cn("text-[11px] font-bold uppercase tracking-wider", tone.accent)}>
              Style Errors
            </span>
          </div>
          <ul className="space-y-1">
            {rejectedOptions.map((o, i) => {
              const label = OPTION_LABELS[o.option_name] ?? o.option_name;
              return (
                <li key={`${o.option_name}-${i}`} className="text-xs leading-tight">
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="font-medium text-foreground">{label}</span>
                    {o.rejected && (
                      <span className="text-muted-foreground">
                        {o.expected_value ?? "—"} → <span className="font-semibold text-foreground">{o.new_value ?? "fix"}</span>
                      </span>
                    )}
                    {o.hashwa_rejected && (
                      <span className="text-muted-foreground">
                        (hashwa) → <span className="font-semibold text-foreground">{o.hashwa_new_value ?? "fix"}</span>
                      </span>
                    )}
                  </div>
                  {o.notes && (
                    <p className="text-[11px] text-muted-foreground pl-1 mt-0.5">— {o.notes}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {(hasPhotos || hasVoice) && (
        <div className="rounded-md border border-white/60 bg-white/70 px-2.5 py-2 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <ImageIcon className={cn("w-3 h-3", tone.iconAccent)} />
            <span className={cn("text-[11px] font-bold uppercase tracking-wider", tone.accent)}>
              Attachments
            </span>
          </div>
          {hasPhotos && (
            <div className="flex flex-wrap gap-1.5">
              {photoUrls!.map((url, i) => (
                <a
                  key={`${url}-${i}`}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-14 h-14 rounded-md overflow-hidden border border-zinc-200 bg-white hover:opacity-80"
                >
                  <img src={url} alt={`Feedback ${i + 1}`} className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          )}
          {hasVoice && (
            <div className="flex flex-wrap gap-1.5">
              {voiceNoteUrls!.map((url, i) => (
                <VoiceNotePlayer key={`${url}-${i}`} url={url} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── FlowStageSelector ──────────────────────────────────────────────────────

export function FlowStageSelector({
  steps,
  selectedStages,
  onToggle,
  workerHistory,
  showQcLocked = true,
  lockedKeys,
}: {
  steps: readonly (PlanStep & { historyKey?: string })[];
  selectedStages: Set<string>;
  onToggle: (key: string) => void;
  workerHistory?: Record<string, string> | null;
  showQcLocked?: boolean;
  lockedKeys?: Set<string>;
}) {
  const locked = lockedKeys ?? new Set<string>();
  // Build the flow summary: selected stages in order + QC
  const flowLabels = useMemo(() => {
    const labels: string[] = [];
    for (const step of steps) {
      if (selectedStages.has(step.key)) labels.push(step.label);
    }
    if (showQcLocked) labels.push("QC");
    return labels;
  }, [steps, selectedStages, showQcLocked]);

  return (
    <div className="space-y-1.5">
      <div className="space-y-1">
        {steps.map((step) => {
          const Icon = step.icon;
          const isSelected = selectedStages.has(step.key);
          const isLocked = locked.has(step.key);
          // worker_history uses plan keys (soaker, sewer, …) — try plan key first, fall back to historyKey
          const previousWorker = workerHistory?.[step.key] ?? workerHistory?.[step.historyKey ?? step.key];

          return (
            <button
              key={step.key}
              type="button"
              onClick={() => !isLocked && onToggle(step.key)}
              disabled={isLocked}
              aria-pressed={isSelected}
              title={isLocked ? "Stage already done or in progress" : undefined}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all text-left",
                isLocked
                  ? "border-transparent bg-zinc-100/60 opacity-60 cursor-not-allowed"
                  : isSelected
                    ? "border-primary/50 bg-primary/5 shadow-sm"
                    : "border-transparent bg-zinc-50 hover:bg-zinc-100",
              )}
            >
              <div className={cn(
                "w-6 h-6 rounded-md flex items-center justify-center shrink-0",
                isSelected ? step.accent + " text-white" : "bg-zinc-200/60",
              )}>
                {isSelected
                  ? <Check className="w-3.5 h-3.5" />
                  : <Icon className={cn("w-3.5 h-3.5", step.color)} />
                }
              </div>
              <div className="flex-1 min-w-0">
                <span className={cn("text-sm font-medium", isSelected ? "text-foreground" : "text-muted-foreground")}>
                  {step.label}
                </span>
                {previousWorker && (
                  <span className="text-xs text-muted-foreground ml-1.5">
                    ({previousWorker})
                  </span>
                )}
              </div>
              {isLocked && (
                <Lock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              )}
              {!isLocked && isSelected && (
                <Check className="w-4 h-4 text-primary shrink-0" />
              )}
            </button>
          );
        })}

        {/* QC — always locked on */}
        {showQcLocked && (
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-indigo-200/60 bg-indigo-50/50">
            <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-indigo-100">
              <IconRosette className="w-3.5 h-3.5 text-indigo-500" />
            </div>
            <span className="text-sm font-medium text-indigo-700">Quality Check</span>
            <Lock className="w-3.5 h-3.5 text-indigo-400 ml-auto" />
          </div>
        )}
      </div>

      {/* Flow summary */}
      {flowLabels.length > 1 && (
        <div className="flex items-center gap-1 px-1 pt-1">
          <span className="text-xs font-medium text-muted-foreground">Flow:</span>
          {flowLabels.map((label, i) => (
            <span key={label} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/50" />}
              <span className="text-xs font-semibold text-foreground">{label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── WorkerHistoryChips (for QC fail page) ──────────────────────────────────

export function WorkerHistoryChips({
  steps,
  workerHistory,
}: {
  steps: readonly (PlanStep & { historyKey?: string })[];
  workerHistory: Record<string, string> | null | undefined;
}) {
  if (!workerHistory) return null;

  const entries = steps
    .map((step) => ({
      step,
      worker: workerHistory[step.key] ?? workerHistory[step.historyKey ?? step.key],
    }))
    .filter((e) => e.worker);

  if (entries.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1.5">Who worked on this</p>
      <div className="flex flex-wrap gap-1.5">
        {entries.map(({ step, worker }) => {
          const Icon = step.icon;
          return (
            <div
              key={step.key}
              className="inline-flex items-center gap-1.5 border border-zinc-200 bg-zinc-50 rounded-lg px-2.5 py-1.5"
            >
              <Icon className={cn("w-3.5 h-3.5 shrink-0", step.color)} />
              <div className="text-xs leading-tight">
                <span className="text-muted-foreground">{step.label}</span>
                <span className="font-semibold text-foreground ml-1">{worker}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
