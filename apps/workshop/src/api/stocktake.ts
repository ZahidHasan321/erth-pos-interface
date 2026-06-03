import { db, isTransientNetworkError, withWriteRetry } from "@/lib/db";
import type { StockItemType, StockLocation } from "@repo/database";

// Per-side cadence status powering the soft-block banner. tier: 0 ok / 1 overdue
// (warn) / 3 >3 days overdue (hard nag — still dismissible).
export type StocktakeStatusResult = {
  last_validated_at: string | null;
  open_session_id: number | null;
  overdue: boolean;
  days_overdue: number;
  tier: 0 | 1 | 3;
};

export async function getStocktakeStatus(side: StockLocation): Promise<StocktakeStatusResult> {
  const { data, error } = await db.rpc("get_stocktake_status", { p_side: side });
  if (error) throw new Error(`Could not load stocktake status: ${error.message}`);
  return data as StocktakeStatusResult;
}

export async function startStocktake(side: StockLocation, userId?: string | null): Promise<{ session_id: number }> {
  const p_idempotency_key = crypto.randomUUID();
  const { data, error } = await withWriteRetry(
    () => db.rpc("start_stocktake", { p_side: side, p_brand: "ERTH", p_user_id: userId ?? null, p_idempotency_key }),
    (r) => isTransientNetworkError(r.error),
  );
  if (error) throw new Error(`Could not start stocktake: ${error.message}`);
  return data as { session_id: number };
}

export type StocktakeCountInput = {
  item_type: StockItemType;
  item_id: number;
  counted_qty: number | null;
  reason: string | null;
};

export async function saveStocktakeCounts(
  sessionId: number,
  counts: StocktakeCountInput[],
  userId?: string | null,
): Promise<void> {
  const { error } = await withWriteRetry(
    () => db.rpc("save_stocktake_counts", { p_session_id: sessionId, p_counts: counts, p_user_id: userId ?? null }),
    (r) => isTransientNetworkError(r.error),
  );
  if (error) throw new Error(`Could not save stocktake counts: ${error.message}`);
}

export async function validateStocktake(sessionId: number, userId?: string | null): Promise<{ adjustments_applied: number }> {
  const p_idempotency_key = crypto.randomUUID();
  const { data, error } = await withWriteRetry(
    () => db.rpc("validate_stocktake", { p_session_id: sessionId, p_user_id: userId ?? null, p_idempotency_key }),
    (r) => isTransientNetworkError(r.error),
  );
  if (error) throw new Error(`Could not validate stocktake: ${error.message}`);
  return data as { adjustments_applied: number };
}

export type StocktakeCountRow = {
  item_type: StockItemType;
  item_id: number;
  // Postgres numeric columns come back from PostgREST as JS numbers, not strings.
  system_qty: number | null;
  counted_qty: number | null;
  variance: number | null;
  reason: string | null;
};

export async function getStocktakeCounts(sessionId: number): Promise<StocktakeCountRow[]> {
  const { data, error } = await db
    .from("stocktake_counts")
    .select("item_type,item_id,system_qty,counted_qty,variance,reason")
    .eq("session_id", sessionId);
  if (error) throw new Error(`Could not load stocktake counts: ${error.message}`);
  return (data ?? []) as StocktakeCountRow[];
}

export type StocktakeHistoryRow = {
  id: number;
  started_at: string;
  validated_at: string | null;
};

export async function getStocktakeHistory(side: StockLocation, limit = 12): Promise<StocktakeHistoryRow[]> {
  const { data, error } = await db
    .from("stocktake_sessions")
    .select("id,started_at,validated_at")
    .eq("side", side)
    .eq("status", "validated")
    .order("validated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load stocktake history: ${error.message}`);
  return (data ?? []) as StocktakeHistoryRow[];
}

export type StocktakeSessionRow = {
  id: number;
  side: StockLocation;
  status: string;
  started_at: string;
  validated_at: string | null;
};

export async function getStocktakeSession(sessionId: number): Promise<StocktakeSessionRow | null> {
  const { data, error } = await db
    .from("stocktake_sessions")
    .select("id,side,status,started_at,validated_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error(`Could not load stocktake session ${sessionId}: ${error.message}`);
  return (data ?? null) as StocktakeSessionRow | null;
}
