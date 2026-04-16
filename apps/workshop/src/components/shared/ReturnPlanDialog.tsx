import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@repo/ui/dialog";
import { Button } from "@repo/ui/button";
import { Label } from "@repo/ui/label";
import { DatePicker } from "@repo/ui/date-picker";
import { useResources } from "@/hooks/useResources";
import { getFeedbackByGarmentAndTrip } from "@/api/feedback";
import { cn, getLocalDateStr, toLocalDateStr } from "@/lib/utils";
import { Droplets, Scissors, Loader2 } from "lucide-react";
import { IconNeedle, IconIroning1, IconRosette, IconStack2, IconSparkles } from "@tabler/icons-react";
import type { TripHistoryEntry } from "@repo/database";
import {
  useStepWorkload,
  sortWorkersByLoad,
  WorkerChip,
  FlowStageSelector,
  ReturnContextBanner,
  QcFailBanner,
  PipelineStepHeader,
  type PlanStep,
} from "./plan-dialog-shared";

const STEPS: (PlanStep & { historyKey: string })[] = [
  { key: "soaker",          historyKey: "soaking",       label: "Soaking",       responsibility: "soaking",       icon: Droplets,    color: "text-sky-600",     accent: "bg-sky-500" },
  { key: "cutter",          historyKey: "cutting",       label: "Cutting",       responsibility: "cutting",       icon: Scissors,    color: "text-amber-600",   accent: "bg-amber-500" },
  { key: "post_cutter",     historyKey: "post_cutting",  label: "Post-Cutting",  responsibility: "post_cutting",  icon: IconStack2,    color: "text-orange-600",  accent: "bg-orange-500" },
  { key: "sewer",           historyKey: "sewing",        label: "Sewing",        responsibility: "sewing",        icon: IconNeedle,    color: "text-purple-600",  accent: "bg-purple-500" },
  { key: "finisher",        historyKey: "finishing",      label: "Finishing",      responsibility: "finishing",     icon: IconSparkles,  color: "text-emerald-600", accent: "bg-emerald-500" },
  { key: "ironer",          historyKey: "ironing",        label: "Ironing",        responsibility: "ironing",       icon: IconIroning1,  color: "text-red-600",     accent: "bg-red-500" },
  { key: "quality_checker", historyKey: "quality_checker", label: "Quality Check", responsibility: "quality_check", icon: IconRosette,   color: "text-indigo-600",  accent: "bg-indigo-500" },
];

// Selectable stages: cutting through ironing (no soaking, no QC)
const SELECTABLE_STEPS = STEPS.slice(1, -1); // cutter, post_cutter, sewer, finisher, ironer
const QC_STEP = STEPS[STEPS.length - 1];

interface ReturnPlanDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (plan: Record<string, string>, date: string, unit?: string, reentryStage?: string) => void;
  garmentCount?: number;
  defaultDate?: string;
  /** worker_history from the garment (uses responsibility keys like "sewing", "cutting") */
  workerHistory?: Record<string, string> | null;
  /** Customer feedback status driving the return */
  feedbackStatus?: "needs_repair" | "needs_redo" | string | null;
  /** Trip number of the returning garment */
  tripNumber?: number | null;
  /** Notes from the garment (may contain feedback context) */
  feedbackNotes?: string | null;
  /** Garment id — used to fetch prior-trip feedback (measurement/style errors + attachments) */
  garmentId?: string | null;
  /** Garment trip_history — used to surface QC-fail details (separate from customer feedback) */
  tripHistory?: TripHistoryEntry[] | string | null;
  title?: string;
  isPending?: boolean;
  /** Plan step keys already done / in progress on the current trip — cannot be re-selected. */
  lockedSteps?: Set<string>;
}

