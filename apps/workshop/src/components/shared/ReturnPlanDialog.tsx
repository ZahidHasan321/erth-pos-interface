import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { useResources } from "@/hooks/useResources";
import { useWorkshopGarments } from "@/hooks/useWorkshopGarments";
import { cn } from "@/lib/utils";
import { Droplets, Scissors, Package, Shirt, Sparkles, Flame, ShieldCheck, Check } from "lucide-react";
import type { ProductionPlan } from "@repo/database";

const STEPS = [
  { planKey: "soaker",          historyKey: "soaking",       label: "Soaking",       responsibility: "soaking",       icon: Droplets,    color: "text-sky-600",     accent: "bg-sky-500" },
  { planKey: "cutter",          historyKey: "cutting",       label: "Cutting",       responsibility: "cutting",       icon: Scissors,    color: "text-amber-600",   accent: "bg-amber-500" },
  { planKey: "post_cutter",     historyKey: "post_cutting",  label: "Post-Cutting",  responsibility: "post_cutting",  icon: Package,     color: "text-orange-600",  accent: "bg-orange-500" },
  { planKey: "sewer",           historyKey: "sewing",        label: "Sewing",        responsibility: "sewing",        icon: Shirt,       color: "text-purple-600",  accent: "bg-purple-500" },
  { planKey: "finisher",        historyKey: "finishing",      label: "Finishing",      responsibility: "finishing",     icon: Sparkles,    color: "text-emerald-600", accent: "bg-emerald-500" },
  { planKey: "ironer",          historyKey: "ironing",        label: "Ironing",        responsibility: "ironing",       icon: Flame,       color: "text-red-600",     accent: "bg-red-500" },
  { planKey: "quality_checker", historyKey: "quality_checker", label: "Quality Check", responsibility: "quality_check", icon: ShieldCheck, color: "text-indigo-600",  accent: "bg-indigo-500" },
];

const REENTRY_STAGES = STEPS.slice(0, -1); // can't re-enter at quality_check

interface ReturnPlanDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (plan: Record<string, string>, date: string, unit?: string, reentryStage?: string) => void;
  garmentCount?: number;
  defaultDate?: string;
  /** worker_history from the garment (uses responsibility keys like "sewing", "cutting") */
  workerHistory?: Record<string, string> | null;
  title?: string;
}

