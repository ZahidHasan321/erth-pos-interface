import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@repo/ui/dialog";
import { Button } from "@repo/ui/button";
import { Label } from "@repo/ui/label";
import { DatePicker } from "@repo/ui/date-picker";
import { useResources } from "@/hooks/useResources";
import { cn, getLocalDateStr, toLocalDateStr } from "@/lib/utils";
import { Droplets, Scissors, Loader2 } from "lucide-react";
import { IconNeedle, IconIroning1, IconRosette, IconSparkles /*, IconStack2 */ } from "@tabler/icons-react";
import {
  useStepWorkload,
  sortWorkersByLoad,
  WorkloadBar,
  WorkerChip,
  StageSelector,
  PipelineStepHeader,
  type PlanStep,
} from "./plan-dialog-shared";

const PLAN_STEPS: (PlanStep & { required: boolean })[] = [
  { key: "soaker",          label: "Soaking",       responsibility: "soaking",       required: false, icon: Droplets,    color: "text-sky-600",     accent: "bg-sky-500" },
  { key: "cutter",          label: "Cutting",       responsibility: "cutting",       required: true,  icon: Scissors,    color: "text-amber-600",   accent: "bg-amber-500" },
  // TEMP DISABLED: post_cutting hidden from production flow
  // { key: "post_cutter",     label: "Post-Cutting",  responsibility: "post_cutting",  required: true,  icon: IconStack2,    color: "text-orange-600",  accent: "bg-orange-500" },
  { key: "sewer",           label: "Sewing",        responsibility: "sewing",        required: true,  icon: IconNeedle,    color: "text-purple-600",  accent: "bg-purple-500" },
  { key: "finisher",        label: "Finishing",      responsibility: "finishing",     required: true,  icon: IconSparkles,  color: "text-emerald-600", accent: "bg-emerald-500" },
  { key: "ironer",          label: "Ironing",        responsibility: "ironing",       required: true,  icon: IconIroning1,  color: "text-red-600",     accent: "bg-red-500" },
  { key: "quality_checker", label: "Quality Check",  responsibility: "quality_check", required: true,  icon: IconRosette,   color: "text-indigo-600",  accent: "bg-indigo-500" },
];

// All steps except QC for selective toggling in alteration mode
const SELECTABLE_STEPS = PLAN_STEPS.slice(0, -1);
const QC_STEP = PLAN_STEPS[PLAN_STEPS.length - 1];
const DEFAULT_ALT_SELECTED = new Set(["sewer", "finisher", "ironer"]);

interface PlanDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (plan: Record<string, string>, date: string, unit?: string, reentryStage?: string, deliveryDate?: string) => void;
  garmentCount?: number;
  defaultDate?: string;
  isAlteration?: boolean;
  defaultPlan?: Record<string, string> | null;
  title?: string;
  confirmLabel?: string;
  /** True if any garment in the batch needs soaking */
  hasSoaking?: boolean;
  /** Show delivery date field — for per-garment editing */
  showDeliveryDate?: boolean;
  defaultDeliveryDate?: string;
  isPending?: boolean;
  /** Plan step keys that cannot be reassigned (already done / in progress).
   *  These rows render as read-only with the current worker. */
  lockedSteps?: Set<string>;
}

