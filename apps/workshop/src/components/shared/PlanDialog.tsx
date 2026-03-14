import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PIECE_STAGE_LABELS } from "@/lib/constants";
import { useResources } from "@/hooks/useResources";
import { useWorkshopGarments } from "@/hooks/useWorkshopGarments";
import { cn } from "@/lib/utils";
import { Droplets, Scissors, Package, Shirt, Sparkles, Flame, ShieldCheck, Check } from "lucide-react";
import type { ProductionPlan } from "@repo/database";

const PLAN_STEPS = [
  { key: "soaker",          label: "Soaking",       responsibility: "soaking",       required: false, icon: Droplets,    color: "text-sky-600",     accent: "bg-sky-500" },
  { key: "cutter",          label: "Cutting",       responsibility: "cutting",       required: true,  icon: Scissors,    color: "text-amber-600",   accent: "bg-amber-500" },
  { key: "post_cutter",     label: "Post-Cutting",  responsibility: "post_cutting",  required: true,  icon: Package,     color: "text-orange-600",  accent: "bg-orange-500" },
  { key: "sewer",           label: "Sewing",        responsibility: "sewing",        required: true,  icon: Shirt,       color: "text-purple-600",  accent: "bg-purple-500" },
  { key: "finisher",        label: "Finishing",      responsibility: "finishing",     required: true,  icon: Sparkles,    color: "text-emerald-600", accent: "bg-emerald-500" },
  { key: "ironer",          label: "Ironing",        responsibility: "ironing",       required: true,  icon: Flame,       color: "text-red-600",     accent: "bg-red-500" },
  { key: "quality_checker", label: "Quality Check",  responsibility: "quality_check", required: true,  icon: ShieldCheck, color: "text-indigo-600",  accent: "bg-indigo-500" },
];

const ALTERATION_REENTRY_STAGES = [
  "soaking", "cutting", "post_cutting", "sewing", "finishing", "ironing",
] as const;

const STAGE_TO_STEP_INDEX: Record<string, number> = {
  soaking: 0, cutting: 1, post_cutting: 2, sewing: 3, finishing: 4, ironing: 5, quality_check: 6,
};

interface PlanDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (plan: Record<string, string>, date: string, unit?: string, reentryStage?: string) => void;
  garmentCount?: number;
  defaultDate?: string;
  isAlteration?: boolean;
  defaultPlan?: Record<string, string> | null;
  title?: string;
  confirmLabel?: string;
  /** True if any garment in the batch needs soaking */
  hasSoaking?: boolean;
}

// ── Workload bar ─────────────────────────────────────────────────────────────

function WorkloadBar({ current, max }: { current: number; max: number }) {
  if (max <= 0) return null;
  const pct = Math.min((current / max) * 100, 100);
  const isOver = current >= max;
  return (
    <div className="flex items-center gap-2 mt-0.5">
      <div className="flex-1 h-1.5 bg-zinc-200 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            isOver ? "bg-red-500" : pct > 60 ? "bg-orange-400" : "bg-emerald-400",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn(
        "text-[10px] font-bold tabular-nums shrink-0",
        isOver ? "text-red-600" : "text-muted-foreground",
      )}>
        {current}/{max}
      </span>
    </div>
  );
}

// ── Worker button select ─────────────────────────────────────────────────────

