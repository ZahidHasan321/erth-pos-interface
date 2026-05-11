import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getPrices,
  updatePrice,
  getStyles,
  updateStylePrice,
  getStylePricingRules,
  upsertStylePricingRule,
  deleteStylePricingRule,
  type StylePricingRuleInput,
} from "@/api/pricing";
import type { Brand } from "@repo/database";

// Prices and styles are tiny (~13 and ~75 rows total). Fetch all brands once
// and filter client-side — brand tab switching is free, no refetch storm.

export function usePrices(brand: Brand) {
  const query = useQuery({
    queryKey: ["prices"],
    queryFn: getPrices,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const data = useMemo(
    () => query.data?.filter((p) => p.brand === brand),
    [query.data, brand],
  );
  return { ...query, data };
}

export function useUpdatePrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, brand, value, description }: { key: string; brand: Brand; value: number; description?: string }) =>
      updatePrice(key, brand, value, description),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prices"] }),
  });
}

export function useStyles(brand: Brand) {
  const query = useQuery({
    queryKey: ["styles"],
    queryFn: getStyles,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const data = useMemo(
    () => query.data?.filter((s) => s.brand === brand),
    [query.data, brand],
  );
  return { ...query, data };
}

export function useUpdateStylePrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rate_per_item }: { id: number; rate_per_item: number }) =>
      updateStylePrice(id, rate_per_item),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["styles"] }),
  });
}

export function useStylePricingRules(brand: Brand) {
  const query = useQuery({
    queryKey: ["style-pricing-rules"],
    queryFn: getStylePricingRules,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const data = useMemo(
    () => query.data?.filter((r) => r.brand === brand),
    [query.data, brand],
  );
  return { ...query, data };
}

export function useUpsertStylePricingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StylePricingRuleInput) => upsertStylePricingRule(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["style-pricing-rules"] }),
  });
}

export function useDeleteStylePricingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteStylePricingRule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["style-pricing-rules"] }),
  });
}
