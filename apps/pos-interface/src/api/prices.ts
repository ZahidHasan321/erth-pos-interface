import { db } from "@/lib/db";
import type { ApiResponse } from "../types/api";
import type { Price } from "@repo/database";
import { getBrand } from "./orders";

const TABLE_NAME = "prices";

export const getPrices = async (): Promise<ApiResponse<Price[]>> => {
  const { data, error } = await db
    .from(TABLE_NAME)
    .select('*')
    .eq('brand', getBrand());

  if (error) {
    return { status: 'error', message: error.message, data: [] };
  }
  return { status: 'success', data: data as any };
};
