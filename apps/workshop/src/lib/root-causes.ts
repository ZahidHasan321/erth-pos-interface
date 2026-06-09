import type { RootCause, RedoParkedReason } from "@repo/database";

// Shared root-cause attribution vocabulary (CLAUDE.md §2.9). The six values are
// the DB `root_cause` enum (mirrored in schema.ts); no group invents its own —
// the keys here ARE the enum values, so a TS error fires if the enum ever drifts.
// `desc` is the in-dialog hint; the responsible party is derived server-side
// (root_cause_responsible_party), never restated here.
export const ROOT_CAUSES: { value: RootCause; label: string; desc: string }[] = [
  { value: "production_error", label: "Production error", desc: "Cutting / sewing / finishing / ironing / execution-measurement mistake" },
  { value: "qc_escape", label: "QC escape", desc: "A technical defect QC passed that should have failed" },
  { value: "showroom_error", label: "Showroom error", desc: "Wrong measurement taken, wrong option entered, bad briefing" },
  { value: "customer_change", label: "Customer change", desc: "Change of mind / expectation mismatch, no internal fault" },
  { value: "material_defect", label: "Material defect", desc: "Supplier / material quality" },
  { value: "other", label: "Other", desc: "Anything else (note required)" },
];

export function getRootCauseLabel(value: string | null | undefined): string {
  if (!value) return "-";
  return ROOT_CAUSES.find((r) => r.value === value)?.label ?? value;
}

export const REDO_PARKED_REASON_LABELS: Record<RedoParkedReason, string> = {
  waiting_material: "Replacement fabric short",
  customer_decision: "Customer must provide cloth",
  approval: "Needs approval",
  clarification: "Needs clarification",
};

export function getRedoParkedReasonLabel(value: string | null | undefined): string {
  if (!value) return "-";
  return REDO_PARKED_REASON_LABELS[value as RedoParkedReason] ?? value;
}
