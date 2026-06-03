import { db, isTransientNetworkError, withWriteRetry } from "@/lib/db";
import type { Accessory } from '@repo/database';

export const getAccessories = async (includeArchived = false): Promise<Accessory[]> => {
  let query = db.from('accessories').select('*');
  if (!includeArchived) query = query.eq('is_archived', false);
  const { data, error } = await query;
  if (error) throw error;
  return data as Accessory[];
};

export const createAccessory = async (
  accessory: Omit<Accessory, 'id' | 'created_at'>,
): Promise<Accessory> => {
  const { data, error } = await db
    .from('accessories')
    .insert(accessory)
    .select()
    .single();

  if (error) throw error;
  return data as Accessory;
};

// Stock columns are intentionally not accepted here. All stock changes go
// through the stamping RPCs so the stock_movements ledger stays complete
// (CLAUDE.md §4); a metadata UPDATE must never carry an absolute stock figure.
export const updateAccessory = async (
  id: number,
  accessory: Partial<Omit<Accessory, "shop_stock" | "workshop_stock">>,
): Promise<Accessory> => {
  const { data, error } = await withWriteRetry(
    () => db
      .from('accessories')
      .update(accessory)
      .eq('id', id)
      .select()
      .single(),
    (r) => isTransientNetworkError(r.error),
  );

  if (error) throw error;
  return data as Accessory;
};

export const deleteAccessory = async (id: number): Promise<{ mode: "deleted" | "archived" }> => {
  const { error } = await withWriteRetry(
    () => db.from('accessories').delete().eq('id', id),
    (r) => isTransientNetworkError(r.error),
  );
  if (!error) return { mode: "deleted" };
  if (error.code === '23503') {
    const { error: updErr } = await withWriteRetry(
      () => db.from('accessories').update({ is_archived: true }).eq('id', id),
      (r) => isTransientNetworkError(r.error),
    );
    if (updErr) throw new Error(`Could not archive accessory: ${updErr.message}`);
    return { mode: "archived" };
  }
  throw new Error(`Could not delete accessory: ${error.message}`);
};

export const unarchiveAccessory = async (id: number): Promise<void> => {
  const { error } = await withWriteRetry(
    () => db.from('accessories').update({ is_archived: false }).eq('id', id),
    (r) => isTransientNetworkError(r.error),
  );
  if (error) throw new Error(`Could not unarchive accessory: ${error.message}`);
};
