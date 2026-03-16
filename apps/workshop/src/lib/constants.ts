export const BRAND_NAMES = {
  erth: "erth",
  sakkba: "sakkba",
  qass: "qass",
} as const;

export type BrandName = (typeof BRAND_NAMES)[keyof typeof BRAND_NAMES];

export const PIECE_STAGE_LABELS = {
  waiting_for_acceptance: "Waiting for Acceptance",
  waiting_cut: "Waiting for Cut",
  soaking: "Soaking",
  cutting: "Cutting",
  post_cutting: "Post-Cutting",
  sewing: "Sewing",
  finishing: "Finishing",
  ironing: "Ironing",
  quality_check: "Quality Check",
  ready_for_dispatch: "Ready for Dispatch",
  awaiting_trial: "Awaiting Trial",
  ready_for_pickup: "Ready for Pickup",
  brova_trialed: "Brova Trialed",
  completed: "Completed",
} as const;

export const FEEDBACK_STATUS_LABELS = {
  accepted: "Accepted",
  needs_repair: "Needs Repair",
  needs_redo: "Needs Redo",
} as const;

export const FEEDBACK_STATUS_COLORS = {
  accepted: "bg-emerald-200 text-emerald-900",
  needs_repair: "bg-amber-200 text-amber-900",
  needs_redo: "bg-red-200 text-red-900",
} as const;

export const RESPONSIBILITY_LABELS = {
  soaking: "Soaking",
  cutting: "Cutting",
  post_cutting: "Post-Cutting",
  sewing: "Sewing",
  finishing: "Finishing",
  ironing: "Ironing",
  quality_check: "Quality Check",
} as const;

export const PRODUCTION_STAGES = [
  "soaking",
  "cutting",
  "post_cutting",
  "sewing",
  "finishing",
  "ironing",
  "quality_check",
] as const;

export type ProductionStage = (typeof PRODUCTION_STAGES)[number];

// Stage → next stage transition map
export const STAGE_NEXT: Record<string, string> = {
  soaking: "cutting",
  cutting: "post_cutting",
  post_cutting: "sewing",
  sewing: "finishing",
  finishing: "ironing",
  ironing: "quality_check",
  quality_check: "ready_for_dispatch",
};
