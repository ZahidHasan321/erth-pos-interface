import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Autocomplete, type AutocompleteOption } from "@repo/ui/autocomplete";
import { getSuppliers, createSupplier } from "@/api/suppliers";

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
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      onChange(s.id);
      toast.success(`Supplier "${s.name}" added`);
    },
    onError: (err: any) => toast.error(`Could not add supplier: ${err?.message ?? String(err)}`),
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