export function PlanDialog({ open, onOpenChange, onConfirm, garmentCount, defaultDate, isAlteration, defaultPlan, title, confirmLabel, hasSoaking, showDeliveryDate, defaultDeliveryDate, isPending, lockedSteps }: PlanDialogProps) {
  const locked = lockedSteps ?? new Set<string>();
  const { data: resources = [] } = useResources();
  const workload = useStepWorkload(PLAN_STEPS);

  const [plan, setPlan] = useState<Record<string, string>>({});
  const [unitSelections, setUnitSelections] = useState<Record<string, string>>({});
  const [deliveryDate, setDeliveryDate] = useState(defaultDeliveryDate ?? "");
  const [date, setDate] = useState(defaultDate ?? getLocalDateStr());
  const [selectedStages, setSelectedStages] = useState<Set<string>>(new Set(DEFAULT_ALT_SELECTED));

  // Per-responsibility: unique units
  const stageUnits = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const step of PLAN_STEPS) {
      const set = new Set<string>();
      for (const r of resources) {
        if (r.responsibility === step.responsibility && r.unit) set.add(r.unit);
      }
      map[step.key] = Array.from(set).sort();
    }
    return map;
  }, [resources]);

  // Get workers for a step, filtered by selected unit
  const getWorkers = (stepKey: string, responsibility: string) => {
    let filtered = resources.filter((r) => r.responsibility === responsibility);
    if (unitSelections[stepKey]) {
      filtered = filtered.filter((r) => r.unit === unitSelections[stepKey]);
    }
    return filtered;
  };

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setPlan(defaultPlan ? { ...defaultPlan } : {});
      setDate(defaultDate ?? getLocalDateStr());
      setDeliveryDate(defaultDeliveryDate ?? "");
      setSelectedStages(new Set(DEFAULT_ALT_SELECTED));

      const units: Record<string, string> = {};
      for (const step of PLAN_STEPS) {
        const stepUnits = stageUnits[step.key] ?? [];
        if (stepUnits.length === 1) {
          units[step.key] = stepUnits[0];
        } else if (defaultPlan?.[step.key]) {
          // Sewing: defaultPlan value IS the unit name. Other steps: look up worker → unit.
          if (step.key === "sewer") {
            if (stepUnits.includes(defaultPlan[step.key])) {
              units[step.key] = defaultPlan[step.key];
            }
          } else {
            const match = resources.find(
              (r) => r.resource_name === defaultPlan[step.key] && r.responsibility === step.responsibility,
            );
            if (match?.unit) units[step.key] = match.unit;
          }
        }
      }
      setUnitSelections(units);

      // Sewing: production_plan.sewer holds the unit name directly. Auto-fill
      // when only one unit exists or when defaultPlan already has a value.
      const sewingUnits = stageUnits["sewer"] ?? [];
      if (sewingUnits.length === 1 && !defaultPlan?.sewer) {
        setPlan((p) => ({ ...p, sewer: sewingUnits[0] }));
      }
    }
  }, [open, defaultDate, defaultPlan, resources, stageUnits]);

  const handleUnitChange = (stepKey: string, unit: string) => {
    setUnitSelections((prev) => ({ ...prev, [stepKey]: unit }));
    // Sewing: unit IS the assignment — set the plan value directly, no worker grid.
    if (stepKey === "sewer") {
      setPlan((prev) => ({ ...prev, sewer: unit }));
      return;
    }
    const step = PLAN_STEPS.find((s) => s.key === stepKey)!;
    const workers = resources.filter((r) => r.responsibility === step.responsibility && r.unit === unit);
    if (plan[stepKey] && !workers.some((w) => w.resource_name === plan[stepKey])) {
      setPlan((prev) => ({ ...prev, [stepKey]: "" }));
    }
  };

  const handleStageToggle = (key: string) => {
    if (locked.has(key)) return;
    setSelectedStages((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        setPlan((p) => { const n = { ...p }; delete n[key]; return n; });
      } else {
        next.add(key);
        if (defaultPlan?.[key]) {
          setPlan((p) => ({ ...p, [key]: defaultPlan[key] }));
        }
      }
      return next;
    });
  };

  // Visible steps
  const visibleSteps = isAlteration
    ? [...PLAN_STEPS.filter((s) => selectedStages.has(s.key)).map((s) => ({ ...s, required: true })), QC_STEP]
    : PLAN_STEPS
        .filter((s) => s.key !== "soaker" || hasSoaking)
        .map((s) => s.key === "soaker" && hasSoaking ? { ...s, required: true } : s);

  // Derive first selected stage for reentryStage param (alteration mode)
  const firstSelectedStage = useMemo(() => {
    if (!isAlteration) return undefined;
    for (const step of SELECTABLE_STEPS) {
      if (selectedStages.has(step.key)) return step.responsibility;
    }
    return "quality_check";
  }, [isAlteration, selectedStages]);

  const allRequiredFilled = visibleSteps
    .filter((s) => s.required)
    .every((s) => locked.has(s.key) || !!plan[s.key]);

  const filledCount = visibleSteps.filter((s) => !!plan[s.key]).length;
  const hasAtLeastOneStage = !isAlteration || selectedStages.size > 0;
  const canSubmit = !!date && allRequiredFilled && hasAtLeastOneStage;

  const handleConfirm = () => {
    if (!canSubmit) return;
    const finalPlan: Record<string, string> = {};
    for (const step of visibleSteps) {
      if (plan[step.key]) finalPlan[step.key] = plan[step.key];
    }
    onConfirm(finalPlan, date, undefined, firstSelectedStage, showDeliveryDate ? deliveryDate : undefined);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-card border-b px-5 pt-5 pb-3">
          <DialogHeader>
            <DialogTitle className="text-lg">{title ?? (isAlteration ? "Alteration Plan" : "Production Plan")}</DialogTitle>
          </DialogHeader>
          {garmentCount && (
            <p className="text-sm text-muted-foreground mt-0.5">
              Scheduling {garmentCount} garment{garmentCount > 1 ? "s" : ""}
            </p>
          )}

          {/* Date + delivery */}
          <div className={cn("mt-3 grid gap-3", showDeliveryDate ? "grid-cols-2" : "grid-cols-1")}>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Assigned Date <span className="text-red-500">*</span></Label>
              <DatePicker
                value={date}
                onChange={(d) => setDate(d ? toLocalDateStr(d) ?? "" : "")}
                className="h-8 text-sm"
              />
            </div>
            {showDeliveryDate && (
              <div className="space-y-1">
                <Label className="text-xs font-medium">Delivery Date</Label>
                <DatePicker
                  value={deliveryDate}
                  onChange={(d) => setDeliveryDate(d ? toLocalDateStr(d) ?? "" : "")}
                  className="h-8 text-sm"
                />
              </div>
            )}
          </div>

          {/* Alteration: stage selector — multi-toggle */}
          {isAlteration && (
            <div className="mt-3 space-y-1.5">
              <Label className="text-xs font-medium">Stages to repeat</Label>
              <StageSelector
                steps={SELECTABLE_STEPS}
                selectedStages={selectedStages}
                onToggle={handleStageToggle}
                lockedKeys={locked}
              />
              {!hasAtLeastOneStage && (
                <p className="text-xs text-red-500 mt-1">Select at least one stage</p>
              )}
            </div>
          )}

          {/* Progress indicator */}
          <div className="flex items-center gap-1.5 mt-3">
            {visibleSteps.map((step) => {
              const filled = !!plan[step.key];
              return (
                <div
                  key={step.key}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-colors",
                    filled ? step.accent : "bg-zinc-200",
                  )}
                />
              );
            })}
            <span className="text-xs font-bold text-muted-foreground ml-1 shrink-0">
              {filledCount}/{visibleSteps.length}
            </span>
          </div>
        </div>

        {/* Pipeline steps */}
        <div className="px-5 py-4 space-y-1">
          {visibleSteps.map((step, i) => {
            const units = stageUnits[step.key] ?? [];
            const isSewing = step.key === "sewer";
            const workers = getWorkers(step.key, step.responsibility);
            const selectedWorker = plan[step.key] ?? "";
            const stepWorkload = workload[step.key] ?? {};
            const isFilled = !!selectedWorker;
            const noUnit = !isSewing && units.length > 1 && !unitSelections[step.key];

            const isLocked = locked.has(step.key);

            return (
              <div key={step.key} className="relative">
                {/* Connector line */}
                {i > 0 && (
                  <div className="absolute left-[13px] -top-1 w-0.5 h-2 bg-zinc-200" />
                )}

                <div className={cn(
                  "border rounded-xl p-3 transition-[color,background-color,border-color,box-shadow]",
                  isLocked
                    ? "border-zinc-200 bg-zinc-50 opacity-75"
                    : isFilled
                      ? "border-zinc-300 bg-card"
                      : !step.required
                        ? "border-dashed border-zinc-200 bg-zinc-50/50"
                        : "border-zinc-200 bg-card",
                )}>
                  {/* Step header */}
                  <div className="mb-2.5">
                    <PipelineStepHeader
                      step={step}
                      isFilled={isFilled || isLocked}
                      workerName={selectedWorker}
                      unitName={isSewing ? undefined : unitSelections[step.key]}
                      onClear={isFilled && !isLocked ? () => {
                        setPlan((prev) => ({ ...prev, [step.key]: "" }));
                        if (isSewing) setUnitSelections((prev) => ({ ...prev, [step.key]: "" }));
                      } : undefined}
                    />
                    {isLocked && (
                      <span className="text-xs text-muted-foreground font-medium ml-9.5">(locked — already in production)</span>
                    )}
                    {!isLocked && !isFilled && !step.required && (
                      <span className="text-xs text-muted-foreground font-medium ml-9.5">(skip)</span>
                    )}
                  </div>

                  {/* Selection area — hidden when filled or locked */}
                  {!isFilled && !isLocked && (
                    <div className="space-y-2.5">
                      {/* Unit picker. For sewing this IS the assignment.
                          For other stages it filters the worker grid below. */}
                      {(isSewing ? units.length > 0 : units.length > 1) && (
                        <div>
                          <Label className="text-xs uppercase tracking-wider text-muted-foreground font-bold mb-1 block">
                            Unit
                          </Label>
                          <div className="flex gap-1.5 flex-wrap">
                            {units.map((u) => (
                              <button
                                key={u}
                                type="button"
                                onClick={() => handleUnitChange(step.key, u)}
                                aria-pressed={unitSelections[step.key] === u}
                                className={cn(
                                  "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer touch-manipulation pointer-coarse:active:scale-[0.97]",
                                  unitSelections[step.key] === u
                                    ? "border-primary bg-primary/5 text-primary"
                                    : "border-zinc-200 bg-card text-zinc-600 hover:border-zinc-300",
                                )}
                              >
                                {u}
                              </button>
                            ))}
                          </div>
                          {isSewing && units.length === 0 && (
                            <p className="text-xs text-muted-foreground italic py-1">No sewing units configured</p>
                          )}
                        </div>
                      )}

                      {/* Worker grid — non-sewing stages only */}
                      {!isSewing && (
                        <div>
                          <Label className="text-xs uppercase tracking-wider text-muted-foreground font-bold mb-1 block">
                            Worker
                          </Label>
                          {noUnit ? (
                            <p className="text-xs text-muted-foreground italic py-1">Select a unit first</p>
                          ) : workers.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic py-1">No workers available</p>
                          ) : (
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap gap-1.5">
                                {sortWorkersByLoad(workers, stepWorkload).map((r) => (
                                  <WorkerChip
                                    key={r.id}
                                    worker={r}
                                    isSelected={selectedWorker === r.resource_name}
                                    load={stepWorkload[r.resource_name] ?? 0}
                                    capacity={r.daily_target ?? 0}
                                    onSelect={() => setPlan((prev) => ({
                                      ...prev,
                                      [step.key]: selectedWorker === r.resource_name ? "" : r.resource_name,
                                    }))}
                                  />
                                ))}
                              </div>
                              {/* Workload detail — shown below when a worker is selected */}
                              {(() => {
                                const sw = workers.find((r) => r.resource_name === selectedWorker);
                                return sw && (sw.daily_target ?? 0) > 0 ? (
                                  <WorkloadBar current={stepWorkload[selectedWorker] ?? 0} max={sw.daily_target ?? 0} />
                                ) : null;
                              })()}
                            </div>
                          )}
                        </div>
                      )}
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
          <Button onClick={handleConfirm} disabled={!canSubmit || isPending}>
            {isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
            {confirmLabel ?? "Schedule"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
