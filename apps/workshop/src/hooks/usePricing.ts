import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPrices, updatePrice, getStyles, updateStylePrice } from "@/api/pricing";
import type { Brand } from "@repo/database";

export function usePrices(brand: Brand) {
  return useQuery({
    queryKey: ["prices", brand],
    queryFn: () => getPrices(brand),
    staleTime: 60_000,
  });
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
  return useQuery({
    queryKey: ["styles", brand],
    queryFn: () => getStyles(brand),
    staleTime: 60_000,
  });
}

export function useUpdateStylePrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rate_per_item }: { id: number; rate_per_item: number }) =>
      updateStylePrice(id, rate_per_item),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["styles"] }),
  });
}
