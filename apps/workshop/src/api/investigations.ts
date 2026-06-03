import { db } from "@/lib/db";

/** A garment auto-held for repeated returns (CLAUDE.md §2.10). */
export interface InvestigationGarment {
  id: string;
  garment_id: string | null;
  order_id: number;
  garment_type: string | null;
  piece_stage: string | null;
  trip_number: number | null;
  trip_history: Array<{ qc_attempts?: Array<{ result?: string | null }> | null }> | null;
  order: {
    workOrder: { invoice_number: string | null; delivery_date: string | null } | null;
    customer: { name: string | null } | null;
  } | null;
}

export const getNeedsInvestigation = async (): Promise<InvestigationGarment[]> => {
  const { data, error } = await db
    .from("garments")
    .select(
      `id, garment_id, order_id, garment_type, piece_stage, trip_number, trip_history,
       order:orders!order_id(
         workOrder:work_orders!order_id(invoice_number, delivery_date),
         customer:customers!customer_id(name)
       )`
    )
    .eq("needs_investigation", true)
    .order("order_id", { ascending: true });
  if (error) throw new Error(`getNeedsInvestigation: failed to fetch garments needing investigation: ${error.message}`);
  return (data ?? []) as unknown as InvestigationGarment[];
};

/** Quality returns = # of QC fails across the garment's history (CLAUDE.md §2.10). */
export function qualityReturns(g: Pick<InvestigationGarment, "trip_history">): number {
  if (!Array.isArray(g.trip_history)) return 0;
  let n = 0;
  for (const t of g.trip_history) {
    const atts = Array.isArray(t?.qc_attempts) ? t.qc_attempts! : [];
    for (const a of atts) if (a?.result === "fail") n++;
  }
  return n;
}

/** Alteration returns = trip_number − 1 (CLAUDE.md §2.10). */
export function alterationReturns(g: Pick<InvestigationGarment, "trip_number">): number {
  return Math.max((g.trip_number ?? 0) - 1, 0);
}

export type InvestigationDecision = "continue" | "redo" | "refund";

export interface RecordInvestigationArgs {
  garmentId: string;
  rootCause: string;
  decision: InvestigationDecision;
  historyNote?: string;
  correctiveShort?: string;
  correctiveLong?: string;
  userId?: string | null;
  idempotencyKey: string;
}

export interface RecordInvestigationResult {
  investigation_id: string;
  decision: InvestigationDecision;
  resumed: boolean;
}

export const recordInvestigation = async (
  a: RecordInvestigationArgs
): Promise<RecordInvestigationResult> => {
  const { data, error } = await db.rpc("record_investigation", {
    p_garment_id: a.garmentId,
    p_root_cause: a.rootCause,
    p_decision: a.decision,
    p_history_note: a.historyNote ?? null,
    p_corrective_short: a.correctiveShort ?? null,
    p_corrective_long: a.correctiveLong ?? null,
    p_user_id: a.userId ?? null,
    p_idempotency_key: a.idempotencyKey,
  });
  if (error) throw new Error(`recordInvestigation: failed to resolve investigation for garment ${a.garmentId}: ${error.message}`);
  return data as RecordInvestigationResult;
};
