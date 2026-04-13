import { useMemo } from "react";
import { Check, Lock } from "lucide-react";
import { IconRosette } from "@tabler/icons-react";
import { useWorkshopWorkload } from "@/hooks/useWorkshopGarments";
import { cn } from "@/lib/utils";
import type { ProductionPlan } from "@repo/database";

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
}: {
  steps: readonly PlanStep[];
  selectedStages: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {steps.map((step) => {
        const Icon = step.icon;
        const isSelected = selectedStages.has(step.key);
        return (
          <button
            key={step.key}
            type="button"
            onClick={() => onToggle(step.key)}
            aria-pressed={isSelected}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border-2 transition-[color,background-color,border-color,box-shadow]",
              isSelected
                ? "border-primary bg-primary text-white shadow-md scale-[1.02]"
                : "border-zinc-200 bg-card text-zinc-600 hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm cursor-pointer",
            )}
          >
            <Icon className={cn("w-3.5 h-3.5", isSelected ? "text-white" : step.color)} />
            {step.label}
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
