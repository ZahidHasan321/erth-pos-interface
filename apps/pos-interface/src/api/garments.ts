import type { ApiResponse } from "../types/api";
import type { Garment } from "@repo/database";
import { db, isTransientNetworkError, withWriteRetry } from "@/lib/db";
import { parseUtcTimestamp } from "@/lib/utils";
import { getBrand } from "./orders";

const TABLE_NAME = "garments";

export const updateGarment = async (
  id: string,
  garment: Partial<Garment>
): Promise<ApiResponse<Garment>> => {
  const { data, error } = await withWriteRetry(
    () => db
      .from(TABLE_NAME)
      .update(garment)
      .eq('id', id)
      .select()
      .single(),
    (r) => isTransientNetworkError(r.error),
  );

  if (error) {
    console.error('updateGarment: failed to update garment:', error);
    throw error;
  }
  return { status: 'success', data: data as Garment };
};

export const getGarmentsForRedispatch = async (): Promise<ApiResponse<Garment[]>> => {
  // Find garments at shop that have a feedback record requesting "workshop" distribution
  // for the garment's current trip number
  const { data, error } = await db
    .from(TABLE_NAME)
    .select(`
      *,
      orders!inner (
        id,
        customer_id,
        customers ( id, name, phone ),
        work_orders!work_orders_order_id_orders_id_fk ( invoice_number )
      ),
      garment_feedback!inner (
        id, action, distribution, satisfaction_level, notes, measurement_diffs, options_checklist, trip_number, created_at
      )
    `)
    .eq('location', 'shop')
    .neq('piece_stage', 'discarded')
    .eq('orders.brand', getBrand())
    .eq('garment_feedback.distribution', 'workshop');

  if (error) {
    console.error('getGarmentsForRedispatch: failed to fetch garments for redispatch:', error);
    return { status: 'error', message: error.message, data: [], count: 0 };
  }

  // Filter client-side: only keep garments where the feedback trip_number matches the garment's current trip
  type FeedbackRow = { distribution: string | null; created_at: string | null; trip_number: number | null };
  const filtered = (data || []).filter(g => {
    const latestWorkshopFeedback = (g.garment_feedback as FeedbackRow[] | undefined)
      ?.filter((f) => f.distribution === 'workshop')
      ?.sort((a, b) => parseUtcTimestamp(b.created_at || "").getTime() - parseUtcTimestamp(a.created_at || "").getTime())[0];
    return latestWorkshopFeedback && latestWorkshopFeedback.trip_number === (g.trip_number || 1);
  });

  return { status: 'success', data: filtered as Garment[], count: filtered.length };
};

export const dispatchGarmentToWorkshop = async (
  garmentId: string
): Promise<ApiResponse<Garment>> => {
  // Atomic RPC (dispatch_garment_to_workshop, triggers.sql): the garment flip to
  // transit_to_workshop on its next trip_number AND the append-only dispatch_log
  // audit row happen in one transaction, gated on location = 'shop' so a retry
  // is a no-op. Replaces the old client UPDATE + best-effort log insert, which
  // could silently drop the History row and double-bump trip_number on retry.
  const { error } = await withWriteRetry(
    () => db.rpc('dispatch_garment_to_workshop', { p_garment_id: garmentId }),
    (r) => isTransientNetworkError(r.error),
  );

  if (error) {
    console.error('dispatchGarmentToWorkshop: failed to dispatch garment to workshop:', error);
    return { status: 'error', message: `Failed to dispatch garment ${garmentId} to workshop: ${error.message}` };
  }

  const { data } = await db.from(TABLE_NAME).select('*').eq('id', garmentId).single();
  return { status: 'success', data: data as Garment };
};

// ── Redo (brova trial, SPEC §2.5) ───────────────────────────────────────────
// Redo is decided at the brova feedback page (shop-initiated). The shop either
// creates a replacement (from our stock or the customer's fabric) that waits in
// the shop dispatch queue and is then dispatched like any garment, OR discards
// the brova and promotes a parked final to be the new trial brova. No root_cause
// is captured at the shop redo (§2.5); the cashier handles any refund (§2.6/§3).

