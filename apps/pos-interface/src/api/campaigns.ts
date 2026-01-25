import { supabase } from "../lib/supabase";
import type { ApiResponse } from "../types/api";
import type { Campaign } from "@repo/database";

const TABLE_NAME = "campaigns";

export const getCampaigns = async (): Promise<ApiResponse<Campaign[]>> => {
  const { data, error, count } = await supabase
    .from(TABLE_NAME)
    .select('*', { count: 'exact' })
    .eq('active', true);

  if (error) {
    return { status: 'error', message: error.message, data: [], count: 0 };
  }
  return { status: 'success', data: data as any, count: count || 0 };
};