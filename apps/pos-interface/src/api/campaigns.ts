import { db } from "@/lib/db";
import type { ApiResponse } from "../types/api";
import type { Campaign } from "@repo/database";

const TABLE_NAME = "campaigns";

export const getCampaigns = async (): Promise<ApiResponse<Campaign[]>> => {
  const { data, error } = await db
    .from(TABLE_NAME)
    .select('*')
    .eq('active', true);

  if (error) {
    return { status: 'error', message: error.message, data: [] };
  }
  return { status: 'success', data: data as any };
};