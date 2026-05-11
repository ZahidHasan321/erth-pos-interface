import { db } from "@/lib/db";
import type { Fabric } from "@repo/database";

export async function getFabrics(includeArchived = false): Promise<Fabric[]> {
  let query = db.from("fabrics").select("*");
  if (!includeArchived) query = query.eq("is_archived", false);
  const { data, error } = await query;
  if (error) throw error;
  return data as Fabric[];
}

export async function getFabricById(id: number): Promise<Fabric | null> {
  const { data, error } = await db.from("fabrics").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not load fabric: ${error.message}`);
  return (data as Fabric | null) ?? null;
}

export async function createFabric(
  fabric: Pick<Fabric, "name"> & Partial<Omit<Fabric, "id" | "name">>,
): Promise<Fabric> {
  const { data, error } = await db
    .from("fabrics")
    .insert(fabric)
    .select()
    .single();
  if (error) throw error;
  return data as Fabric;
}

export async function updateFabric(
  id: number,
  fabric: Partial<Omit<Fabric, "id">>,
): Promise<Fabric> {
  const { data, error } = await db
    .from("fabrics")
    .update(fabric)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Fabric;
}