export interface RedoReplacementResult {
  id: string;
  garment_id: string;
  parked: boolean;
  parked_reason: "waiting_material" | "customer_decision" | null;
  fabric_source: "IN" | "OUT";
}

/**
 * create_replacement_garment RPC (§2.5 outcomes 1–2). Clones the discarded
 * brova's spec into a fresh replacement at the SHOP (trip 0, waiting_cut), to be
 * dispatched like any garment. `fabricSource` defaults to the original's; pass
 * `fabricId` when switching a customer-cloth original to our stock. An IN
 * replacement short on stock, or an OUT (customer) replacement, is created
 * WAITING IN DISPATCH (`parked_reason`) until resumed from the dispatch page.
 */
export const createRedoReplacement = async (
  brovaId: string,
  opts: {
    fabricSource?: "IN" | "OUT" | null;
    fabricId?: number | null;
    userId?: string | null;
    idempotencyKey?: string;
  } = {},
): Promise<ApiResponse<RedoReplacementResult>> => {
  const idempotencyKey = opts.idempotencyKey ?? crypto.randomUUID();
  const { data, error } = await withWriteRetry(
    () => db.rpc('create_replacement_garment', {
      p_replaces_garment_id: brovaId,
      p_user_id: opts.userId ?? null,
      p_idempotency_key: idempotencyKey,
      p_fabric_source: opts.fabricSource ?? null,
      p_fabric_id: opts.fabricId ?? null,
    }),
    (r) => isTransientNetworkError(r.error),
  );
  if (error) {
    console.error('createRedoReplacement: failed to create redo replacement:', error);
    return { status: 'error', message: `Failed to create redo replacement for brova ${brovaId}: ${error.message}` };
  }
  return { status: 'success', data: data as RedoReplacementResult };
};

/**
 * resume_parked_redo RPC (§2.5/§6). Un-parks a replacement waiting in the shop
 * dispatch queue once the customer brought their cloth or our stock was
 * restocked; for IN fabric this lands the deferred -L cut. The replacement then
 * becomes dispatchable.
 */
export const resumeRedoReplacement = async (
  garmentId: string,
  opts: { userId?: string | null; idempotencyKey?: string } = {},
): Promise<ApiResponse<{ resumed: boolean; consumed: number }>> => {
  const idempotencyKey = opts.idempotencyKey ?? crypto.randomUUID();
  const { data, error } = await withWriteRetry(
    () => db.rpc('resume_parked_redo', {
      p_garment_id: garmentId,
      p_user_id: opts.userId ?? null,
      p_idempotency_key: idempotencyKey,
    }),
    (r) => isTransientNetworkError(r.error),
  );
  if (error) {
    console.error('resumeRedoReplacement: failed to resume parked redo:', error);
    return { status: 'error', message: `Failed to resume redo replacement ${garmentId}: ${error.message}` };
  }
  return { status: 'success', data: data as { resumed: boolean; consumed: number } };
};

/**
 * redo_promote_final_to_brova RPC (§2.5 outcome 3). Discards the brova and
 * (optionally) promotes a parked final to be the new trial brova. `finalId` null
 * → discard-only. Writes no money — the refund is the cashier's job (§2.6/§3).
 */
export const redoPromoteFinalToBrova = async (
  brovaId: string,
  finalId: string | null,
  opts: { userId?: string | null; idempotencyKey?: string } = {},
): Promise<ApiResponse<{ brova_id: string; promoted_final_id: string | null; promoted_garment_id: string | null }>> => {
  const idempotencyKey = opts.idempotencyKey ?? crypto.randomUUID();
  const { data, error } = await withWriteRetry(
    () => db.rpc('redo_promote_final_to_brova', {
      p_brova_id: brovaId,
      p_final_id: finalId,
      p_user_id: opts.userId ?? null,
      p_idempotency_key: idempotencyKey,
    }),
    (r) => isTransientNetworkError(r.error),
  );
  if (error) {
    console.error('redoPromoteFinalToBrova: failed to promote final to brova:', error);
    return { status: 'error', message: `Failed to discard brova ${brovaId} / promote final: ${error.message}` };
  }
  return { status: 'success', data: data as { brova_id: string; promoted_final_id: string | null; promoted_garment_id: string | null } };
};
