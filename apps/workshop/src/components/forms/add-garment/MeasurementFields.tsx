import { useFormContext } from "react-hook-form";
import { Input } from "@repo/ui/input";
import { cn } from "@/lib/utils";
import { MEASUREMENT_GROUPS } from "./constants";
import type { AddGarmentFormValues } from "./schema";

// Column-oriented table: each group is one card with a label row and an
// input row. Matches the POS new-work-order measurement layout.
export function MeasurementFields() {
  const { register } = useFormContext<AddGarmentFormValues>();

  return (
    <section className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <header className="px-4 py-2.5 border-b bg-muted/30 flex items-baseline justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Measurements
        </h3>
        <p className="text-[11px] text-muted-foreground">
          Prefilled from source · leave blank to keep default
        </p>
      </header>

      <div className="p-4 space-y-3">
        {MEASUREMENT_GROUPS.map((group) => (
          <div
            key={group.title}
            className="rounded-lg border border-border bg-background/40 overflow-x-auto"
          >
            <div className="px-3 pt-2 pb-1">
              <h4 className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wider">
                {group.title}
              </h4>
            </div>
            <table className="w-full border-collapse table-fixed">
              <thead>
                <tr>
                  {group.fields.map((f) => (
                    <th
                      key={f.key}
                      className={cn(
                        "border-t border-border px-1.5 py-1.5",
                        "text-[10px] font-medium text-center leading-tight",
                        "text-muted-foreground bg-muted/30",
                      )}
                    >
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {group.fields.map((f) => (
                    <td
                      key={f.key}
                      className="border-t border-border px-1 py-1"
                    >
                      <Input
                        id={`m-${f.key}`}
                        type="number"
                        step="0.01"
                        placeholder="—"
                        className={cn(
                          "h-9 w-full text-center tabular-nums",
                          "bg-transparent border-0 shadow-none px-1",
                          "focus-visible:ring-1 focus-visible:ring-primary",
                        )}
                        {...register(
                          `measurements.${f.key}` as `measurements.${string}`,
                          {
                            setValueAs: (v) =>
                              v === "" || v == null ? null : Number(v),
                          },
                        )}
                      />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}