export function ReturnPlanDialog({
  open, onOpenChange, onConfirm, garmentCount, defaultDate,
  workerHistory, feedbackStatus, tripNumber, feedbackNotes, garmentId, tripHistory,
  title, isPending, lockedSteps,
}: ReturnPlanDialogProps) {
  const locked = lockedSteps ?? new Set<string>();
  const { data: resources = [] } = useResources();
  const workload = useStepWorkload(STEPS);

  // Detect QC-fail rework on the current trip — source of truth is trip_history,
  // NOT garment_feedback. QC fails don't increment trip_number.
  const hasQcFailThisTrip = useMemo(() => {
    const raw = tripHistory;
    const arr: TripHistoryEntry[] = !raw
      ? []
      : Array.isArray(raw)
        ? raw
        : (() => { try { const v = JSON.parse(raw as string); return Array.isArray(v) ? v as TripHistoryEntry[] : []; } catch { return []; } })();
    if (!tripNumber) return false;
    const entry = arr.find((t) => t.trip === tripNumber);
    return !!entry?.qc_attempts?.some((a) => a.result === "fail");
  }, [tripHistory, tripNumber]);

  // Customer-feedback fetch only runs for true customer returns (trip bumped + has feedback_status).
  // QC-fail rework skips this entirely — its details come from trip_history.
  const priorTrip = tripNumber && tripNumber > 1 ? tripNumber - 1 : null;
  const shouldFetchFeedback = open && !!garmentId && !!priorTrip && !!feedbackStatus;
  const { data: priorFeedback } = useQuery({
    queryKey: ["garment-feedback", garmentId, priorTrip],
    queryFn: () => getFeedbackByGarmentAndTrip(garmentId!, priorTrip!),
    enabled: shouldFetchFeedback,
    staleTime: 60_000,
  });

  const parsedJson = <T,>(raw: unknown): T | null => {
    if (!raw) return null;
    if (typeof raw !== "string") return raw as T;
    try { return JSON.parse(raw) as T; } catch { return null; }
  };

  const measurementDiffs = parsedJson<Array<Record<string, unknown>>>(priorFeedback?.measurement_diffs) as any;
  const optionsChecklist = parsedJson<Array<Record<string, unknown>>>(priorFeedback?.options_checklist) as any;
  const photoUrlsRaw = parsedJson<unknown>(priorFeedback?.photo_urls);
  const voiceUrlsRaw = parsedJson<unknown>(priorFeedback?.voice_note_urls);

  // photo_urls historically could be array of strings OR array of { type, url }
  const photoUrls = Array.isArray(photoUrlsRaw)
    ? photoUrlsRaw.map((p: any) => (typeof p === "string" ? p : p?.url)).filter(Boolean) as string[]
    : null;
  const voiceNoteUrls = Array.isArray(voiceUrlsRaw)
    ? (voiceUrlsRaw as unknown[]).filter((v): v is string => typeof v === "string")
    : null;

  // worker_history already uses plan keys (soaker, cutter, sewer, …)
  // per HISTORY_KEY_MAP in garments.ts — no remapping needed
  const historyAsPlan = useMemo(() => {
    if (!workerHistory) return {};
    const mapped: Record<string, string> = {};
    for (const step of STEPS) {
      // Try plan key first (how worker_history is actually stored),
      // fall back to historyKey for safety
      const worker = workerHistory[step.key] ?? workerHistory[step.historyKey];
      if (worker) mapped[step.key] = worker;
    }
    return mapped;
  }, [workerHistory]);

  const [selectedStages, setSelectedStages] = useState<Set<string>>(new Set());
  const [plan, setPlan] = useState<Record<string, string>>({});
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [date, setDate] = useState(defaultDate ?? getLocalDateStr());

  // Filter historyAsPlan to only include active workers
  const activeHistoryPlan = useMemo(() => {
    const filtered: Record<string, string> = {};
    for (const [planKey, workerName] of Object.entries(historyAsPlan)) {
      const step = STEPS.find((s) => s.key === planKey);
      if (step && resources.some((r) => r.resource_name === workerName && r.responsibility === step.responsibility)) {
        filtered[planKey] = workerName;
      }
    }
    return filtered;
  }, [historyAsPlan, resources]);

  // Reset on open — no stages pre-selected; workers auto-fill when user toggles a stage on
  useEffect(() => {
    if (open) {
      setPlan({});
      setDate(defaultDate ?? getLocalDateStr());
      setSelectedStages(new Set());
      setEditingStep(null);
    }
  }, [open, defaultDate]);

  const toggleStage = (planKey: string) => {
    if (locked.has(planKey)) return;
    setSelectedStages((prev) => {
      const next = new Set(prev);
      if (next.has(planKey)) {
        next.delete(planKey);
        setPlan((p) => { const n = { ...p }; delete n[planKey]; return n; });
      } else {
        next.add(planKey);
        // Auto-assign previous worker only if they're still active
        if (activeHistoryPlan[planKey]) {
          setPlan((p) => ({ ...p, [planKey]: activeHistoryPlan[planKey] }));
        }
      }
      return next;
    });
  };

  // Visible steps for worker assignment = selected stages (in order) + QC
  const visibleSteps = [...SELECTABLE_STEPS.filter((s) => selectedStages.has(s.key)), QC_STEP];

  const hasAtLeastOneStage = selectedStages.size > 0;
  const allFilled = visibleSteps.every((s) => !!plan[s.key]);

  // Derive first selected stage in production order (for reentryStage param)
  const firstSelectedStage = useMemo(() => {
    for (const step of SELECTABLE_STEPS) {
      if (selectedStages.has(step.key)) return step.historyKey;
    }
    return "quality_check";
  }, [selectedStages]);

  const handleConfirm = () => {
    if (!date || !hasAtLeastOneStage) return;
    const finalPlan: Record<string, string> = {};
    for (const step of visibleSteps) {
      if (plan[step.key]) finalPlan[step.key] = plan[step.key];
    }
    onConfirm(finalPlan, date, undefined, firstSelectedStage);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-card border-b px-5 pt-5 pb-3 space-y-3">
          <DialogHeader>
            <DialogTitle className="text-lg">{title ?? "Rework Plan"}</DialogTitle>
          </DialogHeader>
          {garmentCount && (
            <p className="text-sm text-muted-foreground -mt-2">
              {garmentCount} garment{garmentCount !== 1 ? "s" : ""}
            </p>
          )}

          {/* Context banner — why is this garment returning?
              QC-fail rework and customer-feedback returns are rendered as separate
              components so their content never overlaps. A garment can in theory
              have both (rare) — both banners show, clearly labelled. */}
          {hasQcFailThisTrip && (
            <QcFailBanner tripHistory={tripHistory} currentTrip={tripNumber} />
          )}
          {feedbackStatus && (
            <ReturnContextBanner
              feedbackStatus={feedbackStatus}
              tripNumber={tripNumber}
              notes={priorFeedback?.notes ?? feedbackNotes}
              measurementDiffs={measurementDiffs}
              optionsChecklist={optionsChecklist}
              photoUrls={photoUrls}
              voiceNoteUrls={voiceNoteUrls}
            />
          )}

          <div className="space-y-1">
            <Label className="text-xs font-medium">Assigned Date</Label>
            <DatePicker
              value={date}
              onChange={(d) => setDate(d ? toLocalDateStr(d) ?? "" : "")}
              className="h-8 text-sm"
            />
          </div>
        </div>

        {/* Stage selector + worker assignment */}
        <div className="px-5 py-4 space-y-4">
          {/* Stage selector — multi-select with flow visualization */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Stages to Rework</Label>
            <FlowStageSelector
              steps={SELECTABLE_STEPS}
              selectedStages={selectedStages}
              onToggle={toggleStage}
              workerHistory={workerHistory}
              lockedKeys={locked}
            />
            {!hasAtLeastOneStage && (
              <p className="text-xs text-red-500 mt-1">Select at least one stage</p>
            )}
          </div>

          {/* Worker assignment — only for selected stages + QC */}
          {hasAtLeastOneStage && (
            <div className="space-y-1">
              <Label className="text-xs font-medium">Worker Assignment</Label>
              <div className="space-y-1">
                {visibleSteps.map((step, i) => {
                  const currentWorker = plan[step.key] ?? "";
                  const previousWorker = historyAsPlan[step.key];
                  const isEditing = editingStep === step.key;
                  const stepWorkers = resources.filter((r) => r.responsibility === step.responsibility);
                  const stepWorkload = workload[step.key] ?? {};

                  return (
                    <div key={step.key} className="relative">
                      {i > 0 && <div className="absolute left-[13px] -top-1 w-0.5 h-2 bg-zinc-200" />}

                      <div className={cn(
                        "border rounded-xl p-3 transition-[color,background-color,border-color,box-shadow]",
                        currentWorker ? "border-zinc-300 bg-card" : "border-zinc-200 bg-zinc-50",
                      )}>
                        <PipelineStepHeader
                          step={step}
                          isFilled={!!currentWorker}
                          workerName={currentWorker}
                          previousWorker={previousWorker}
                          onClear={currentWorker && !isEditing ? () => setEditingStep(step.key) : undefined}
                        />

                        {/* Worker selection — shown when no worker or editing */}
                        {(!currentWorker || isEditing) && (
                          <div className="mt-2.5">
                            <div className="flex flex-wrap gap-1.5">
                              {stepWorkers.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic py-1">No workers available</p>
                              ) : (
                                sortWorkersByLoad(stepWorkers, stepWorkload).map((r) => (
                                  <WorkerChip
                                    key={r.id}
                                    worker={r}
                                    isSelected={currentWorker === r.resource_name}
                                    load={stepWorkload[r.resource_name] ?? 0}
                                    capacity={r.daily_target ?? 0}
                                    onSelect={() => {
                                      setPlan((prev) => ({ ...prev, [step.key]: r.resource_name }));
                                      setEditingStep(null);
                                    }}
                                  />
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-card border-t px-5 py-3 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!date || !allFilled || !hasAtLeastOneStage || isPending}>
            {isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
            Schedule
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
