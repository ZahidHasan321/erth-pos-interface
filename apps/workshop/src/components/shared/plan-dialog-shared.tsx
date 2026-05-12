import { useEffect, useMemo, useState } from "react";
import { Check, Lock, RotateCcw, ArrowRight, Ruler, Shirt, Image as ImageIcon, Mic, Play, Pause, XCircle } from "lucide-react";
import { useWorkshopWorkload } from "@/hooks/useWorkshopGarments";
import { cn, formatDate } from "@/lib/utils";
import { STYLE_IMAGE_MAP, THICKNESS_LABELS } from "@/lib/style-images";
import type { ProductionPlan, QcAttempt, TripHistoryEntry } from "@repo/database";
import { getQcReturnStages, getLabel as getMeasurementLabel } from "@repo/database";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PlanStep {
  key: string;
  label: string;
  responsibility: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Key used in worker_history when different from `key` (used by rework mode). */
  historyKey?: string;
  /** bg class for the segmented progress indicator when this stage is filled. */
  accentBg: string;
}

export interface WorkerResource {
  id: string;
  resource_name: string;
  resource_type?: string | null;
  daily_target?: number | null;
  responsibility?: string | null;
  unit?: string | null;
}

// ── Workload hook + helpers ──────────────────────────────────────────────────

/** Compute per-step workload: plan-key → worker name → garment count */
export function useStepWorkload(steps: readonly { key: string }[]) {
  const { data: allGarments = [] } = useWorkshopWorkload();

  return useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const step of steps) map[step.key] = {};
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

/** Sort: free first, then by load ascending, overloaded last */
export function sortWorkersByLoad(workers: WorkerResource[], stepWorkload: Record<string, number>): WorkerResource[] {
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

/** Status-token class for a load/capacity pair. */
function loadToneClass(load: number, capacity: number): string {
  if (capacity <= 0) return load > 0 ? "text-[var(--status-info)]" : "text-muted-foreground";
  if (load >= capacity) return "text-[var(--status-bad)]";
  if (load / capacity > 0.6) return "text-[var(--status-warn)]";
  return load > 0 ? "text-[var(--status-info)]" : "text-[var(--status-ok)]";
}

// ── AssignmentChip ───────────────────────────────────────────────────────────
// One chip = one selectable assignment. Used for both workers and sewing units.

interface AssignmentChipProps {
  label: string;
  isSelected: boolean;
  load?: number;
  capacity?: number;
  isSenior?: boolean;
  onSelect: () => void;
}

export function AssignmentChip({ label, isSelected, load, capacity, isSenior, onSelect }: AssignmentChipProps) {
  const hasLoad = load !== undefined && capacity !== undefined;
  const loadText = hasLoad ? (capacity! > 0 ? `${load}/${capacity}` : `${load}`) : null;
  const loadClass = hasLoad ? loadToneClass(load!, capacity!) : "";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={cn(
        "inline-flex items-center gap-1.5 border rounded-md px-2.5 py-1.5 text-sm transition-colors cursor-pointer touch-manipulation pointer-coarse:active:scale-[0.98]",
        isSelected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:bg-muted",
      )}
    >
      {isSelected && <Check className="w-3 h-3 shrink-0" />}
      <span className="truncate max-w-[140px]">{label}</span>
      {isSenior && (
        <span className={cn("text-xs", isSelected ? "text-primary-foreground/70" : "text-muted-foreground")}>
          Sr
        </span>
      )}
      {loadText && (
        <span className={cn("text-xs tabular-nums", isSelected ? "text-primary-foreground/80" : loadClass)}>
          {loadText}
        </span>
      )}
    </button>
  );
}

// ── StageRow ─────────────────────────────────────────────────────────────────
// Single unified row for the plan list. Handles:
//  - Toggle (rework mode): check off / on
//  - Filled view: shows assigned worker/unit + load
//  - Editing view: expanded chip picker
//  - Locked view: lock icon + label, no interaction
//  - QC always-required hint when locked-on (rework mode)

