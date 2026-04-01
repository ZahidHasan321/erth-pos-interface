import { db } from "@/lib/db";
import type { Brand, Price, Style } from "@repo/database";

// ── Prices (key-value system prices) ────────────────────────────────────────

export const getPrices = async (brand: Brand): Promise<Price[]> => {
  const { data, error } = await db
    .from("prices")
    .select("*")
    .eq("brand", brand)
    .order("key");
  if (error) throw new Error(error.message);
  return data ?? [];
};

export const updatePrice = async (
  key: string,
  brand: Brand,
  value: number,
  description?: string,
): Promise<Price> => {
  const updates: Record<string, unknown> = { value, updated_at: new Date().toISOString() };
  if (description !== undefined) updates.description = description;
  const { data, error } = await db
    .from("prices")
    .update(updates)
    .eq("key", key)
    .eq("brand", brand)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
};

// ── Styles (style option pricing) ───────────────────────────────────────────

export const getStyles = async (brand: Brand): Promise<Style[]> => {
  const { data, error } = await db
    .from("styles")
    .select("*")
    .eq("brand", brand)
    .order("type")
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
};

export const updateStylePrice = async (
  id: number,
  rate_per_item: number,
): Promise<Style> => {
  const { data, error } = await db
    .from("styles")
    .update({ rate_per_item })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
};
