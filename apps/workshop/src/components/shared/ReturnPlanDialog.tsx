import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@repo/ui/dialog";
import { Button } from "@repo/ui/button";
import { Label } from "@repo/ui/label";
import { DatePicker } from "@repo/ui/date-picker";
import { useResources } from "@/hooks/useResources";
import { cn, getLocalDateStr, toLocalDateStr } from "@/lib/utils";
import { Droplets, Scissors, Loader2 } from "lucide-react";
import { IconNeedle, IconIroning1, IconRosette, IconStack2, IconSparkles } from "@tabler/icons-react";
import {
  useStepWorkload,
  sortWorkersByLoad,
  WorkerChip,
  StageSelector,
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

// All stages except QC — QC is always locked on
const SELECTABLE_STEPS = STEPS.slice(0, -1);
const QC_STEP = STEPS[STEPS.length - 1];

const DEFAULT_SELECTED = new Set<string>();

interface ReturnPlanDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (plan: Record<string, string>, date: string, unit?: string, reentryStage?: string) => void;
  garmentCount?: number;
  defaultDate?: string;
  /** worker_history from the garment (uses responsibility keys like "sewing", "cutting") */
  workerHistory?: Record<string, string> | null;
  title?: string;
  isPending?: boolean;
}

export function ReturnPlanDialog({ open, onOpenChange, onConfirm, garmentCount, defaultDate, workerHistory, title, isPending }: ReturnPlanDialogProps) {
  const { data: resources = [] } = useResources();
  const workload = useStepWorkload(STEPS);

  // Convert worker_history (responsibility keys) to plan keys
  const historyAsPlan = useMemo(() => {
    if (!workerHistory) return {};
    const mapped: Record<string, string> = {};
    for (const step of STEPS) {
      if (workerHistory[step.historyKey]) {
        mapped[step.key] = workerHistory[step.historyKey];
      }
    }
    return mapped;
  }, [workerHistory]);

  const [selectedStages, setSelectedStages] = useState<Set<string>>(new Set(DEFAULT_SELECTED));
  const [plan, setPlan] = useState<Record<string, string>>({});
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [date, setDate] = useState(defaultDate ?? getLocalDateStr());

  // Reset on open
  useEffect(() => {
    if (open) {
      setPlan({ ...historyAsPlan });
      setDate(defaultDate ?? getLocalDateStr());
      setSelectedStages(new Set(DEFAULT_SELECTED));
      setEditingStep(null);
    }
  }, [open, historyAsPlan, defaultDate]);

  const toggleStage = (planKey: string) => {
    setSelectedStages((prev) => {
      const next = new Set(prev);
      if (next.has(planKey)) {
        next.delete(planKey);
        setPlan((p) => { const n = { ...p }; delete n[planKey]; return n; });
      } else {
        next.add(planKey);
        if (historyAsPlan[planKey]) {
          setPlan((p) => ({ ...p, [planKey]: historyAsPlan[planKey] }));
        }
      }
      return next;
    });
  };

  // Visible steps = selected stages + QC (always)
  const visibleSteps = [...STEPS.filter((s) => selectedStages.has(s.key)), QC_STEP];

  const hasAtLeastOneStage = selectedStages.size > 0;
  const allFilled = visibleSteps.every((s) => !!plan[s.key]);

  // Derive first selected stage (for reentryStage param)
  const firstSelectedStage = useMemo(() => {
    for (const step of SELECTABLE_STEPS) {
      if (selectedStages.has(step.key)) return step.historyKey;
    }
    return "quality_check"; // fallback, shouldn't happen
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
        <div className="sticky top-0 z-10 bg-card border-b px-5 pt-5 pb-3">
          <DialogHeader>
            <DialogTitle className="text-lg">{title ?? "Return Plan"}</DialogTitle>
          </DialogHeader>
          {garmentCount && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {garmentCount} garment{garmentCount !== 1 ? "s" : ""}
            </p>
          )}

          <div className="mt-3 space-y-1">
            <Label className="text-xs font-medium">Assigned Date</Label>
            <DatePicker
              value={date}
              onChange={(d) => setDate(d ? toLocalDateStr(d) ?? "" : "")}
              className="h-8 text-sm"
            />
          </div>

          {/* Stage selector — multi-toggle */}
          <div className="mt-3 space-y-1.5">
            <Label className="text-xs font-medium">Stages to repeat</Label>
            <StageSelector
              steps={SELECTABLE_STEPS}
              selectedStages={selectedStages}
              onToggle={toggleStage}
            />
            {!hasAtLeastOneStage && (
              <p className="text-xs text-red-500 mt-1">Select at least one stage</p>
            )}
          </div>
        </div>

        {/* Pipeline: worker assignment for selected stages */}
        <div className="px-5 py-4 space-y-1">
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
