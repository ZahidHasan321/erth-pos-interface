import type { ProductionStage } from "@repo/database";

// Assignment shape per production stage — drives both /team and /performance UI.
//
//   group  → no per-worker or per-unit assignment. Anyone with the job function
//            sees the whole queue. Soaking is the only one (any soaker can
//            press Start/Done on any soak).
//   unit   → garment is assigned to a unit; any member of that unit acts on it.
//            production_plan.<role> holds the unit name. Sewing.
//   worker → garment is assigned to a specific worker. Everything else.
//
// Performance is measured at the same granularity as the assignment:
//   group → group-level totals only (no per-worker KPI is meaningful)
//   unit  → unit-level KPI (workers in the unit share the score)
//   worker → individual KPI

export type StageShape = "group" | "unit" | "worker";

export function getStageShape(stage: ProductionStage): StageShape {
  if (stage === "soaking") return "group";
  if (stage === "sewing") return "unit";
  return "worker";
}

export const WORKER_SCOPED_STAGES: ProductionStage[] = [
  "cutting",
  "post_cutting",
  "finishing",
  "ironing",
  "quality_check",
];

export const UNIT_SCOPED_STAGES: ProductionStage[] = ["sewing"];

export const GROUP_SCOPED_STAGES: ProductionStage[] = ["soaking"];
