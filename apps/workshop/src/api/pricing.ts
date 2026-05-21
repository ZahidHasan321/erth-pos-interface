import { db, isTransientNetworkError, withWriteRetry } from "@/lib/db";
import type { Brand, Price, Style, StylePricingRule, StyleRuleType } from "@repo/database";

// ── Prices (key-value system prices) ────────────────────────────────────────

export const getPrices = async (): Promise<Price[]> => {
  const { data, error } = await db
    .from("prices")
    .select("*")
    .order("brand")
    .order("key");
  if (error) throw new Error(`getPrices: failed to fetch prices: ${error.message}`);
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
  const { data, error } = await withWriteRetry(
    () => db
      .from("prices")
      .update(updates)
      .eq("key", key)
      .eq("brand", brand)
      .select()
      .single(),
    (r) => isTransientNetworkError(r.error),
  );
  if (error) throw new Error(`updatePrice: failed to update price for key=${key} brand=${brand}: ${error.message}`);
  return data;
};

// ── Styles (style option pricing) ───────────────────────────────────────────

export const getStyles = async (): Promise<Style[]> => {
  const { data, error } = await db
    .from("styles")
    .select("*")
    .order("brand")
    .order("type")
    .order("name");
  if (error) throw new Error(`getStyles: failed to fetch styles: ${error.message}`);
  return data ?? [];
};

export const updateStylePrice = async (
  id: number,
  rate_per_item: number,
): Promise<Style> => {
  const { data, error } = await withWriteRetry(
    () => db
      .from("styles")
      .update({ rate_per_item })
      .eq("id", id)
      .select()
      .single(),
    (r) => isTransientNetworkError(r.error),
  );
  if (error) throw new Error(`updateStylePrice: failed to update style price for id=${id}: ${error.message}`);
  return data;
};

// ── Style Pricing Rules (override behavior) ─────────────────────────────────

export type StylePricingRuleInput = {
  id?: number;
  brand: Brand;
  style_code: string;
  rule_type: StyleRuleType;
  flat_rate: number | null;
  priority?: number;
  active?: boolean;
  description?: string | null;
};

export const getStylePricingRules = async (): Promise<StylePricingRule[]> => {
  const { data, error } = await db
    .from("style_pricing_rules")
    .select("*")
    .order("brand")
    .order("style_code")
    .order("priority");
  if (error) throw new Error(`getStylePricingRules: failed to fetch rules: ${error.message}`);
  return data ?? [];
};

export const upsertStylePricingRule = async (
  input: StylePricingRuleInput,
): Promise<StylePricingRule> => {
  const payload = {
    brand: input.brand,
    style_code: input.style_code,
    rule_type: input.rule_type,
    flat_rate: input.flat_rate,
    priority: input.priority ?? 0,
    active: input.active ?? true,
    description: input.description ?? null,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { data, error } = await withWriteRetry(
      () => db
        .from("style_pricing_rules")
        .update(payload)
        .eq("id", input.id)
        .select()
        .single(),
      (r) => isTransientNetworkError(r.error),
    );
    if (error) throw new Error(`upsertStylePricingRule: failed to update rule id=${input.id}: ${error.message}`);
    return data;
  }

  const { data, error } = await db
    .from("style_pricing_rules")
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(`upsertStylePricingRule: failed to insert rule for code=${input.style_code} brand=${input.brand}: ${error.message}`);
  return data;
};

export const deleteStylePricingRule = async (id: number): Promise<void> => {
  const { error } = await withWriteRetry(
    () => db
      .from("style_pricing_rules")
      .delete()
      .eq("id", id),
    (r) => isTransientNetworkError(r.error),
  );
  if (error) throw new Error(`deleteStylePricingRule: failed to delete rule id=${id}: ${error.message}`);
};
