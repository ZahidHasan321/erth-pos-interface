import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getUnits, createUnit, updateUnit, deleteUnit } from "@/api/units";
import type { NewUnit } from "@repo/database";

const KEY = ["units"] as const;

export function useUnits() {
  return useQuery({
    queryKey: KEY,
    queryFn: getUnits,
    staleTime: 60_000,
  });
}

export function useCreateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (u: Pick<NewUnit, "stage" | "name"> & Partial<Pick<NewUnit, "notes">>) =>
      createUnit(u),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Pick<NewUnit, "name" | "notes">> }) =>
      updateUnit(id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      // Rename propagates to resources.unit text via DB trigger; invalidate readers.
      qc.invalidateQueries({ queryKey: ["resources"] });
      qc.invalidateQueries({ queryKey: ["resources-with-users"] });
    },
  });
}

export function useDeleteUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteUnit(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
