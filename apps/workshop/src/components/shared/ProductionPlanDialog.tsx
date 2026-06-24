import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@repo/ui/dialog";
import { Button } from "@repo/ui/button";
import { Label } from "@repo/ui/label";
import { DatePicker } from "@repo/ui/date-picker";
import { Loader2, Scissors } from "lucide-react";
import { IconNeedle, IconIroning1, IconRosette, IconSparkles } from "@tabler/icons-react";

import { useResources } from "@/hooks/useResources";
import { getFeedbackByGarmentAndTrip } from "@/api/feedback";
import { cn, getLocalDateStr, pickedDayStr } from "@/lib/utils";
import type { TripHistoryEntry } from "@repo/database";

import {
  useStepWorkload,
  StageRow,
  ReworkContextBanner,
  type PlanStep,
  type MeasurementDiff,
  type OptionCheck,
} from "./plan-dialog-shared";

// ── Step catalogs ───────────────────────────────────────────────────────────

// Per-stage accent for the segmented progress bar. Each stage gets a distinct
// hue so a glance at the bar tells which steps are set without reading labels.
// Color is intentionally constrained to this one element — icons and rows stay
// neutral so the row content carries hierarchy by typography, not by chroma.
const NEW_STEPS: PlanStep[] = [
  { key: "cutter",          label: "Cutting",       responsibility: "cutting",       icon: Scissors,     historyKey: "cutting",         accentBg: "bg-amber-600" },
  // post_cutting temp disabled
  { key: "sewer",           label: "Sewing",        responsibility: "sewing",        icon: IconNeedle,   historyKey: "sewing",          accentBg: "bg-violet-600" },
  { key: "finisher",        label: "Finishing",     responsibility: "finishing",     icon: IconSparkles, historyKey: "finishing",       accentBg: "bg-emerald-600" },
  { key: "ironer",          label: "Ironing",       responsibility: "ironing",       icon: IconIroning1, historyKey: "ironing",         accentBg: "bg-orange-600" },
  { key: "quality_checker", label: "Quality Check", responsibility: "quality_check", icon: IconRosette,  historyKey: "quality_checker", accentBg: "bg-indigo-600" },
];

// Rework re-enters the linear pipeline only. Soaking is a parallel track
// (soaking flag + soak terminal, group-scoped — no per-worker assignment), not
// a piece_stage: offering it as a re-entry stage would set piece_stage='soaking'
// and orphan the garment (no pipeline terminal advances a soaking piece_stage).
const REWORK_STEPS: PlanStep[] = [...NEW_STEPS];

const QC_KEY = "quality_checker";

// ── Props ────────────────────────────────────────────────────────────────────

interface CommonProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Same signature for both modes. `unit` is legacy and always undefined now. */
  onConfirm: (plan: Record<string, string>, date: string, unit?: string, reentryStage?: string, deliveryDate?: string) => void;
  garmentCount?: number;
  defaultDate?: string;
  title?: string;
  confirmLabel?: string;
  isPending?: boolean;
  /** Plan keys already done or in-progress this trip — render as locked. */
  lockedSteps?: Set<string>;
}

interface NewModeProps extends CommonProps {
  mode: "new";
  defaultPlan?: Record<string, string> | null;
  /** Show delivery date field — for per-garment editing */
  showDeliveryDate?: boolean;
  defaultDeliveryDate?: string;
}

interface ReworkModeProps extends CommonProps {
  mode: "rework";
  /** Previous workers from worker_history, keyed by plan key (soaker, cutter, …) */
  workerHistory?: Record<string, string> | null;
  feedbackStatus?: "needs_repair" | "needs_redo" | string | null;
  tripNumber?: number | null;
  feedbackNotes?: string | null;
  garmentId?: string | null;
  tripHistory?: TripHistoryEntry[] | string | null;
}

export type ProductionPlanDialogProps = NewModeProps | ReworkModeProps;

// ── Component ───────────────────────────────────────────────────────────────

