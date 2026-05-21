import { db, isTransientNetworkError, withWriteRetry } from "@/lib/db";
import type { Shelf } from "@repo/database";

export async function getShelf(includeArchived = false): Promise<Shelf[]> {
  let query = db.from("shelf").select("*");
  if (!includeArchived) query = query.eq("is_archived", false);
  const { data, error } = await query;
  if (error) throw error;
  return data as Shelf[];
}

export async function getShelfItemById(id: number): Promise<Shelf | null> {
  const { data, error } = await db.from("shelf").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not load shelf item: ${error.message}`);
  return (data as Shelf | null) ?? null;
}

export async function createShelfItem(
  item: Pick<Shelf, "type"> & Partial<Omit<Shelf, "id" | "type">>,
): Promise<Shelf> {
  const { data, error } = await db
    .from("shelf")
    .insert(item)
    .select()
    .single();
  if (error) throw error;
  return data as Shelf;
}

export async function updateShelfItem(
  id: number,
  item: Partial<Omit<Shelf, "id">>,
): Promise<Shelf> {
  const { data, error } = await withWriteRetry(
    () => db
      .from("shelf")
      .update(item)
      .eq("id", id)
      .select()
      .single(),
    (r) => isTransientNetworkError(r.error),
  );
  if (error) throw error;
  return data as Shelf;
}
