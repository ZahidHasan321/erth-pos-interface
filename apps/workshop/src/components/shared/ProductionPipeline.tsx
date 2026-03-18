import { cn } from "@/lib/utils";

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
}

export function ProductionPipeline({ currentStage, compact = false, hasSoaking }: ProductionPipelineProps) {
  const stages = hasSoaking ? PIPELINE_STAGES : PIPELINE_STAGES.filter((s) => s.key !== "soaking");
  const order = stages.map((s) => s.key);
  const isPostProduction = currentStage ? POST_PRODUCTION_STAGES.has(currentStage) : false;
  const current = isPostProduction ? stages.length : (currentStage ? order.indexOf(currentStage) : -1);

  return (
    <div className={cn("flex items-center gap-0.5", compact ? "text-[10px]" : "text-xs")}>
      {stages.map((stage, i) => {
        const isDone = i < current;
        const isActive = i === current;
        const isPending = i > current;

        return (
          <div key={stage.key} className="flex items-center">
            <div
              className={cn(
                "rounded-md px-1.5 py-0.5 font-semibold uppercase tracking-wider transition-[color,background-color,border-color,box-shadow]",
                compact ? "px-1" : "px-1.5",
                isDone && "bg-emerald-100 text-emerald-800 border border-emerald-200/60",
                isActive && "bg-primary text-primary-foreground shadow-sm",
                isPending && "bg-muted text-muted-foreground/50",
              )}
            >
              {stage.label}
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
