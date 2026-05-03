import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { useResources } from "@/hooks/useResources";

interface WorkerDropdownProps {
  responsibility?: string;
  unit?: string;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function WorkerDropdown({ responsibility, unit, value, onChange, placeholder = "Select worker" }: WorkerDropdownProps) {
  const { data: resources = [] } = useResources();

  // Sewing is unit-collaborative — list distinct units instead of individuals.
  const isSewing = responsibility === "sewing";

  if (isSewing) {
    const units = Array.from(new Set(
      resources
        .filter((r) => r.responsibility === "sewing" && r.unit)
        .map((r) => r.unit as string),
    )).sort();

    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder === "Select worker" ? "Select sewing unit" : placeholder} />
        </SelectTrigger>
        <SelectContent>
          {units.map((u) => (
            <SelectItem key={u} value={u}>{u}</SelectItem>
          ))}
          {units.length === 0 && (
            <SelectItem value="__none" disabled>No sewing units configured</SelectItem>
          )}
        </SelectContent>
      </Select>
    );
  }

  let filtered = responsibility
    ? resources.filter((r) => r.responsibility === responsibility)
    : resources;

  if (unit) {
    filtered = filtered.filter((r) => r.unit === unit);
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {filtered.map((r) => (
          <SelectItem key={r.id} value={r.resource_name}>
            {r.resource_name}
            {r.resource_type && <span className="text-muted-foreground ml-1 text-xs">({r.resource_type})</span>}
          </SelectItem>
        ))}
        {filtered.length === 0 && (
          <SelectItem value="__none" disabled>No workers found</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
