import { useMemo } from "react";
import { Autocomplete, type AutocompleteOption } from "@repo/ui/autocomplete";

const DEFAULT_SUGGESTIONS = ["buttons", "zippers", "thread", "lining", "elastic", "interlining", "other"];

type Props = {
  value: string;
  onChange: (value: string) => void;
  existing: string[];
  placeholder?: string;
  className?: string;
};

export function CategoryCombobox({ value, onChange, existing, placeholder = "Choose or type new…", className }: Props) {
  const options: AutocompleteOption[] = useMemo(() => {
    const set = new Set<string>();
    for (const c of existing) if (c?.trim()) set.add(c.trim());
    for (const c of DEFAULT_SUGGESTIONS) set.add(c);
    return Array.from(set)
      .sort()
      .map((v) => ({ value: v, label: v }));
  }, [existing]);

  return (
    <Autocomplete
      value={value || null}
      onChange={(v) => onChange(v ?? "")}
      options={options}
      placeholder={placeholder}
      emptyMessage="No category found."
      onCreate={(name) => onChange(name.toLowerCase())}
      createLabel={(q) => <>Use "{q}"</>}
      className={className}
    />
  );
}
