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
