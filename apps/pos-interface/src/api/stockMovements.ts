import { db } from "@/lib/db";
import type { StockMovement, StockMovementType, StockItemType, StockLocation } from "@repo/database";

export type MovementWithJoins = StockMovement & {
  supplier?: { id: number; name: string } | null;
  user?: { id: string; name: string } | null;
};

export type MovementFilters = {
  itemType?: StockItemType;
  itemId?: number;
  location?: StockLocation;
  movementType?: StockMovementType;
  fromDate?: string;
  toDate?: string;
  limit?: number;
};

export async function getMovements(filters: MovementFilters = {}): Promise<MovementWithJoins[]> {
  let q = db
    .from("stock_movements")
    .select("*, supplier:suppliers(id,name), user:users(id,name)")
    .order("created_at", { ascending: false });

  if (filters.itemType) q = q.eq("item_type", filters.itemType);
  if (filters.itemId) q = q.eq("item_id", filters.itemId);
  if (filters.location) q = q.eq("location", filters.location);
  if (filters.movementType) q = q.eq("movement_type", filters.movementType);
  if (filters.fromDate) q = q.gte("created_at", filters.fromDate);
  if (filters.toDate) q = q.lt("created_at", filters.toDate);
  q = q.limit(filters.limit ?? 200);

  const { data, error } = await q;
  if (error) throw new Error(`Could not load stock movements: ${error.message}`);
  return (data ?? []) as MovementWithJoins[];
}

export type RestockArgs = {
  itemType: StockItemType;
  itemId: number;
  location: StockLocation;
  qty: number;
  supplierId?: number | null;
  unitCost?: number | null;
  notes?: string;
  userId?: string | null;
};

export async function restockItem(args: RestockArgs): Promise<{ success: boolean; new_stock: number }> {
  const { data, error } = await db.rpc("restock_item", {
    p_item_type: args.itemType,
    p_item_id: args.itemId,
    p_location: args.location,
    p_qty: args.qty,
    p_supplier_id: args.supplierId ?? null,
    p_unit_cost: args.unitCost ?? null,
    p_notes: args.notes ?? null,
    p_user_id: args.userId ?? null,
  });
  if (error) throw new Error(`Restock failed: ${error.message}`);
  return data as { success: boolean; new_stock: number };
}

export type AdjustArgs = {
  itemType: StockItemType;
  itemId: number;
  location: StockLocation;
  newQty: number;
  reason: string;
  notes?: string;
  userId?: string | null;
};

export async function adjustStock(args: AdjustArgs): Promise<{ success: boolean; old_stock: number; new_stock: number }> {
  const { data, error } = await db.rpc("adjust_stock", {
    p_item_type: args.itemType,
    p_item_id: args.itemId,
    p_location: args.location,
    p_new_qty: args.newQty,
    p_reason: args.reason,
    p_notes: args.notes ?? null,
    p_user_id: args.userId ?? null,
  });
  if (error) throw new Error(`Stock adjustment failed: ${error.message}`);
  return data as { success: boolean; old_stock: number; new_stock: number };
}

export type AggregatesResult = {
  totals: Partial<Record<StockMovementType, number>>;
  count: number;
};

export async function getMovementAggregates(args: {
  from: string;
  to: string;
  itemType?: StockItemType;
  location?: StockLocation;
}): Promise<AggregatesResult> {
  const { data, error } = await db.rpc("get_movement_aggregates", {
    p_from: args.from,
    p_to: args.to,
    p_item_type: args.itemType ?? null,
    p_location: args.location ?? null,
  });
  if (error) throw new Error(`Could not load aggregates: ${error.message}`);
  return data as AggregatesResult;
}

export type TopItem = { item_type: StockItemType; item_id: number; total: number; name: string | null };

export async function getTopItemsByMovement(args: {
  movementType: StockMovementType;
  from: string;
  to: string;
  limit?: number;
}): Promise<TopItem[]> {
  const { data, error } = await db.rpc("get_top_items_by_movement", {
    p_movement_type: args.movementType,
    p_from: args.from,
    p_to: args.to,
    p_limit: args.limit ?? 10,
  });
  if (error) throw new Error(`Could not load top items: ${error.message}`);
  return (data ?? []) as TopItem[];
}

// ─── Per-item analytics (consumption, restock, top consumers) ──────────────

export type UsageStats = {
  yesterday: number;
  last7d: number;
  last30d: number;
};

/**
 * Sum of consumption movements (qty_delta < 0 with movement_type='consumption')
 * for an item across yesterday, last 7 days, and last 30 days.
 *
 * Yesterday = the prior calendar day in the user's local timezone.
 */
