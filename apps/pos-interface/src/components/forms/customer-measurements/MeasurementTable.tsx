import { type UseFormReturn, type Path, useWatch } from "react-hook-form";
import { forwardRef } from "react";
import { FormControl, FormField } from "@repo/ui/form";
import { Input } from "@repo/ui/input";
import { cn } from "@/lib/utils";
import type { CustomerMeasurementsSchema } from "./measurement-form.schema";

// --- Fraction helpers ---
function decimalToFractionParts(decimal: number) {
  if (decimal === 0 || isNaN(decimal)) return null;
  const isNegative = decimal < 0;
  const absDecimal = Math.abs(decimal);
  const whole = Math.floor(absDecimal);
  const fractionalPart = absDecimal - whole;
  if (fractionalPart < 0.001) return null;
  const gcd = (a: number, b: number): number =>
    b < 0.0001 ? a : gcd(b, a % b);
  const precision = 1000000;
  const numerator = Math.round(fractionalPart * precision);
  const denominator = precision;
  const divisor = gcd(numerator, denominator);
  return {
    whole,
    numerator: Math.round(numerator / divisor),
    denominator: Math.round(denominator / divisor),
    isNegative,
  };
}

function StackedFraction({ value }: { value: number }) {
  const parts = decimalToFractionParts(value);
  if (!parts) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
      {parts.isNegative && <span>-</span>}
      {parts.whole > 0 && <span>{parts.whole}</span>}
      <span className="inline-flex flex-col items-center leading-none">
        <span className="text-[10px]">{parts.numerator}</span>
        <span className="w-full h-px bg-muted-foreground/60" />
        <span className="text-[10px]">{parts.denominator}</span>
      </span>
    </span>
  );
}

// --- Types ---
export interface MeasurementColumn {
  name: string;
  label: string;
  isComputed?: boolean;
}

interface MeasurementTableProps {
  form: UseFormReturn<CustomerMeasurementsSchema>;
  title: string;
  columns: MeasurementColumn[];
  isDisabled: boolean;
  getFieldRef?: (
    fieldName: Path<CustomerMeasurementsSchema>,
  ) => (element: HTMLInputElement | null) => void;
  getEnterHandler?: (
    fieldName: Path<CustomerMeasurementsSchema>,
  ) => (() => void) | undefined;
}

// --- Fraction cell that watches a single field ---
function FractionCell({
  form,
  name,
}: {
  form: UseFormReturn<CustomerMeasurementsSchema>;
  name: Path<CustomerMeasurementsSchema>;
}) {
  const value = useWatch({ control: form.control, name });
  if (typeof value !== "number" || value === 0) {
    return <div className="h-5" />;
  }
  const isInteger = Number.isInteger(value);
  return (
    <div className="flex justify-center h-5">
      {isInteger ? (
        <span className="text-xs text-muted-foreground tabular-nums">{value}</span>
      ) : (
        <StackedFraction value={value} />
      )}
    </div>
  );
}

// --- Cell input (forwarded ref for auto-nav) ---
const CellInput = forwardRef<
  HTMLInputElement,
  {
    form: UseFormReturn<CustomerMeasurementsSchema>;
    name: Path<CustomerMeasurementsSchema>;
    isDisabled: boolean;
    isComputed?: boolean;
    onEnterPress?: () => void;
  }
>(function CellInput({ form, name, isDisabled, isComputed, onEnterPress }, ref) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field, fieldState }) => {
        const { ref: fieldRef, ...fieldProps } = field;
        const hasError = !!fieldState.error;

        if (isComputed) {
          return (
            <div className="text-sm font-semibold text-foreground/70 tabular-nums h-9 flex items-center justify-center">
              {typeof field.value === "number" && field.value !== 0 ? (
                field.value
              ) : (
                <span className="text-muted-foreground/40">—</span>
              )}
            </div>
          );
        }

        return (
          <FormControl>
            <Input
              ref={(element) => {
                fieldRef(element);
                if (typeof ref === "function") ref(element);
                else if (ref) ref.current = element;
              }}
              type="number"
              step="0.01"
              {...fieldProps}
              value={typeof field.value === "number" ? field.value : ""}
              onChange={(e) => {
                const v = e.target.value;
                field.onChange(v === "" ? undefined : parseFloat(v));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onEnterPress?.();
                }
              }}
              className={cn(
                "h-9 w-full text-center tabular-nums bg-transparent border-0 shadow-none px-1",
                hasError && "ring-1 ring-red-500",
                "focus:ring-1 focus:ring-primary focus-visible:ring-1 focus-visible:ring-primary",
                "disabled:cursor-not-allowed disabled:bg-muted/30 disabled:text-gray-500",
              )}
              disabled={isDisabled}
              placeholder="—"
            />
          </FormControl>
        );
      }}
    />
  );
});

// --- Main table component ---
export function MeasurementTable({
  form,
  title,
  columns,
  isDisabled,
  getFieldRef,
  getEnterHandler,
}: MeasurementTableProps) {
  return (
    <div className="bg-card rounded-xl shadow-sm overflow-hidden border border-border p-3">
      {title && (
        <h4 className="text-sm font-semibold pb-2 text-foreground">{title}</h4>
      )}
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-t border-border">
            {columns.map((col) => (
              <th
                key={col.name}
                className="border border-border px-2 py-2 text-[11px] text-muted-foreground font-medium text-center leading-tight bg-muted/40"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Decimal input row */}
          <tr>
            {columns.map((col) => {
              const fieldPath = col.name as Path<CustomerMeasurementsSchema>;
              return (
                <td key={col.name} className="border border-border px-1.5 py-1.5">
                  <CellInput
                    ref={getFieldRef?.(fieldPath)}
                    form={form}
                    name={fieldPath}
                    isDisabled={isDisabled || (col.isComputed ?? false)}
                    isComputed={col.isComputed}
                    onEnterPress={getEnterHandler?.(fieldPath)}
                  />
                </td>
              );
            })}
          </tr>
          {/* Fraction row */}
          <tr>
            {columns.map((col) => (
              <td
                key={col.name}
                className="border border-border px-1.5 py-1 bg-muted/20"
              >
                <FractionCell
                  form={form}
                  name={col.name as Path<CustomerMeasurementsSchema>}
                />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
