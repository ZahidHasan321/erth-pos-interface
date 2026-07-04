import { Segmented, FilterSelect } from "@/components/shared/FilterBar";
import { RANGE_PRESETS, type RangePreset } from "@/lib/date-range";

// Brand enum values are UPPERCASE in the DB (brand::text = ANY(p_brands)).
export const BRAND_OPTIONS = [
  { value: "ERTH", label: "ERTH" },
  { value: "SAKKBA", label: "SAKKBA" },
  { value: "QASS", label: "QASS" },
] as const;

/**
 * Brand filter — single-select (All, or exactly one brand). No one views two
 * brands' data side by side. An empty string means "all brands"; pages still
 * pass the RPC an array, so convert with `brand ? [brand] : []` at the call site.
 */
export function BrandSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (brand: string) => void;
}) {
  return (
    <FilterSelect
      value={value}
      onChange={onChange}
      options={BRAND_OPTIONS}
      allLabel="All brands"
      className="w-36"
    />
  );
}

/** Date-range preset selector (Today / 7 days / …), single-select. */
export function RangeFilter({
  value,
  onChange,
}: {
  value: RangePreset;
  onChange: (preset: RangePreset) => void;
}) {
  return <Segmented value={value} onChange={onChange} options={RANGE_PRESETS} />;
}
