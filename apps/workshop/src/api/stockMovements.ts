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