interface StageRowProps {
  step: PlanStep;
  /** Selection state — only relevant when `toggleable` */
  isSelected?: boolean;
  toggleable?: boolean;
  onToggle?: () => void;
  /** Locked — already done/in-progress this trip */
  isLocked?: boolean;
  /** Currently assigned value (worker name OR unit name for sewing) */
  assignedValue?: string;
  /** Previous-trip worker name (rework hint) */
  previousWorker?: string;
  /** Sewing rows pick units, not workers. */
  isSewing?: boolean;
  /** Step workload map (resource_name → count) */
  stepWorkload: Record<string, number>;
  /** Resources for this step (already filtered to its responsibility) */
  resources: WorkerResource[];
  /** Distinct unit names for sewing rows */
  units?: string[];
  /** Called when user picks a worker (or unit for sewing) */
  onAssign: (value: string) => void;
}

export function StageRow({
  step,
  isSelected = true,
  toggleable = false,
  onToggle,
  isLocked = false,
  assignedValue,
  previousWorker,
  isSewing = false,
  stepWorkload,
  resources,
  units = [],
  onAssign,
}: StageRowProps) {
  const Icon = step.icon;
  const isFilled = !!assignedValue;
  const selectedWorker = !isSewing ? resources.find((r) => r.resource_name === assignedValue) : null;
  const showPicker = isSelected && !isLocked;

  return (
    <div
      className={cn(
        "rounded-md border bg-card transition-colors",
        isLocked && "opacity-60",
        !isSelected && toggleable && "border-dashed bg-muted/30",
        isSelected && !isLocked && "border-border",
      )}
    >
      {/* Header — informational only. Selection toggle on the left when toggleable. */}
      <div className="flex items-center gap-3 px-3 py-2">
        {toggleable ? (
          <button
            type="button"
            disabled={isLocked}
            onClick={onToggle}
            aria-pressed={isSelected}
            className={cn(
              "w-5 h-5 rounded-md border flex items-center justify-center shrink-0",
              isLocked
                ? "border-border bg-muted cursor-not-allowed"
                : isSelected
                  ? "border-primary bg-primary text-primary-foreground cursor-pointer"
                  : "border-border bg-card hover:bg-muted cursor-pointer",
            )}
          >
            {isSelected && <Check className="w-3 h-3" />}
          </button>
        ) : null}

        <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base text-foreground">{step.label}</span>
            {isLocked && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Lock className="w-3 h-3" /> in progress
              </span>
            )}
            {previousWorker && !isFilled && isSelected && (
              <span className="text-sm text-muted-foreground">previously {previousWorker}</span>
            )}
          </div>
        </div>

        {/* Right-side: workload number for selected worker. Lives in header so
            row height stays the same whether assigned or not. */}
        {isFilled && selectedWorker && (selectedWorker.daily_target ?? 0) > 0 && (
          <span
            className={cn(
              "text-sm tabular-nums shrink-0",
              loadToneClass(stepWorkload[assignedValue!] ?? 0, selectedWorker.daily_target ?? 0),
            )}
          >
            {stepWorkload[assignedValue!] ?? 0}/{selectedWorker.daily_target}
          </span>
        )}
      </div>

      {/* Picker — always visible when row is selected & not locked. Tapping a
          chip assigns immediately; tapping the assigned chip clears it. */}
      {showPicker && (
        <div className="px-3 pb-2.5 -mt-1">
          {isSewing ? (
            units.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No sewing units configured</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {units.map((u) => (
                  <AssignmentChip
                    key={u}
                    label={u}
                    isSelected={assignedValue === u}
                    onSelect={() => onAssign(assignedValue === u ? "" : u)}
                  />
                ))}
              </div>
            )
          ) : resources.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No workers available</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {sortWorkersByLoad(resources, stepWorkload).map((r) => (
                <AssignmentChip
                  key={r.id}
                  label={r.resource_name}
                  isSelected={assignedValue === r.resource_name}
                  load={stepWorkload[r.resource_name] ?? 0}
                  capacity={r.daily_target ?? 0}
                  isSenior={r.resource_type === "Senior"}
                  onSelect={() => onAssign(assignedValue === r.resource_name ? "" : r.resource_name)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Locked rows: show assigned worker as static text (no picker). */}
      {isLocked && isFilled && (
        <div className="px-3 pb-2.5 -mt-1 text-sm text-muted-foreground">
          {assignedValue}
        </div>
      )}
    </div>
  );
}

// ── Stage chip (used in QC fail return-stage picker) ────────────────────────

interface StageChipProps {
  label: string;
  isSelected: boolean;
  onClick: () => void;
}

export function StageChip({ label, isSelected, onClick }: StageChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm transition-colors",
        isSelected
          ? "border-[var(--status-bad)] bg-[var(--status-bad-bg)] text-[var(--status-bad)]"
          : "border-border bg-card text-foreground hover:bg-muted",
      )}
    >
      {isSelected && <Check className="w-3 h-3" />}
      {label}
    </button>
  );
}

// ── Rework context banner ────────────────────────────────────────────────────
// Combines QC-fail (from trip_history) and customer-feedback (from
// garment_feedback). Flat layout — no nested cards.

const STAGE_LABELS: Record<string, string> = {
  soaking: "Soaking",
  cutting: "Cutting",
  post_cutting: "Post-Cutting",
  sewing: "Sewing",
  finishing: "Finishing",
  ironing: "Ironing",
  quality_check: "Quality Check",
};

// Label resolver — derives from the measurement spec so every key (basma,
// jabzour, hemming, etc.) flows through automatically. Falls back to the
// raw key if the spec has no entry (defensive — shouldn't happen).
const labelForMeasurementField = (key: string): string => getMeasurementLabel(key);

const OPTION_LABELS: Record<string, string> = {
  collar: "Collar Type",
  collarBtn: "Collar Button",
  frontPocket: "Front Pocket",
  cuff: "Cuffs",
  jabzour: "Jabzour",
  smallTabaggi: "Small Tabaggi",
};

export interface MeasurementDiff {
  field: string;
  original_value?: number | null;
  actual_value?: number | string | null;
  difference?: number | null;
  reason?: string | null;
  notes?: string | null;
}

export interface OptionCheck {
  option_name: string;
  expected_value?: string | null;
  actual_correct?: boolean;
  rejected?: boolean;
  new_value?: string | null;
  hashwa_rejected?: boolean;
  hashwa_new_value?: string | null;
  notes?: string | null;
}

function parseTripHistory(raw: unknown): TripHistoryEntry[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as TripHistoryEntry[];
  if (typeof raw !== "string") return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? (v as TripHistoryEntry[]) : []; } catch { return []; }
}