export async function getItemUsageStats(
  itemType: StockItemType,
  itemId: number,
): Promise<UsageStats> {
  const now = new Date();
  const startOf = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const todayStart = startOf(now);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const sevenStart = new Date(todayStart);
  sevenStart.setDate(sevenStart.getDate() - 7);
  const thirtyStart = new Date(todayStart);
  thirtyStart.setDate(thirtyStart.getDate() - 30);

  const { data, error } = await db
    .from("stock_movements")
    .select("qty_delta, created_at")
    .eq("item_type", itemType)
    .eq("item_id", itemId)
    .eq("movement_type", "consumption")
    .gte("created_at", thirtyStart.toISOString())
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Could not load usage stats: ${error.message}`);

  let yesterday = 0, last7d = 0, last30d = 0;
  for (const row of data ?? []) {
    const ts = new Date(row.created_at).getTime();
    const out = -Number(row.qty_delta); // consumption deltas are negative
    if (ts >= thirtyStart.getTime()) last30d += out;
    if (ts >= sevenStart.getTime()) last7d += out;
    if (ts >= yesterdayStart.getTime() && ts < todayStart.getTime()) yesterday += out;
  }
  return { yesterday, last7d, last30d };
}

export type TopConsumingOrder = {
  order_id: number;
  total: number;
  last_at: string;
};

/**
 * Top orders by quantity consumed of this item over the last `days` days.
 * Skip for accessories (not used in orders).
 */
export async function getTopConsumingOrders(
  itemType: StockItemType,
  itemId: number,
  days = 30,
  limit = 5,
): Promise<TopConsumingOrder[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await db
    .from("stock_movements")
    .select("ref_id, qty_delta, created_at")
    .eq("item_type", itemType)
    .eq("item_id", itemId)
    .eq("movement_type", "consumption")
    .eq("ref_type", "order")
    .gte("created_at", since.toISOString())
    .not("ref_id", "is", null);

  if (error) throw new Error(`Could not load top consuming orders: ${error.message}`);

  const map = new Map<number, { total: number; last_at: string }>();
  for (const row of data ?? []) {
    const id = Number(row.ref_id);
    if (!id) continue;
    const out = -Number(row.qty_delta);
    const cur = map.get(id);
    if (cur) {
      cur.total += out;
      if (row.created_at > cur.last_at) cur.last_at = row.created_at;
    } else {
      map.set(id, { total: out, last_at: row.created_at });
    }
  }
  return Array.from(map.entries())
    .map(([order_id, v]) => ({ order_id, total: v.total, last_at: v.last_at }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export type RestockHistoryEntry = {
  id: number;
  created_at: string;
  qty: number;
  unit_cost: number | null;
  supplier: { id: number; name: string } | null;
  notes: string | null;
};

/**
 * Restock history for an item: every restock movement, joined with supplier name.
 * Useful for tracking unit_cost trends per supplier.
 */
export async function getRestockHistory(
  itemType: StockItemType,
  itemId: number,
  limit = 50,
): Promise<RestockHistoryEntry[]> {
  const { data, error } = await db
    .from("stock_movements")
    .select("id, created_at, qty_delta, unit_cost, notes, supplier:suppliers(id,name)")
    .eq("item_type", itemType)
    .eq("item_id", itemId)
    .eq("movement_type", "restock")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Could not load restock history: ${error.message}`);

  type Row = {
    id: number;
    created_at: string;
    qty_delta: number | string;
    unit_cost: number | string | null;
    notes: string | null;
    supplier: { id: number; name: string } | null;
  };
  return (data ?? []).map((r) => {
    const row = r as unknown as Row;
    return {
      id: row.id,
      created_at: row.created_at,
      qty: Number(row.qty_delta),
      unit_cost: row.unit_cost == null ? null : Number(row.unit_cost),
      supplier: row.supplier ?? null,
      notes: row.notes ?? null,
    };
  });
}

/**
 * True if this item has any stock movements logged. Used to lock fields
 * (e.g. unit_of_measure on accessories) once the item has been transacted.
 */
export async function itemHasMovements(
  itemType: StockItemType,
  itemId: number,
): Promise<boolean> {
  const { count, error } = await db
    .from("stock_movements")
    .select("id", { count: "exact", head: true })
    .eq("item_type", itemType)
    .eq("item_id", itemId);
  if (error) throw new Error(`Could not check movements: ${error.message}`);
  return (count ?? 0) > 0;
}

// POS-only: atomic order consumption (replaces useOrderMutations Promise.all)
export type OrderConsumptionArgs = {
  orderId: number;
  fabricItems: Array<{ garment_id: string; fabric_id: number; qty: number }>;
  shelfItems: Array<{ shelf_id: number; qty: number }>;
  userId?: string | null;
};

export async function consumeForOrder(args: OrderConsumptionArgs): Promise<{ success: boolean; order_id: number }> {
  const { data, error } = await db.rpc("consume_for_order", {
    p_order_id: args.orderId,
    p_fabric_items: args.fabricItems,
    p_shelf_items: args.shelfItems,
    p_user_id: args.userId ?? null,
  });
  if (error) throw new Error(`Order consumption failed: ${error.message}`);
  return data as { success: boolean; order_id: number };
}
