import { db } from "@/lib/db";
import type { ApiResponse } from "../types/api";
import type { StylePricingRule } from "@repo/database";
import { getBrand } from "./orders";

const TABLE_NAME = "style_pricing_rules";

export const getStylePricingRules = async (): Promise<ApiResponse<StylePricingRule[]>> => {
  const { data, error } = await db
    .from(TABLE_NAME)
    .select("*")
    .eq("brand", getBrand())
    .eq("active", true);

  if (error) {
    return { status: "error", message: error.message, data: [] };
  }
  return { status: "success", data: (data ?? []) as StylePricingRule[] };
};
