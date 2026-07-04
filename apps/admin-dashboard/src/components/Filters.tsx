import { FilterChip, FilterChipGroup } from "@/components/shared/FilterChip";
import { RANGE_PRESETS, type RangePreset } from "@/lib/date-range";

// Brand enum values are UPPERCASE in the DB (brand::text = ANY(p_brands)).
export const BRAND_OPTIONS = [
  { value: "ERTH", label: "ERTH" },
  { value: "SAKKBA", label: "SAKKBA" },
  { value: "QASS", label: "QASS" },
] as const;

/** Brand multi-select. Empty selection = all brands (the owner default). */
export function BrandFilter({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (brands: string[]) => void;
}) {
  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((b) => b !== value)
        : [...selected, value],
    );
  };

  return (
    <FilterChipGroup>
      <FilterChip active={selected.length === 0} onClick={() => onChange([])}>
        All brands
      </FilterChip>
      {BRAND_OPTIONS.map((b) => (
        <FilterChip key={b.value} active={selected.includes(b.value)} onClick={() => toggle(b.value)}>
          {b.label}
        </FilterChip>
      ))}
    </FilterChipGroup>
  );
}

/** Date-range preset selector. */
export function RangeFilter({
  value,
  onChange,
}: {
  value: RangePreset;
  onChange: (preset: RangePreset) => void;
}) {
  return (
    <FilterChipGroup>
      {RANGE_PRESETS.map((p) => (
        <FilterChip key={p.value} active={value === p.value} onClick={() => onChange(p.value)}>
          {p.label}
        </FilterChip>
      ))}
    </FilterChipGroup>
  );
}
