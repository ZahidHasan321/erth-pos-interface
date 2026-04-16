import { useFormContext } from "react-hook-form";
import { Label } from "@repo/ui/label";
import { Input } from "@repo/ui/input";
import { MEASUREMENT_GROUPS } from "./constants";
import type { AddGarmentFormValues } from "./schema";

// Flat grid of numeric inputs grouped by body area. Uses setValueAs so empty
// strings round-trip to null, matching the optional schema shape.
export function MeasurementFields() {
  const { register } = useFormContext<AddGarmentFormValues>();

  return (
    <section className="space-y-4 bg-card border rounded-xl p-4">
      <h2 className="text-sm font-bold uppercase tracking-wider">Measurements</h2>
      <p className="text-xs text-muted-foreground">
        Prefilled from the source garment when replacing. Leave blank to keep the default.
      </p>

      {MEASUREMENT_GROUPS.map((group) => (
        <div key={group.title} className="border-t pt-3 first:border-t-0 first:pt-0">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            {group.title}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {group.fields.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={`m-${f.key}`} className="text-xs">{f.label}</Label>
                <Input
                  id={`m-${f.key}`}
                  type="number"
                  step="0.01"
                  {...register(`measurements.${f.key}` as `measurements.${string}`, {
                    setValueAs: (v) => (v === "" || v == null ? null : Number(v)),
                  })}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
