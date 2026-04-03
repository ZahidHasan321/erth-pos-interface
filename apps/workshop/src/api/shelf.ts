import { db } from "@/lib/db";
import type { Shelf } from "@repo/database";

export async function getShelf(): Promise<Shelf[]> {
  const { data, error } = await db.from("shelf").select("*");
  if (error) throw error;
  return data as Shelf[];
}