function StyleOptionChip({ styleKey }: { styleKey: string | null | undefined }) {
  const key = String(styleKey ?? "");
  const mapped = key ? STYLE_IMAGE_MAP[key] : null;
  const label = mapped?.label ?? key ?? "—";
  return (
    <span className="inline-flex items-center gap-1">
      {mapped?.image ? (
        <img
          src={mapped.image}
          alt={label}
          title={label}
          className="h-6 w-6 object-contain rounded-md border border-border bg-card"
        />
      ) : null}
      <span className="text-foreground">{label}</span>
    </span>
  );
}

function VoiceNotePlayer({ url }: { url: string }) {
  const [playing, setPlaying] = useState(false);
  const [audio] = useState(() => typeof Audio !== "undefined" ? new Audio(url) : null);

  useEffect(() => {
    if (!audio) return;
    const onEnded = () => setPlaying(false);
    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, [audio]);

  if (!audio) return null;

  const toggle = () => {
    if (playing) { audio.pause(); setPlaying(false); }
    else { void audio.play(); setPlaying(true); }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-card hover:bg-muted text-sm"
    >
      {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
      <Mic className="w-3 h-3 text-muted-foreground" />
      <span>Voice note</span>
    </button>
  );
}

export interface ReworkContext {
  /** Customer feedback */
  feedbackStatus?: "needs_repair" | "needs_redo" | string | null;
  tripNumber?: number | null;
  feedbackNotes?: string | null;
  measurementDiffs?: MeasurementDiff[] | null;
  optionsChecklist?: OptionCheck[] | null;
  photoUrls?: string[] | null;
  voiceNoteUrls?: string[] | null;
  /** QC fail (current trip's trip_history) */
  tripHistory?: TripHistoryEntry[] | string | null;
}

export function ReworkContextBanner(ctx: ReworkContext) {
  const history = parseTripHistory(ctx.tripHistory);
  const qcEntry = ctx.tripNumber ? history.find((t) => t.trip === ctx.tripNumber) : null;
  const qcFails: QcAttempt[] = (qcEntry?.qc_attempts ?? []).filter((a) => a.result === "fail");
  const hasQcFail = qcFails.length > 0;
  const hasFeedback = !!ctx.feedbackStatus;

  if (!hasQcFail && !hasFeedback) return null;

  return (
    <div className="space-y-2">
      {hasQcFail && <QcFailFlat fails={qcFails} />}
      {hasFeedback && <FeedbackFlat ctx={ctx} />}
    </div>
  );
}

function QcFailFlat({ fails }: { fails: QcAttempt[] }) {
  const latest = fails[fails.length - 1];
  const failCount = fails.length;
  const stages = getQcReturnStages(latest);

  return (
    <div className="rounded-md border border-[color:var(--status-bad)]/30 bg-[var(--status-bad-bg)] px-3 py-2.5">
      <div className="flex items-center gap-2 text-[var(--status-bad)]">
        <XCircle className="w-4 h-4 shrink-0" />
        <span className="text-sm font-medium">QC failed{failCount > 1 ? ` ×${failCount}` : ""}</span>
        {latest.date && <span className="text-sm ml-auto">{formatDate(latest.date)}</span>}
      </div>

      <dl className="mt-1.5 space-y-1 text-sm">
        {latest.inspector && (
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Inspector</dt>
            <dd className="text-foreground">{latest.inspector}</dd>
          </div>
        )}
        {stages.length > 0 && (
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Return to</dt>
            <dd className="text-foreground">{stages.map((s) => STAGE_LABELS[s] ?? s).join(" → ")}</dd>
          </div>
        )}
        {latest.fail_reason && (
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Reason</dt>
            <dd className="text-foreground">{latest.fail_reason}</dd>
          </div>
        )}
        {latest.ratings && Object.keys(latest.ratings).length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <dt className="text-muted-foreground">Ratings</dt>
            <dd className="text-foreground flex flex-wrap gap-x-3 gap-y-0.5">
              {Object.entries(latest.ratings).map(([k, v]) => (
                <span key={k}>
                  <span className="text-muted-foreground">{k}</span>{" "}
                  <span className="tabular-nums">{v}</span>
                </span>
              ))}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function FeedbackFlat({ ctx }: { ctx: ReworkContext }) {
  const isRedo = ctx.feedbackStatus === "needs_redo";
  const label = isRedo ? "Redo required" : "Repair required";
  const tone = isRedo
    ? "border-[color:var(--status-bad)]/30 bg-[var(--status-bad-bg)] text-[var(--status-bad)]"
    : "border-[color:var(--status-warn)]/30 bg-[var(--status-warn-bg)] text-[var(--status-warn)]";

  const feedbackNote = ctx.feedbackNotes
    ?.split("\n")
    .filter((l) => !l.trim().startsWith("QC Fail:"))
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" • ") || null;

  const measurementDiffs = ctx.measurementDiffs ?? [];
  const rejectedOptions = (ctx.optionsChecklist ?? []).filter((o) => {
    const mainReal = o.rejected && (o.option_name === "smallTabaggi" || (!!o.new_value && o.new_value !== o.expected_value));
    const hashwaReal = o.hashwa_rejected && !!o.hashwa_new_value;
    return mainReal || hashwaReal;
  });
  const photoUrls = ctx.photoUrls ?? [];
  const voiceNoteUrls = ctx.voiceNoteUrls ?? [];

  return (
    <div className={cn("rounded-md border px-3 py-2.5 space-y-2", tone)}>
      <div className="flex items-center gap-2">
        <RotateCcw className="w-4 h-4 shrink-0" />
        <span className="text-sm font-medium">{label}</span>
        {ctx.tripNumber && ctx.tripNumber > 1 && (
          <span className="text-sm ml-auto">Trip {ctx.tripNumber}</span>
        )}
      </div>

      {feedbackNote && (
        <p className="text-sm text-foreground/90 line-clamp-2 italic">"{feedbackNote}"</p>
      )}

      {measurementDiffs.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1 text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 text-sm">
              <Ruler className="w-3 h-3" />
              Measurements
            </span>
            <span className="text-sm">Made → Change to</span>
          </div>
          <ul className="space-y-0.5 text-sm">
            {measurementDiffs.map((d, i) => {
              const fieldLabel = labelForMeasurementField(d.field);
              const diff = d.difference != null ? (d.difference > 0 ? `+${d.difference}` : `${d.difference}`) : null;
              return (
                <li key={`${d.field}-${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-foreground flex-1 min-w-0">{fieldLabel}</span>
                  <span className="tabular-nums text-muted-foreground">{d.original_value ?? "—"}</span>
                  <ArrowRight className="w-3 h-3 shrink-0" />
                  <span className="tabular-nums text-foreground">{d.actual_value ?? "—"}</span>
                  {diff && <span className="tabular-nums">({diff})</span>}
                  {d.reason && <span className="text-muted-foreground italic">{d.reason.replace(/_/g, " ")}</span>}
                  {d.notes && <span className="text-muted-foreground basis-full pl-2">— {d.notes}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {rejectedOptions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1 text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 text-sm">
              <Shirt className="w-3 h-3" />
              Style
            </span>
            <span className="text-sm">Made → Change to</span>
          </div>
          <ul className="space-y-1 text-sm">
            {rejectedOptions.map((o, i) => {
              const label = OPTION_LABELS[o.option_name] ?? o.option_name;
              const isSmallTabaggi = o.option_name === "smallTabaggi";
              const tabaggiAction = o.expected_value === "Yes" ? "Remove" : "Add";
              return (
                <li key={`${o.option_name}-${i}`} className="flex items-center gap-2 flex-wrap">
                  <span className="text-foreground flex-1 min-w-0">{label}</span>
                  {o.rejected && (
                    isSmallTabaggi ? (
                      <span className="text-foreground">{tabaggiAction}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 flex-wrap">
                        <span className="text-muted-foreground"><StyleOptionChip styleKey={o.expected_value} /></span>
                        <ArrowRight className="w-3 h-3 shrink-0" />
                        {o.new_value ? <StyleOptionChip styleKey={o.new_value} /> : <span className="italic text-muted-foreground">fix</span>}
                      </span>
                    )
                  )}
                  {o.hashwa_rejected && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-muted-foreground">hashwa</span>
                      <ArrowRight className="w-3 h-3 shrink-0" />
                      <span className="text-foreground">
                        {o.hashwa_new_value ? (THICKNESS_LABELS[o.hashwa_new_value] ?? o.hashwa_new_value) : "fix"}
                      </span>
                    </span>
                  )}
                  {o.notes && <span className="text-muted-foreground basis-full pl-2">— {o.notes}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {(photoUrls.length > 0 || voiceNoteUrls.length > 0) && (
        <div>
          <div className="flex items-center gap-1.5 mb-1 text-muted-foreground">
            <ImageIcon className="w-3 h-3" />
            <span className="text-sm">Attachments</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {photoUrls.map((url, i) => (
              <a
                key={`${url}-${i}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-12 h-12 rounded-md overflow-hidden border border-border bg-card hover:opacity-80"
              >
                <img src={url} alt={`Feedback ${i + 1}`} className="w-full h-full object-cover" />
              </a>
            ))}
            {voiceNoteUrls.map((url, i) => (
              <VoiceNotePlayer key={`${url}-${i}`} url={url} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
