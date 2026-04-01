import { cn } from "@/lib/utils";
import { RotateCcw } from "lucide-react";

const PIPELINE_STAGES = [
  { key: "soaking",       label: "Soak" },
  { key: "cutting",       label: "Cut" },
  { key: "post_cutting",  label: "Post-Cut" },
  { key: "sewing",        label: "Sew" },
  { key: "finishing",     label: "Finish" },
  { key: "ironing",       label: "Iron" },
  { key: "quality_check", label: "QC" },
];

/** Stages that come AFTER the production pipeline — all steps should show as done */
const POST_PRODUCTION_STAGES = new Set([
  "ready_for_dispatch", "awaiting_trial",
  "ready_for_pickup", "brova_trialed", "completed",
]);


interface ProductionPipelineProps {
  currentStage: string | null | undefined;
  compact?: boolean;
  hasSoaking: boolean;
  /** When set, only show stages from this re-entry point onward */
  reentryStage?: string | null;
  /** Number of QC fails in the current trip (shows indicator) */
  qcFailCount?: number;
}

export function ProductionPipeline({ currentStage, compact = false, hasSoaking, reentryStage, qcFailCount = 0 }: ProductionPipelineProps) {
  let stages = hasSoaking ? PIPELINE_STAGES : PIPELINE_STAGES.filter((s) => s.key !== "soaking");

  // For re-entry garments, only show from re-entry stage onward
  if (reentryStage) {
    const reentryIdx = stages.findIndex((s) => s.key === reentryStage);
    if (reentryIdx > 0) {
      stages = stages.slice(reentryIdx);
    }
  }

  const order = stages.map((s) => s.key);
  const isPostProduction = currentStage ? POST_PRODUCTION_STAGES.has(currentStage) : false;
  const current = isPostProduction ? stages.length : (currentStage ? order.indexOf(currentStage) : -1);

  return (
    <div className={cn("flex items-center gap-0.5 flex-wrap", compact ? "text-[10px]" : "text-xs")}>
      {reentryStage && (
        <span className={cn(
          "inline-flex items-center gap-0.5 font-semibold uppercase tracking-wider text-orange-600 mr-0.5",
          compact ? "text-[9px]" : "text-[10px]",
        )}>
          <RotateCcw className={cn(compact ? "w-2.5 h-2.5" : "w-3 h-3")} />
        </span>
      )}
      {stages.map((stage, i) => {
        const isDone = i < current;
        const isActive = i === current;
        const isPending = i > current;
        const isQcWithFails = stage.key === "quality_check" && qcFailCount > 0;

        return (
          <div key={stage.key} className="flex items-center">
            <div
              className={cn(
                "rounded-md px-1.5 py-0.5 font-semibold uppercase tracking-wider transition-[color,background-color,border-color,box-shadow]",
                compact ? "px-1" : "px-1.5",
                isDone && !isQcWithFails && "bg-emerald-100 text-emerald-800 border border-emerald-200/60",
                isDone && isQcWithFails && "bg-amber-100 text-amber-800 border border-amber-200/60",
                isActive && !isQcWithFails && "bg-primary text-primary-foreground shadow-sm",
                isActive && isQcWithFails && "bg-amber-500 text-white shadow-sm",
                isPending && "bg-muted text-muted-foreground/50",
              )}
            >
              {stage.label}
              {isQcWithFails && (
                <span className={cn(
                  "ml-0.5 inline-flex items-center justify-center rounded-full bg-red-500 text-white font-bold",
                  compact ? "w-3 h-3 text-[7px]" : "w-3.5 h-3.5 text-[8px]",
                )}>
                  {qcFailCount}
                </span>
              )}
            </div>
            {i < stages.length - 1 && (
              <div className={cn("w-2 h-0.5 mx-0.5 rounded-full", isDone ? "bg-emerald-300" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}
