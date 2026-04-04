import type { Fabric } from "@repo/database";
import { db } from "@/lib/db";

export const getFabrics = async (): Promise<Fabric[]> => {
  const { data, error } = await db
    .from('fabrics')
    .select('*');

  if (error) throw error;
  return data as Fabric[];
};

export const updateFabric = async (id: number, fabric: Partial<Fabric>): Promise<Fabric> => {
  const { data, error } = await db
    .from('fabrics')
    .update(fabric)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Fabric;
};
