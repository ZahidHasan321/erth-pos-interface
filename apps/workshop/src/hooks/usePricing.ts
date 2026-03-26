import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPrices, updatePrice, getStyles, updateStylePrice } from "@/api/pricing";

const PRICES_KEY = ["prices"] as const;
const STYLES_KEY = ["styles"] as const;

export function usePrices() {
  return useQuery({
    queryKey: PRICES_KEY,
    queryFn: getPrices,
    staleTime: 60_000,
  });
}

export function useUpdatePrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value, description }: { key: string; value: number; description?: string }) =>
      updatePrice(key, value, description),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRICES_KEY }),
  });
}

export function useStyles() {
  return useQuery({
    queryKey: STYLES_KEY,
    queryFn: getStyles,
    staleTime: 60_000,
  });
}

export function useUpdateStylePrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rate_per_item }: { id: number; rate_per_item: number }) =>
      updateStylePrice(id, rate_per_item),
    onSuccess: () => qc.invalidateQueries({ queryKey: STYLES_KEY }),
  });
}
