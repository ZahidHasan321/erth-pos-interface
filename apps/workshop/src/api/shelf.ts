import { db } from "@/lib/db";
import type { Shelf } from "@repo/database";

export async function getShelf(): Promise<Shelf[]> {
  const { data, error } = await db.from("shelf").select("*");
  if (error) throw error;
  return data as Shelf[];
}

export async function createShelfItem(
  item: Pick<Shelf, "type"> & Partial<Pick<Shelf, "brand" | "price" | "workshop_stock">>,
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
  const { data, error } = await db
    .from("shelf")
    .update(item)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Shelf;
}
