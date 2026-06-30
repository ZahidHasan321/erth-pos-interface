/**
 * Difference-reason → cell tint, mirroring the feedback page's DIFFERENCE_REASONS
 * colour cues (Customer = emerald, Workshop = red, Shop = amber). Used to colour
 * the "what's wrong" cells in the feedback preview, the same way the workshop
 * terminal tints flagged cells.
 */
export type DifferenceReason = "Customer Request" | "Workshop Error" | "Shop Error";

const REASON_TINT: Record<DifferenceReason, string> = {
  "Customer Request": "border border-emerald-500 bg-emerald-50 text-emerald-700",
  "Workshop Error": "border border-red-500 bg-red-50 text-red-700",
  "Shop Error": "border border-amber-500 bg-amber-50 text-amber-800",
};

/** A changed cell with no explicit reason — neutral "needs attention" yellow. */
const CHANGED_DEFAULT_TINT = "border border-yellow-500 bg-yellow-100 text-zinc-900";

/** Tint for a flagged cell. Falls back to the neutral changed highlight. */
export function reasonTint(reason: string | undefined | null): string {
  if (reason && reason in REASON_TINT) {
    return REASON_TINT[reason as DifferenceReason];
  }
  return CHANGED_DEFAULT_TINT;
}
