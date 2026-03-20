import type { Fabric } from "@repo/database";
import { db } from "@/lib/db";
import type { ApiResponse } from "../types/api";

export const getFabrics = async (): Promise<ApiResponse<Fabric[]>> => {
  const { data, error, count } = await db
    .from('fabrics')
    .select('*', { count: 'exact' });

  if (error) {
    console.error('Error fetching fabrics:', error);
    return {
      status: 'error',
      message: error.message,
      data: [],
      count: 0
    };
  }

  return {
    status: 'success',
    data: (data as any) as Fabric[],
    count: count || 0
  };
};


export const updateFabric = async (id: number, fabric: Partial<Fabric>): Promise<ApiResponse<Fabric>> => {
  const { data, error } = await db
    .from('fabrics')
    .update(fabric)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating fabric:', error);
    return { status: 'error', message: error.message };
  }

  return {
    status: 'success',
    data: (data as any) as Fabric
  };
};
