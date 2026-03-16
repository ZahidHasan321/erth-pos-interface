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
    <div className={cn("flex items-center gap-0.5", compact ? "text-[9px]" : "text-[10px]")}>
      {stages.map((stage, i) => {
        const isDone = i < current;
        const isActive = i === current;
        const isPending = i > current;

        return (
          <div key={stage.key} className="flex items-center">
            <div
              className={cn(
                "rounded px-1.5 py-0.5 font-semibold uppercase tracking-wider transition-all",
                compact ? "px-1" : "px-1.5",
                isDone && "bg-emerald-200 text-emerald-900",
                isActive && "bg-blue-600 text-white shadow",
                isPending && "bg-zinc-200 text-zinc-500",
              )}
            >
              {stage.label}
            </div>
            {i < stages.length - 1 && (
              <div className={cn("w-2 h-0.5 mx-0.5", isDone ? "bg-emerald-400" : "bg-gray-200")} />
            )}
          </div>
        );
      })}
    </div>
  );
}
