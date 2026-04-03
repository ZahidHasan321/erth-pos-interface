import { db } from "@/lib/db";
import type { Fabric } from "@repo/database";

export async function getFabrics(): Promise<Fabric[]> {
  const { data, error } = await db.from("fabrics").select("*");
  if (error) throw error;
  return data as Fabric[];
}
