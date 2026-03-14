import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PIECE_STAGE_LABELS } from "@/lib/constants";
import { useResources } from "@/hooks/useResources";
import { useWorkshopGarments } from "@/hooks/useWorkshopGarments";
import { cn } from "@/lib/utils";
import { Droplets, Scissors, Package, Shirt, Sparkles, Flame, ShieldCheck } from "lucide-react";
import type { ProductionPlan } from "@repo/database";

const PLAN_STEPS = [
  { key: "soaker",          label: "Soaking",       responsibility: "soaking",       required: false, icon: Droplets,    color: "text-blue-600",    bg: "bg-blue-50",    border: "border-blue-200" },
  { key: "cutter",          label: "Cutting",       responsibility: "cutting",       required: true,  icon: Scissors,    color: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-200" },
  { key: "post_cutter",     label: "Post-Cutting",  responsibility: "post_cutting",  required: true,  icon: Package,     color: "text-orange-600",  bg: "bg-orange-50",  border: "border-orange-200" },
  { key: "sewer",           label: "Sewing",        responsibility: "sewing",        required: true,  icon: Shirt,       color: "text-purple-600",  bg: "bg-purple-50",  border: "border-purple-200" },
  { key: "finisher",        label: "Finishing",      responsibility: "finishing",     required: true,  icon: Sparkles,    color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  { key: "ironer",          label: "Ironing",        responsibility: "ironing",       required: true,  icon: Flame,       color: "text-red-600",     bg: "bg-red-50",     border: "border-red-200" },
  { key: "quality_checker", label: "Quality Check",  responsibility: "quality_check", required: true,  icon: ShieldCheck, color: "text-indigo-600",  bg: "bg-indigo-50",  border: "border-indigo-200" },
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
  onConfirm: (plan: Record<string, string>, date: string, unit: string, reentryStage?: string) => void;
  garmentCount?: number;
  defaultDate?: string;
  isAlteration?: boolean;
  defaultPlan?: Record<string, string> | null;
  title?: string;
  confirmLabel?: string;
}

export function PlanDialog({ open, onOpenChange, onConfirm, garmentCount, defaultDate, isAlteration, defaultPlan, title, confirmLabel }: PlanDialogProps) {
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

  // Compute unit workload: unit name → garment count
  const unitWorkload = useMemo(() => {
    const map: Record<string, number> = {};
    for (const g of allGarments) {
      if (!g.assigned_unit || !g.in_production) continue;
      map[g.assigned_unit] = (map[g.assigned_unit] ?? 0) + 1;
    }
    return map;
  }, [allGarments]);

  // Per-responsibility: unique units and whether there are multiple
  const stageUnits = useMemo(() => {
    const map: Record<string, { units: string[]; multi: boolean }> = {};
    for (const step of PLAN_STEPS) {
      const set = new Set<string>();
      for (const r of resources) {
        if (r.responsibility === step.responsibility && r.unit) set.add(r.unit);
      }
      const units = Array.from(set).sort();
      map[step.key] = { units, multi: units.length > 1 };
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

      // Auto-resolve unit selections
      const units: Record<string, string> = {};
      for (const step of PLAN_STEPS) {
        const info = stageUnits[step.key];
        if (!info) continue;
        if (info.units.length === 1) {
          units[step.key] = info.units[0];
        } else if (defaultPlan?.[step.key]) {
          // Try to find worker's unit
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
    // Clear worker if not in new unit
    const step = PLAN_STEPS.find((s) => s.key === stepKey)!;
    const workers = resources.filter((r) => r.responsibility === step.responsibility && r.unit === unit);
    if (plan[stepKey] && !workers.some((w) => w.resource_name === plan[stepKey])) {
      setPlan((prev) => ({ ...prev, [stepKey]: "" }));
    }
  };

  // Visible steps
  const startIndex = isAlteration ? (STAGE_TO_STEP_INDEX[reentryStage] ?? 0) : 0;
  const visibleSteps = PLAN_STEPS.slice(startIndex);

  const allRequiredFilled = visibleSteps
    .filter((s) => s.required)
    .every((s) => !!plan[s.key]);

  const canSubmit = !!date && allRequiredFilled;

  const handleConfirm = () => {
    if (!canSubmit) return;
    const finalPlan: Record<string, string> = {};
    for (const step of visibleSteps) {
      if (plan[step.key]) finalPlan[step.key] = plan[step.key];
    }
    // Use sewing unit as the main assigned_unit (since it's the only multi-unit stage)
    const mainUnit = unitSelections["sewer"] ?? unitSelections[visibleSteps.find((s) => s.required)?.key ?? ""] ?? "";
    onConfirm(finalPlan, date, mainUnit, isAlteration ? reentryStage : undefined);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title ?? (isAlteration ? "Alteration Plan" : "Production Plan")}</DialogTitle>
          {garmentCount && (
            <p className="text-sm text-muted-foreground">
              Scheduling {garmentCount} garment{garmentCount > 1 ? "s" : ""}
            </p>
          )}
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* Date + re-entry */}
          <div className={cn("grid gap-3", isAlteration ? "grid-cols-2" : "grid-cols-1")}>
            <div className="space-y-1">
              <Label className="text-xs">Assigned Date <span className="text-red-500">*</span></Label>
              <DatePicker
                value={date}
                onChange={(d) => setDate(d ? d.toISOString().slice(0, 10) : "")}
                className="h-8 text-sm"
              />
            </div>
            {isAlteration && (
              <div className="space-y-1">
                <Label className="text-xs">Re-entry Stage <span className="text-red-500">*</span></Label>
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

          {/* Stage assignments */}
          <div className="space-y-1.5">
            {visibleSteps.map((step) => {
              const Icon = step.icon;
              const info = stageUnits[step.key];
              const workers = getWorkers(step.key, step.responsibility);
              const selectedWorker = plan[step.key] ?? "";
              const stepWorkload = workload[step.key] ?? {};

              return (
                <div
                  key={step.key}
                  className={cn(
                    "border rounded-lg px-3 py-2 space-y-1.5",
                    step.bg, step.border,
                    !step.required && !selectedWorker && "opacity-60",
                  )}
                >
                  {/* Stage header */}
                  <div className="flex items-center gap-2">
                    <Icon className={cn("w-4 h-4 shrink-0", step.color)} />
                    <span className="text-xs font-semibold leading-none">
                      {step.label}
                    </span>
                    {!step.required && (
                      <span className="text-[9px] text-muted-foreground">(optional)</span>
                    )}
                  </div>

                  {/* Unit + Worker row */}
                  <div className="flex items-center gap-2">
                    {/* Unit selector */}
                    <Select
                      value={unitSelections[step.key] ?? ""}
                      onValueChange={(v) => handleUnitChange(step.key, v)}
                    >
                      <SelectTrigger className="h-7 text-xs bg-white/70 w-28 shrink-0">
                        <SelectValue placeholder="Unit" />
                      </SelectTrigger>
                      <SelectContent>
                        {(info?.units ?? []).map((u) => (
                          <SelectItem key={u} value={u}>
                            <span className="flex items-center gap-1.5">
                              {u}
                              {(unitWorkload[u] ?? 0) > 0 && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold">
                                  {unitWorkload[u]} active
                                </span>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                        {(!info || info.units.length === 0) && (
                          <SelectItem value="__none" disabled>No units</SelectItem>
                        )}
                      </SelectContent>
                    </Select>

                    {/* Worker selector */}
                    <div className="flex-1">
                      <Select
                        value={selectedWorker}
                        onValueChange={(v) => setPlan((prev) => ({ ...prev, [step.key]: v }))}
                      >
                        <SelectTrigger className="h-7 text-xs bg-white/70">
                          <SelectValue placeholder={step.required ? "Select worker *" : "—"} />
                        </SelectTrigger>
                        <SelectContent>
                          {workers.map((r) => {
                            const load = stepWorkload[r.resource_name] ?? 0;
                            const capacity = r.daily_target ?? 0;
                            const isOverloaded = capacity > 0 && load >= capacity;

                            return (
                              <SelectItem key={r.id} value={r.resource_name}>
                                <span className="flex items-center gap-1.5">
                                  {r.resource_name}
                                  {r.resource_type && (
                                    <span className={cn(
                                      "text-[9px] px-1 py-0.5 rounded-full font-semibold",
                                      r.resource_type === "Senior" ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-500",
                                    )}>
                                      {r.resource_type}
                                    </span>
                                  )}
                                  <span className={cn(
                                    "text-[9px] px-1.5 py-0.5 rounded-full font-bold",
                                    isOverloaded
                                      ? "bg-red-100 text-red-700"
                                      : load > 0
                                        ? "bg-orange-100 text-orange-700"
                                        : "bg-green-100 text-green-700",
                                  )}>
                                    {load}{capacity > 0 ? `/${capacity}` : ""}
                                  </span>
                                </span>
                              </SelectItem>
                            );
                          })}
                          {workers.length === 0 && (
                            <SelectItem value="__none" disabled>
                              {!unitSelections[step.key] ? "Pick unit first" : "No workers"}
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!canSubmit}>{confirmLabel ?? "Schedule"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