export function ReturnPlanDialog({ open, onOpenChange, onConfirm, garmentCount, defaultDate, workerHistory, title }: ReturnPlanDialogProps) {
  const { data: resources = [] } = useResources();
  const { data: allGarments = [] } = useWorkshopGarments();

  // Convert worker_history (responsibility keys) to plan keys
  const historyAsPlan = useMemo(() => {
    if (!workerHistory) return {};
    const mapped: Record<string, string> = {};
    for (const step of STEPS) {
      if (workerHistory[step.historyKey]) {
        mapped[step.planKey] = workerHistory[step.historyKey];
      }
    }
    return mapped;
  }, [workerHistory]);

  const [reentryIndex, setReentryIndex] = useState(3); // default: sewing
  const [plan, setPlan] = useState<Record<string, string>>({});
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [date, setDate] = useState(defaultDate ?? new Date().toISOString().slice(0, 10));

  // Compute workload per step
  const workload = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const step of STEPS) map[step.planKey] = {};
    for (const g of allGarments) {
      if (!g.production_plan || !g.in_production) continue;
      const pp = g.production_plan as ProductionPlan;
      for (const step of STEPS) {
        const name = pp[step.planKey as keyof ProductionPlan];
        if (name) map[step.planKey][name] = (map[step.planKey][name] ?? 0) + 1;
      }
    }
    return map;
  }, [allGarments]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setPlan({ ...historyAsPlan });
      setDate(defaultDate ?? new Date().toISOString().slice(0, 10));
      setReentryIndex(3); // sewing
      setEditingStep(null);
    }
  }, [open, historyAsPlan, defaultDate]);

  const reentryStage = STEPS[reentryIndex].historyKey; // responsibility key = piece_stage value
  const visibleSteps = STEPS.slice(reentryIndex);

  const allFilled = visibleSteps.every((s) => !!plan[s.planKey]);

  const handleConfirm = () => {
    if (!date) return;
    const finalPlan: Record<string, string> = {};
    for (const step of visibleSteps) {
      if (plan[step.planKey]) finalPlan[step.planKey] = plan[step.planKey];
    }
    onConfirm(finalPlan, date, undefined, reentryStage);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b px-5 pt-5 pb-3">
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
              onChange={(d) => setDate(d ? d.toISOString().slice(0, 10) : "")}
              className="h-8 text-sm"
            />
          </div>

          {/* Re-entry stage picker */}
          <div className="mt-3 space-y-1.5">
            <Label className="text-xs font-medium">Send back to</Label>
            <div className="flex flex-wrap gap-1.5">
              {REENTRY_STAGES.map((step, i) => {
                const Icon = step.icon;
                const isSelected = reentryIndex === i;
                return (
                  <button
                    key={step.planKey}
                    type="button"
                    onClick={() => setReentryIndex(i)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border-2 transition-all",
                      isSelected
                        ? "border-primary bg-primary text-white shadow-md scale-[1.02]"
                        : "border-zinc-200 bg-white text-zinc-600 hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm cursor-pointer",
                    )}
                  >
                    <Icon className={cn("w-3.5 h-3.5", isSelected ? "text-white" : step.color)} />
                    {step.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Pipeline: previous worker → keep or change */}
        <div className="px-5 py-4 space-y-1">
          {visibleSteps.map((step, i) => {
            const Icon = step.icon;
            const currentWorker = plan[step.planKey] ?? "";
            const previousWorker = historyAsPlan[step.planKey];
            const isEditing = editingStep === step.planKey;
            const stepWorkers = resources.filter((r) => r.responsibility === step.responsibility);
            const stepWorkload = workload[step.planKey] ?? {};

            return (
              <div key={step.planKey} className="relative">
                {i > 0 && <div className="absolute left-[13px] -top-1 w-0.5 h-2 bg-zinc-200" />}

                <div className={cn(
                  "border rounded-xl p-3 transition-all",
                  currentWorker ? "border-zinc-300 bg-white" : "border-zinc-200 bg-zinc-50",
                )}>
                  {/* Step header */}
                  <div className="flex items-center gap-2.5">
                    <div className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                      currentWorker ? step.accent + " text-white" : "bg-zinc-100",
                    )}>
                      {currentWorker ? <Check className="w-4 h-4" /> : <Icon className={cn("w-4 h-4", step.color)} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold">{step.label}</span>
                      {currentWorker && (
                        <p className="text-xs text-muted-foreground">
                          {currentWorker}
                          {previousWorker && currentWorker !== previousWorker && (
                            <span className="text-orange-500 ml-1">(was {previousWorker})</span>
                          )}
                        </p>
                      )}
                      {!currentWorker && previousWorker && (
                        <p className="text-xs text-muted-foreground italic">Previously: {previousWorker}</p>
                      )}
                    </div>
                    {currentWorker && !isEditing && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                        onClick={() => setEditingStep(step.planKey)}
                      >
                        Change
                      </Button>
                    )}
                  </div>

                  {/* Worker selection — shown when no worker or editing */}
                  {(!currentWorker || isEditing) && (
                    <div className="mt-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {stepWorkers.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic py-1">No workers available</p>
                        ) : (
                          stepWorkers
                            .sort((a, b) => {
                              const aLoad = stepWorkload[a.resource_name] ?? 0;
                              const bLoad = stepWorkload[b.resource_name] ?? 0;
                              return aLoad - bLoad;
                            })
                            .map((r) => {
                              const load = stepWorkload[r.resource_name] ?? 0;
                              const cap = r.daily_target ?? 0;
                              const isOver = cap > 0 && load >= cap;
                              const isSelected = currentWorker === r.resource_name;

                              return (
                                <button
                                  key={r.id}
                                  type="button"
                                  onClick={() => {
                                    setPlan((prev) => ({ ...prev, [step.planKey]: r.resource_name }));
                                    setEditingStep(null);
                                  }}
                                  className={cn(
                                    "inline-flex items-center gap-1.5 border rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                                    isSelected
                                      ? "border-primary bg-primary text-white shadow-sm"
                                      : isOver
                                        ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50",
                                  )}
                                >
                                  {isSelected && <Check className="w-3 h-3 shrink-0" />}
                                  <span className="truncate max-w-[100px]">{r.resource_name}</span>
                                  {r.resource_type === "Senior" && (
                                    <span className={cn("text-[9px] font-bold uppercase", isSelected ? "text-white/80" : "text-amber-500")}>Sr</span>
                                  )}
                                  <span className={cn(
                                    "text-[10px] font-bold tabular-nums",
                                    isSelected ? "text-white/70" : isOver ? "text-red-500" : load > 0 ? "text-orange-500" : "text-emerald-500",
                                  )}>
                                    {cap > 0 ? `${load}/${cap}` : load > 0 ? load : "0"}
                                  </span>
                                </button>
                              );
                            })
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
        <div className="sticky bottom-0 bg-white border-t px-5 py-3 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!date || !allFilled}>
            Schedule
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
