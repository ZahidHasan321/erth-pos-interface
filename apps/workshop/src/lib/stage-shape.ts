// Moved to @repo/database so apps/admin-dashboard can reuse the same stage-shape
// classification. Re-exported here so existing `@/lib/stage-shape` imports keep
// working unchanged.
export {
  getStageShape,
  WORKER_SCOPED_STAGES,
  UNIT_SCOPED_STAGES,
  GROUP_SCOPED_STAGES,
} from "@repo/database";
export type { StageShape } from "@repo/database";
