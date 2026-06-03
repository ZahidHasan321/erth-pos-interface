import type { JobFunction, ProductionStage } from "@repo/database";

// job_function (person noun) → production_stage (verb noun).
// Used by user CRUD pages to seed `resources.responsibility` from a chosen
// job, and by TerminalLayout to drive the tab bar.
export const JOB_FUNCTION_TO_STAGE: Record<JobFunction, ProductionStage> = {
  soaker: "soaking",
  cutter: "cutting",
  post_cutter: "post_cutting",
  sewer: "sewing",
  finisher: "finishing",
  ironer: "ironing",
  qc: "quality_check",
};

// Operational stations that require an EXPLICIT team (unit) assignment in
// worker create/edit (Q4 / CLAUDE.md §6). Each shows a visible, required team
// picker — a worker's unit is never silently defaulted to the lowest-id one.
// Soaking is excluded (all-hands, negligible labor — keeps auto-assignment);
// post_cutting is disabled.
export const TEAM_ASSIGNABLE_STAGES: ProductionStage[] = [
  "cutting", "sewing", "finishing", "ironing", "quality_check",
];

export function isTeamAssignableStage(stage: ProductionStage): boolean {
  return TEAM_ASSIGNABLE_STAGES.includes(stage);
}

// Picker label per stage (e.g. "Cutting team"). Full Record so the type is
// exhaustive; only TEAM_ASSIGNABLE_STAGES entries are ever shown.
export const STAGE_TEAM_LABELS: Record<ProductionStage, string> = {
  soaking: "Soaking team",
  cutting: "Cutting team",
  post_cutting: "Post-cutting team",
  sewing: "Sewing team",
  finishing: "Finishing team",
  ironing: "Ironing team",
  quality_check: "QC team",
};
