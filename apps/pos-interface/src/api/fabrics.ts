import type { Fabric } from "@repo/database";
import { db, isTransientNetworkError, withWriteRetry } from "@/lib/db";

export const getFabrics = async (includeArchived = false): Promise<Fabric[]> => {
  let query = db.from('fabrics').select('*');
  if (!includeArchived) query = query.eq('is_archived', false);
  const { data, error } = await query;
  if (error) throw error;
  return data as Fabric[];
};

export const createFabric = async (
  fabric: Pick<Fabric, "name"> & Partial<Pick<Fabric, "color" | "color_hex" | "price_per_meter" | "shop_stock" | "season">>,
): Promise<Fabric> => {
  const { data, error } = await db.from('fabrics').insert(fabric).select().single();
  if (error) throw error;
  return data as Fabric;
};

// Stock columns are intentionally not accepted here. All stock changes go
// through the stamping RPCs so the stock_movements ledger stays complete
// (CLAUDE.md §4); a metadata UPDATE must never carry an absolute stock figure.
export const updateFabric = async (
  id: number,
  fabric: Partial<Omit<Fabric, "shop_stock" | "workshop_stock" | "real_stock">>,
): Promise<Fabric> => {
  const { data, error } = await withWriteRetry(
    () => db
      .from('fabrics')
      .update(fabric)
      .eq('id', id)
      .select()
      .single(),
    (r) => isTransientNetworkError(r.error),
  );

  if (error) throw error;
  return data as Fabric;
};

export const deleteFabric = async (id: number): Promise<{ mode: "deleted" | "archived" }> => {
  const { error } = await withWriteRetry(
    () => db.from('fabrics').delete().eq('id', id),
    (r) => isTransientNetworkError(r.error),
  );
  if (!error) return { mode: "deleted" };
  if (error.code === '23503') {
    const { error: updErr } = await withWriteRetry(
      () => db.from('fabrics').update({ is_archived: true }).eq('id', id),
      (r) => isTransientNetworkError(r.error),
    );
    if (updErr) throw new Error(`Could not archive fabric: ${updErr.message}`);
    return { mode: "archived" };
  }
  throw new Error(`Could not delete fabric: ${error.message}`);
};

export const unarchiveFabric = async (id: number): Promise<void> => {
  const { error } = await withWriteRetry(
    () => db.from('fabrics').update({ is_archived: false }).eq('id', id),
    (r) => isTransientNetworkError(r.error),
  );
  if (error) throw new Error(`Could not unarchive fabric: ${error.message}`);
};
