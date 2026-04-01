import type { Style } from "@repo/database";
import { db } from "@/lib/db";
import type { ApiResponse } from "@/types/api";
import { getBrand } from "./orders";

export const getStyles = async (): Promise<ApiResponse<Style[]>> => {
  const { data, error } = await db
    .from('styles')
    .select('*')
    .eq('brand', getBrand());

  if (error) {
    console.error('Error fetching styles:', error);
    return {
      status: 'error',
      message: error.message,
      data: [],
    };
  }

  return {
    status: 'success',
    data: data as Style[],
  };
};