function WorkerSelect({
  workers,
  value,
  onChange,
  stepWorkload,
  noUnit,
}: {
  workers: { id: string; resource_name: string; resource_type?: string | null; daily_target?: number | null }[];
  value: string;
  onChange: (v: string) => void;
  stepWorkload: Record<string, number>;
  required?: boolean;
  noUnit: boolean;
}) {
  if (noUnit) {
    return (
      <p className="text-xs text-muted-foreground italic py-1">Select a unit first</p>
    );
  }

  if (workers.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic py-1">No workers available</p>
    );
  }

  // Sort: free first, then by load ascending, overloaded last
  const sorted = [...workers].sort((a, b) => {
    const aLoad = stepWorkload[a.resource_name] ?? 0;
    const bLoad = stepWorkload[b.resource_name] ?? 0;
    const aCap = a.daily_target ?? 0;
    const bCap = b.daily_target ?? 0;
    const aOver = aCap > 0 && aLoad >= aCap;
    const bOver = bCap > 0 && bLoad >= bCap;
    if (aOver !== bOver) return aOver ? 1 : -1;
    return aLoad - bLoad;
  });

  const selectedWorker = sorted.find((r) => r.resource_name === value);
  const selectedLoad = selectedWorker ? (stepWorkload[value] ?? 0) : 0;
  const selectedCap = selectedWorker?.daily_target ?? 0;

  return (
    <div className="space-y-1.5">
      {/* Worker chips — wrapping flex */}
      <div className="flex flex-wrap gap-1.5">
        {sorted.map((r) => {
          const load = stepWorkload[r.resource_name] ?? 0;
          const capacity = r.daily_target ?? 0;
          const isOverloaded = capacity > 0 && load >= capacity;
          const isSelected = value === r.resource_name;

          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onChange(isSelected ? "" : r.resource_name)}
              className={cn(
                "inline-flex items-center gap-1.5 border rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                isSelected
                  ? "border-primary bg-primary text-white shadow-sm"
                  : isOverloaded
                    ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50",
              )}
            >
              {isSelected && <Check className="w-3 h-3 shrink-0" />}
              <span className="truncate max-w-[100px]">{r.resource_name}</span>
              {r.resource_type === "Senior" && (
                <span className={cn(
                  "text-[9px] font-bold uppercase",
                  isSelected ? "text-white/80" : "text-amber-500",
                )}>
                  Sr
                </span>
              )}
              {/* Compact load indicator */}
              <span className={cn(
                "text-[10px] font-bold tabular-nums",
                isSelected
                  ? "text-white/70"
                  : isOverloaded
                    ? "text-red-500"
                    : load > 0
                      ? "text-orange-500"
                      : "text-emerald-500",
              )}>
                {capacity > 0 ? `${load}/${capacity}` : load > 0 ? load : "0"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Workload detail — shown below when a worker is selected */}
      {selectedWorker && selectedCap > 0 && (
        <WorkloadBar current={selectedLoad} max={selectedCap} />
      )}
    </div>
  );
}

// ── Main dialog ──────────────────────────────────────────────────────────────

export function PlanDialog({ open, onOpenChange, onConfirm, garmentCount, defaultDate, isAlteration, defaultPlan, title, confirmLabel, hasSoaking }: PlanDialogProps) {
  const { data: resources = [] } = useResources();
  const { data: allGarments = [] } = useWorkshopGarments();

  const [plan, setPlan] = useState<Record<string, string>>({});
  const [unitSelections, setUnitSelections] = useState<Record<string, string>>({});
  const [date, setDate] = useState(defaultDate ?? new Date().toISOString().slice(0, 10));
  const [reentryStage, setReentryStage] = useState<string>("sewing");

  // Compute workload: per plan-key → worker name → garment count
  const workload = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const step of PLAN_STEPS) {
      map[step.key] = {};
    }
    for (const g of allGarments) {
      if (!g.production_plan || !g.in_production) continue;
      const pp = g.production_plan as ProductionPlan;
      for (const step of PLAN_STEPS) {
        const workerName = pp[step.key as keyof ProductionPlan];
        if (workerName) {
          map[step.key][workerName] = (map[step.key][workerName] ?? 0) + 1;
        }
      }
    }
    return map;
  }, [allGarments]);

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
      setDate(defaultDate ?? new Date().toISOString().slice(0, 10));
      setReentryStage("sewing");

      const units: Record<string, string> = {};
      for (const step of PLAN_STEPS) {
        const stepUnits = stageUnits[step.key] ?? [];
        if (stepUnits.length === 1) {
          units[step.key] = stepUnits[0];
        } else if (defaultPlan?.[step.key]) {
          const match = resources.find(
            (r) => r.resource_name === defaultPlan[step.key] && r.responsibility === step.responsibility,
          );
          if (match?.unit) units[step.key] = match.unit;
        }
      }
      setUnitSelections(units);
    }
  }, [open, defaultDate, defaultPlan, resources, stageUnits]);

  const handleUnitChange = (stepKey: string, unit: string) => {
    setUnitSelections((prev) => ({ ...prev, [stepKey]: unit }));
    const step = PLAN_STEPS.find((s) => s.key === stepKey)!;
    const workers = resources.filter((r) => r.responsibility === step.responsibility && r.unit === unit);
    if (plan[stepKey] && !workers.some((w) => w.resource_name === plan[stepKey])) {
      setPlan((prev) => ({ ...prev, [stepKey]: "" }));
    }
  };

  // Visible steps
  const startIndex = isAlteration ? (STAGE_TO_STEP_INDEX[reentryStage] ?? 0) : 0;
  const visibleSteps = PLAN_STEPS.slice(startIndex)
    // Hide soaking unless batch has garments that need it
    .filter((s) => s.key !== "soaker" || hasSoaking)
    // When hasSoaking, mark soaking as required
    .map((s) => s.key === "soaker" && hasSoaking ? { ...s, required: true } : s);

  const allRequiredFilled = visibleSteps
    .filter((s) => s.required)
    .every((s) => !!plan[s.key]);

  const filledCount = visibleSteps.filter((s) => !!plan[s.key]).length;
  const canSubmit = !!date && allRequiredFilled;

  const handleConfirm = () => {
    if (!canSubmit) return;
    const finalPlan: Record<string, string> = {};
    for (const step of visibleSteps) {
      if (plan[step.key]) finalPlan[step.key] = plan[step.key];
    }
    onConfirm(finalPlan, date, undefined, isAlteration ? reentryStage : undefined);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b px-5 pt-5 pb-3">
          <DialogHeader>
            <DialogTitle className="text-lg">{title ?? (isAlteration ? "Alteration Plan" : "Production Plan")}</DialogTitle>
          </DialogHeader>
          {garmentCount && (
            <p className="text-sm text-muted-foreground mt-0.5">
              Scheduling {garmentCount} garment{garmentCount > 1 ? "s" : ""}
            </p>
          )}

          {/* Date + re-entry */}
          <div className={cn("mt-3 grid gap-3", isAlteration ? "grid-cols-2" : "grid-cols-1")}>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Assigned Date <span className="text-red-500">*</span></Label>
              <DatePicker
                value={date}
                onChange={(d) => setDate(d ? d.toISOString().slice(0, 10) : "")}
                className="h-8 text-sm"
              />
            </div>
            {isAlteration && (
              <div className="space-y-1">
                <Label className="text-xs font-medium">Re-entry Stage <span className="text-red-500">*</span></Label>
                <Select value={reentryStage} onValueChange={setReentryStage}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALTERATION_REENTRY_STAGES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {PIECE_STAGE_LABELS[s as keyof typeof PIECE_STAGE_LABELS] ?? s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

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
            <span className="text-[10px] font-bold text-muted-foreground ml-1 shrink-0">
              {filledCount}/{visibleSteps.length}
            </span>
          </div>
        </div>

        {/* Pipeline steps */}
        <div className="px-5 py-4 space-y-1">
          {visibleSteps.map((step, i) => {
            const Icon = step.icon;
            const units = stageUnits[step.key] ?? [];
            const workers = getWorkers(step.key, step.responsibility);
            const selectedWorker = plan[step.key] ?? "";
            const stepWorkload = workload[step.key] ?? {};
            const isFilled = !!selectedWorker;
            const noUnit = units.length > 1 && !unitSelections[step.key];

            return (
              <div key={step.key} className="relative">
                {/* Connector line */}
                {i > 0 && (
                  <div className="absolute left-[13px] -top-1 w-0.5 h-2 bg-zinc-200" />
                )}

                <div className={cn(
                  "border rounded-xl p-3 transition-all",
                  isFilled
                    ? "border-zinc-300 bg-white"
                    : !step.required
                      ? "border-dashed border-zinc-200 bg-zinc-50/50"
                      : "border-zinc-200 bg-white",
                )}>
                  {/* Step header */}
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <div className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                      isFilled ? step.accent + " text-white" : "bg-zinc-100",
                    )}>
                      {isFilled ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Icon className={cn("w-4 h-4", step.color)} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold">{step.label}</span>
                        {!step.required && (
                          <span className="text-[10px] text-muted-foreground font-medium">(skip)</span>
                        )}
                        {step.required && !isFilled && (
                          <span className="text-red-400 text-xs">*</span>
                        )}
                      </div>
                      {isFilled && (
                        <p className="text-xs text-muted-foreground truncate">
                          {unitSelections[step.key] && <span>{unitSelections[step.key]} &middot; </span>}
                          {selectedWorker}
                        </p>
                      )}
                    </div>
                    {isFilled && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                        onClick={() => setPlan((prev) => ({ ...prev, [step.key]: "" }))}
                      >
                        Change
                      </Button>
                    )}
                  </div>

                  {/* Selection area — hidden when filled */}
                  {!isFilled && (
                    <div className="space-y-2.5">
                      {/* Unit picker (only if multiple units) */}
                      {units.length > 1 && (
                        <div>
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1 block">
                            Unit
                          </Label>
                          <div className="flex gap-1.5">
                            {units.map((u) => (
                              <button
                                key={u}
                                type="button"
                                onClick={() => handleUnitChange(step.key, u)}
                                className={cn(
                                  "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                                  unitSelections[step.key] === u
                                    ? "border-primary bg-primary/5 text-primary"
                                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
                                )}
                              >
                                {u}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Worker grid */}
                      <div>
                        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1 block">
                          Worker
                        </Label>
                        <WorkerSelect
                          workers={workers}
                          value={selectedWorker}
                          onChange={(v) => setPlan((prev) => ({ ...prev, [step.key]: v }))}
                          stepWorkload={stepWorkload}
                          required={step.required}
                          noUnit={noUnit}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t px-5 py-3 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!canSubmit}>
            {confirmLabel ?? "Schedule"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
