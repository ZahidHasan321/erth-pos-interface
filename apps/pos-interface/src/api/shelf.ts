import { db } from "@/lib/db";
import type { Shelf } from '@repo/database';

export const getShelf = async (includeArchived = false): Promise<Shelf[]> => {
  let query = db.from('shelf').select('*');
  if (!includeArchived) query = query.eq('is_archived', false);
  const { data, error } = await query;
  if (error) throw error;
  return data as Shelf[];
};

export const createShelfItem = async (
  item: Pick<Shelf, "type"> & Partial<Pick<Shelf, "brand" | "price" | "shop_stock">>,
): Promise<Shelf> => {
  const { data, error } = await db.from('shelf').insert(item).select().single();
  if (error) throw error;
  return data as Shelf;
};

export const updateShelf = async (
  id: string,
  shelf: Partial<Shelf>,
): Promise<Shelf> => {
  const { data, error } = await db
    .from('shelf')
    .update(shelf)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Shelf;
};

export const deleteShelfItem = async (id: number): Promise<{ mode: "deleted" | "archived" }> => {
  const { error } = await db.from('shelf').delete().eq('id', id);
  if (!error) return { mode: "deleted" };
  if (error.code === '23503') {
    const { error: updErr } = await db.from('shelf').update({ is_archived: true }).eq('id', id);
    if (updErr) throw new Error(`Could not archive shelf item: ${updErr.message}`);
    return { mode: "archived" };
  }
  throw new Error(`Could not delete shelf item: ${error.message}`);
};

export const unarchiveShelfItem = async (id: number): Promise<void> => {
  const { error } = await db.from('shelf').update({ is_archived: false }).eq('id', id);
  if (error) throw new Error(`Could not unarchive shelf item: ${error.message}`);
};
