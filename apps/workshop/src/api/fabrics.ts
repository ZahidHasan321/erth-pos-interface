import { db } from "@/lib/db";
import type { Fabric } from "@repo/database";

export async function getFabrics(): Promise<Fabric[]> {
  const { data, error } = await db.from("fabrics").select("*");
  if (error) throw error;
  return data as Fabric[];
}

export async function createFabric(
  fabric: Pick<Fabric, "name"> & Partial<Pick<Fabric, "color" | "color_hex" | "price_per_meter" | "workshop_stock">>,
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
