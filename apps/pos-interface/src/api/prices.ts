import { supabase } from "../lib/supabase";
import type { ApiResponse } from "../types/api";
import type { Price } from "@repo/database";

const TABLE_NAME = "prices";

export const getPrices = async (): Promise<ApiResponse<Price[]>> => {
  const { data, error, count } = await supabase
    .from(TABLE_NAME)
    .select('*', { count: 'exact' });

  if (error) {
    return { status: 'error', message: error.message, data: [], count: 0 };
  }
  return { status: 'success', data: data as any, count: count || 0 };
};
