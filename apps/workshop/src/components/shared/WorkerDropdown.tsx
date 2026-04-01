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
  let filtered = responsibility
    ? resources.filter((r) => r.responsibility === responsibility)
    : resources;

  // If unit is specified, filter to that unit
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