export function ProductionPlanDialog(props: ProductionPlanDialogProps) {
  const {
    open, onOpenChange, onConfirm, garmentCount, defaultDate,
    title, confirmLabel, isPending, lockedSteps,
  } = props;

  const isRework = props.mode === "rework";
  const STEPS = isRework ? REWORK_STEPS : NEW_STEPS;
  const locked = lockedSteps ?? new Set<string>();

  const { data: resources = [] } = useResources();
  const workload = useStepWorkload(STEPS);

  // Customer feedback (rework only)
  const reworkProps = isRework ? (props as ReworkModeProps) : null;
  const priorTrip = reworkProps?.tripNumber && reworkProps.tripNumber > 1 ? reworkProps.tripNumber - 1 : null;
  const shouldFetchFeedback = open && isRework && !!reworkProps?.garmentId && !!priorTrip && !!reworkProps?.feedbackStatus;
  const { data: priorFeedback } = useQuery({
    queryKey: ["garment-feedback", reworkProps?.garmentId, priorTrip],
    queryFn: () => getFeedbackByGarmentAndTrip(reworkProps!.garmentId!, priorTrip!),
    enabled: shouldFetchFeedback,
    staleTime: 60_000,
  });

  const parsedJson = <T,>(raw: unknown): T | null => {
    if (!raw) return null;
    if (typeof raw !== "string") return raw as T;
    try { return JSON.parse(raw) as T; } catch { return null; }
  };
  const measurementDiffs = parsedJson<MeasurementDiff[]>(priorFeedback?.measurement_diffs);
  const optionsChecklist = parsedJson<OptionCheck[]>(priorFeedback?.options_checklist);
  const photoUrlsRaw = parsedJson<unknown>(priorFeedback?.photo_urls);
  const voiceUrlsRaw = parsedJson<unknown>(priorFeedback?.voice_note_urls);
  const photoUrls = Array.isArray(photoUrlsRaw)
    ? (photoUrlsRaw as Array<string | { url?: string }>)
        .map((p) => (typeof p === "string" ? p : p?.url))
        .filter((u): u is string => !!u)
    : null;
  const voiceNoteUrls = Array.isArray(voiceUrlsRaw)
    ? (voiceUrlsRaw as unknown[]).filter((v): v is string => typeof v === "string")
    : null;

  // Per-step distinct units (for sewing assignment, also for filtering other stages by unit)
  const stepUnits = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const step of STEPS) {
      const set = new Set<string>();
      for (const r of resources) {
        if (r.responsibility === step.responsibility && r.unit) set.add(r.unit);
      }
      map[step.key] = Array.from(set).sort();
    }
    return map;
  }, [resources, STEPS]);

  // ── State ───────────────────────────────────────────────────────────────────
  // - `plan`: per-step assigned value (worker name OR unit name for sewing)
  // - `selectedStages` (rework only): which stages user wants to redo. New mode: all required.
  // - `date`: assigned date
  // - `deliveryDate`: only in new mode + when showDeliveryDate

  const [plan, setPlan] = useState<Record<string, string>>({});
  const [selectedStages, setSelectedStages] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(defaultDate ?? getLocalDateStr());
  const newProps = !isRework ? (props as NewModeProps) : null;
  const [deliveryDate, setDeliveryDate] = useState(newProps?.defaultDeliveryDate ?? "");

  // Active worker history — filtered to resources that still exist with the right responsibility
  const activeHistoryPlan = useMemo(() => {
    if (!isRework || !reworkProps?.workerHistory) return {};
    const filtered: Record<string, string> = {};
    for (const step of STEPS) {
      // worker_history is keyed by plan key (soaker, sewer, …); fall back to historyKey for safety
      const candidate = reworkProps.workerHistory[step.key] ?? reworkProps.workerHistory[step.historyKey ?? step.key];
      if (!candidate) continue;
      if (resources.some((r) => r.resource_name === candidate && r.responsibility === step.responsibility)) {
        filtered[step.key] = candidate;
      }
    }
    return filtered;
  }, [isRework, reworkProps?.workerHistory, resources, STEPS]);

  // ── Reset on open ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setDate(defaultDate ?? getLocalDateStr());

    if (isRework) {
      // Rework: nothing pre-selected; QC pinned + auto-filled from history.
      const initialPlan: Record<string, string> = {};
      if (activeHistoryPlan[QC_KEY]) initialPlan[QC_KEY] = activeHistoryPlan[QC_KEY];
      setPlan(initialPlan);
      setSelectedStages(new Set());
    } else {
      // New mode: all stages required. Pre-fill from defaultPlan; auto-fill single-unit sewing.
      const defaults = { ...(newProps?.defaultPlan ?? {}) };
      const sewingUnits = stepUnits["sewer"] ?? [];
      if (sewingUnits.length === 1 && !defaults["sewer"]) defaults["sewer"] = sewingUnits[0];
      setPlan(defaults);
      setSelectedStages(new Set(STEPS.map((s) => s.key)));
      setDeliveryDate(newProps?.defaultDeliveryDate ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const toggleStage = (key: string) => {
    if (locked.has(key)) return;
    setSelectedStages((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        setPlan((p) => { const n = { ...p }; delete n[key]; return n; });
      } else {
        next.add(key);
        // Auto-fill from history if available; otherwise leave empty for user
        if (isRework && activeHistoryPlan[key]) {
          setPlan((p) => ({ ...p, [key]: activeHistoryPlan[key] }));
        }
      }
      return next;
    });
  };

  const assignStep = (stepKey: string, value: string) => {
    setPlan((p) => {
      const n = { ...p };
      if (value) n[stepKey] = value;
      else delete n[stepKey];
      return n;
    });
  };

  // ── Validation ──────────────────────────────────────────────────────────────

  // Stages that need a worker assignment for this submit
  const requiredStageKeys = useMemo(() => {
    if (isRework) {
      // Selected stages + QC (always required)
      const set = new Set(selectedStages);
      set.add(QC_KEY);
      return set;
    }
    // New mode: every step (minus locked ones, which keep their existing value)
    return new Set(STEPS.map((s) => s.key));
  }, [isRework, selectedStages, STEPS]);

  const allRequiredFilled = useMemo(() => {
    for (const key of requiredStageKeys) {
      if (locked.has(key)) continue;
      if (!plan[key]) return false;
    }
    return true;
  }, [requiredStageKeys, plan, locked]);

  const hasAtLeastOneStage = !isRework || selectedStages.size > 0;
  const canSubmit = !!date && allRequiredFilled && hasAtLeastOneStage;

  // Re-entry stage: first selected stage in production order (rework only)
  const firstSelectedStage = useMemo(() => {
    if (!isRework) return undefined;
    for (const step of REWORK_STEPS) {
      if (step.key === QC_KEY) break;
      if (selectedStages.has(step.key)) return step.historyKey;
    }
    return "quality_check";
  }, [isRework, selectedStages]);

  const handleConfirm = () => {
    if (!canSubmit) return;
    const finalPlan: Record<string, string> = {};
    for (const key of requiredStageKeys) {
      if (plan[key]) finalPlan[key] = plan[key];
    }
    onConfirm(
      finalPlan,
      date,
      undefined,
      firstSelectedStage,
      newProps?.showDeliveryDate ? deliveryDate : undefined,
    );
    onOpenChange(false);
  };

  const filledCount = STEPS.filter((s) => requiredStageKeys.has(s.key) && !!plan[s.key]).length;
  const totalRequired = requiredStageKeys.size;
  const showDeliveryDate = !!newProps?.showDeliveryDate;
  const defaultTitle = isRework ? "Rework plan" : "Production plan";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-0 gap-0">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-card border-b border-border px-4 pt-4 pb-3 space-y-3">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">{title ?? defaultTitle}</DialogTitle>
          </DialogHeader>
          {garmentCount && (
            <p className="text-sm text-muted-foreground -mt-2">
              {garmentCount} garment{garmentCount !== 1 ? "s" : ""}
            </p>
          )}

          {/* Rework context */}
          {isRework && (
            <ReworkContextBanner
              feedbackStatus={reworkProps?.feedbackStatus}
              tripNumber={reworkProps?.tripNumber}
              feedbackNotes={priorFeedback?.notes ?? reworkProps?.feedbackNotes}
              measurementDiffs={measurementDiffs}
              optionsChecklist={optionsChecklist}
              photoUrls={photoUrls}
              voiceNoteUrls={voiceNoteUrls}
              tripHistory={reworkProps?.tripHistory}
            />
          )}

          {/* Dates */}
          <div className={cn("grid gap-3", showDeliveryDate ? "grid-cols-2" : "grid-cols-1")}>
            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">
                Assigned date <span className="text-[var(--status-bad)]">*</span>
              </Label>
              <DatePicker
                value={date}
                onChange={(d) => setDate(d ? pickedDayStr(d) : "")}
                className="h-9"
              />
            </div>
            {showDeliveryDate && (
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">Delivery date</Label>
                <DatePicker
                  value={deliveryDate}
                  onChange={(d) => setDeliveryDate(d ? pickedDayStr(d) : "")}
                  className="h-9"
                />
              </div>
            )}
          </div>

          {/* Segmented progress — one bar per visible step, lit in the stage's
              accent when assigned. Shows "what's set" at a glance, by stage. */}
          <div className="flex items-center gap-1.5">
            {STEPS.map((step) => {
              const isRequired = requiredStageKeys.has(step.key);
              const isFilled = isRequired && !!plan[step.key];
              return (
                <div
                  key={step.key}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-colors",
                    isFilled ? step.accentBg : isRequired ? "bg-muted" : "bg-muted/40",
                  )}
                  aria-label={`${step.label} ${isFilled ? "assigned" : isRequired ? "pending" : "skipped"}`}
                />
              );
            })}
            <span className="text-sm text-muted-foreground tabular-nums ml-1 shrink-0">
              {filledCount}/{totalRequired}
            </span>
          </div>
        </div>

        {/* Stage list */}
        <div className="px-4 py-3 space-y-1.5">
          {STEPS.map((step) => {
            const isSewing = step.key === "sewer";
            const isQc = step.key === QC_KEY;
            const isLocked = locked.has(step.key);
            const isToggleable = isRework && !isQc; // QC always on in rework
            const isSelected = isRework ? (selectedStages.has(step.key) || isQc) : true;

            const stepWorkers = resources.filter((r) => r.responsibility === step.responsibility);

            return (
              <StageRow
                key={step.key}
                step={step}
                isSelected={isSelected}
                toggleable={isToggleable}
                onToggle={() => toggleStage(step.key)}
                isLocked={isLocked}
                assignedValue={plan[step.key]}
                previousWorker={isRework ? activeHistoryPlan[step.key] : undefined}
                isSewing={isSewing}
                stepWorkload={workload[step.key] ?? {}}
                resources={stepWorkers}
                units={stepUnits[step.key] ?? []}
                onAssign={(v) => assignStep(step.key, v)}
              />
            );
          })}

          {isRework && !hasAtLeastOneStage && (
            <p className="text-sm text-[var(--status-bad)] pt-1">Select at least one stage</p>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-card border-t border-border px-4 py-3 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!canSubmit || isPending}>
            {isPending && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
            {confirmLabel ?? "Schedule"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
