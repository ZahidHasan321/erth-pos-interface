import { type UseFormReturn, type Path } from "react-hook-form";
import { forwardRef } from "react";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@repo/ui/form";
import { Input } from "@repo/ui/input";
import { parseMeasurementParts } from "@repo/database";
import { cn } from "@/lib/utils";
import type { CustomerMeasurementsSchema } from "./measurement-form.schema";

function StackedFraction({ value }: { value: number }) {
  const parts = parseMeasurementParts(value);
  if (!parts) return null;

  return (
    <span className="inline-flex items-center gap-1 text-lg font-semibold text-muted-foreground tabular-nums">
      {parts.negative && <span>-</span>}
      {(parts.whole > 0 || parts.numerator === 0) && <span>{parts.whole}</span>}
      {parts.numerator > 0 && (
        <span className="inline-flex flex-col items-center leading-none">
          <span className="text-sm">{parts.numerator}</span>
          <span className="w-full h-px bg-muted-foreground" />
          <span className="text-sm">{parts.denominator}</span>
        </span>
      )}
      {parts.hasDegree && <span>°</span>}
    </span>
  );
}

interface MeasurementInputProps {
  form: UseFormReturn<CustomerMeasurementsSchema>;
  name: Path<CustomerMeasurementsSchema>;
  label: string;
  unit: string;
  isDisabled: boolean;
  isComputed?: boolean; // Auto-calculated field — render as plain text, not input
  className?: string; // For custom styling of the outer div
  labelClassName?: string; // For custom styling of the FormLabel
  onEnterPress?: () => void; // Callback for Enter key press
}

export const MeasurementInput = forwardRef<
  HTMLInputElement,
  MeasurementInputProps
>(function MeasurementInput(
  {
    form,
    name,
    label,
    unit,
    isDisabled,
    isComputed,
    className,
    labelClassName,
    onEnterPress,
  },
  ref,
) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field, fieldState }) => {
        const { ref: fieldRef, ...fieldProps } = field;
        const hasError = !!fieldState.error;
        return (
          <FormItem className={className}>
            <FormLabel className={cn("text-xs text-muted-foreground", labelClassName)}>{label}</FormLabel>
            {isComputed ? (
              <div className="text-sm font-semibold text-foreground/70 tabular-nums h-10 flex items-center">
                {typeof field.value === "number" && field.value !== 0
                  ? `${field.value} ${unit}`
                  : <span className="text-muted-foreground/40">—</span>
                }
              </div>
            ) : (
              <FormControl>
                <div className="flex items-center gap-1.5">
                  <div className="relative flex items-center">
                    <Input
                      ref={(element) => {
                        fieldRef(element);
                        if (typeof ref === "function") {
                          ref(element);
                        } else if (ref) {
                          ref.current = element;
                        }
                      }}
                      type="number"
                      step="0.01"
                      {...fieldProps}
                      value={
                        typeof field.value === "number"
                          ? field.value
                          : ""
                      }
                      onChange={(e) => {
                        const value = e.target.value;
                        field.onChange(value === "" ? undefined : parseFloat(value));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          onEnterPress?.();
                        }
                      }}
                      className={`w-24 bg-white pr-7 text-foreground font-semibold focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 ${hasError ? "border-red-500 ring-1 ring-red-500" : "border-black"}`}
                      disabled={isDisabled}
                      placeholder="xx"
                    />
                    <span className="absolute right-2 text-foreground/70 pointer-events-none text-xs">
                      {unit}
                    </span>
                  </div>
                  {field.value &&
                    typeof field.value === "number" &&
                    field.value !== 0 && (
                      <StackedFraction value={field.value} />
                    )}
                </div>
              </FormControl>
            )}
          </FormItem>
        );
      }}
    />
  );
});
