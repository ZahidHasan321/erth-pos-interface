import { useFormContext, Controller } from "react-hook-form";
import { Input } from "@repo/ui/input";
import { ShoulderSlopeSelect } from "@repo/ui/shoulder-slope";
import { CollarPositionSelect } from "@repo/ui/collar-position";
import { SectionCard } from "@/components/shared/PageShell";
import { cn } from "@/lib/utils";
import { MEASUREMENT_GROUPS } from "./constants";
import type { AddGarmentFormValues } from "./schema";

// Column-oriented table: each group is one card with a label row and an
// input row. Matches the POS new-work-order measurement layout.
export function MeasurementFields() {
  const { register, control, formState: { errors } } = useFormContext<AddGarmentFormValues>();

  return (
    <SectionCard
      title="Measurements"
      action={
        <span className="text-sm text-muted-foreground">
          Prefilled from source · leave blank to keep default
        </span>
      }
      bodyClassName="space-y-3"
    >
      {/* Shoulder slope — categorical, required choice (no silent default). */}
      <div className="rounded-md border border-border bg-background/40 px-3 py-2 space-y-1.5">
        <h4 className="text-sm font-medium text-muted-foreground">Shoulder slope</h4>
        <Controller
          control={control}
          name="shoulder_slope"
          render={({ field }) => (
            <ShoulderSlopeSelect
              value={field.value}
              onChange={field.onChange}
              invalid={!!errors.shoulder_slope}
            />
          )}
        />
        {errors.shoulder_slope && (
          <p className="text-xs text-[color:var(--status-bad)]">
            {errors.shoulder_slope.message as string}
          </p>
        )}
      </div>
      {/* Collar position — categorical, required choice (no silent default). */}
      <div className="rounded-md border border-border bg-background/40 px-3 py-2 space-y-1.5">
        <h4 className="text-sm font-medium text-muted-foreground">Collar position</h4>
        <Controller
          control={control}
          name="collar_position"
          render={({ field }) => (
            <CollarPositionSelect
              value={field.value}
              onChange={field.onChange}
              invalid={!!errors.collar_position}
            />
          )}
        />
        {errors.collar_position && (
          <p className="text-xs text-[color:var(--status-bad)]">
            {errors.collar_position.message as string}
          </p>
        )}
      </div>
      {MEASUREMENT_GROUPS.map((group) => (
        <div
          key={group.title}
          className="rounded-md border border-border bg-background/40 overflow-x-auto"
        >
          <div className="px-3 pt-2 pb-1">
            <h4 className="text-sm font-medium text-muted-foreground">
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
                      "text-sm font-medium text-center leading-tight",
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
                      placeholder="-"
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
    </SectionCard>
  );
}
