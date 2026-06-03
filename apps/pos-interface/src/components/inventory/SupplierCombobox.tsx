import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Autocomplete, type AutocompleteOption } from "@repo/ui/autocomplete";
import { getSuppliers, createSupplier } from "@/api/suppliers";
import type { Supplier } from "@repo/database";

type Props = {
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
  className?: string;
};

export function SupplierCombobox({ value, onChange, placeholder = "Choose supplier (optional)", className }: Props) {
  const qc = useQueryClient();
  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => getSuppliers(),
    staleTime: 60_000,
  });

  const createMut = useMutation({
    mutationFn: (name: string) => createSupplier({ name }),
    onMutate: async (name: string) => {
      await qc.cancelQueries({ queryKey: ["suppliers"] });
      const prev = qc.getQueryData<Supplier[]>(["suppliers"]) ?? [];
      const tempId = -Date.now();
      const optimistic = {
        id: tempId,
        name,
        phone: null,
        email: null,
        notes: null,
        is_archived: false,
        created_at: new Date().toISOString(),
      } as unknown as Supplier;
      qc.setQueryData<Supplier[]>(["suppliers"], [...prev, optimistic]);
      onChange(tempId);
      return { prev, tempId };
    },
    onSuccess: (real, _name, ctx) => {
      qc.setQueryData<Supplier[]>(["suppliers"], (curr = []) =>
        curr.map((s) => (s.id === ctx?.tempId ? real : s)),
      );
      onChange(real.id);
      toast.success(`Supplier "${real.name}" added`);
    },
    onError: (err: unknown, _name, ctx) => {
      if (ctx) {
        qc.setQueryData(["suppliers"], ctx.prev);
        onChange(null);
      }
      toast.error(`Could not add supplier: ${err instanceof Error ? err.message : String(err)}`);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });

  const options: AutocompleteOption[] = suppliers.map((s) => ({ value: String(s.id), label: s.name }));

  return (
    <Autocomplete
      value={value == null ? null : String(value)}
      onChange={(v) => onChange(v == null ? null : Number(v))}
      options={options}
      placeholder={placeholder}
      isLoading={isLoading}
      isCreating={createMut.isPending}
      emptyMessage="No supplier found. Type a name to create one."
      onCreate={(name) => createMut.mutate(name)}
      className={className}
    />
  );
}
