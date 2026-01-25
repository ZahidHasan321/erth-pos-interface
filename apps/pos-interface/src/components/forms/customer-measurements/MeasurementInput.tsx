import { type UseFormReturn, type Path } from "react-hook-form";
import { forwardRef } from "react";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { CustomerMeasurementsSchema } from "./measurement-form.schema";

// Convert decimal to mixed fraction
function decimalToMixedFraction(decimal: number): string {
  if (decimal === 0 || isNaN(decimal)) return "";

  const isNegative = decimal < 0;
  const absDecimal = Math.abs(decimal);

  const whole = Math.floor(absDecimal);
  const fractionalPart = absDecimal - whole;

  if (fractionalPart < 0.001) {
    return isNegative ? `-${whole}` : `${whole}`;
  }

  // Find best fraction approximation
  const gcd = (a: number, b: number): number =>
    b < 0.0001 ? a : gcd(b, a % b);

  const precision = 1000000; // Higher precision for better accuracy
  const numerator = Math.round(fractionalPart * precision);
  const denominator = precision;
  const divisor = gcd(numerator, denominator);

  const simplifiedNum = Math.round(numerator / divisor);
  const simplifiedDen = Math.round(denominator / divisor);

  // Format as mixed fraction
  if (whole === 0) {
    return `${isNegative ? "-" : ""}${simplifiedNum}/${simplifiedDen}`;
  }

  return `${isNegative ? "-" : ""}${whole} ${simplifiedNum}/${simplifiedDen}`;
}

interface MeasurementInputProps {
  form: UseFormReturn<CustomerMeasurementsSchema>;
  name: Path<CustomerMeasurementsSchema>;
  label: string;
  unit: string;
  isDisabled: boolean;
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
      render={({ field }) => {
        const { ref: fieldRef, ...fieldProps } = field;
        return (
          <FormItem className={className}>
            <div className="flex items-center gap-4 flex-nowrap">
              <FormLabel className={labelClassName}>{label}</FormLabel>
              <FormControl>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <div className="relative flex items-center">
                      <Input
                        ref={(element) => {
                          // Call both refs
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
                            ? field.value === 0
                              ? ""
                              : field.value
                            : ""
                        }
                        onChange={(e) => {
                          const value = e.target.value;
                          field.onChange(value === "" ? 0 : parseFloat(value));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            onEnterPress?.();
                          }
                        }}
                        className="w-26 bg-white border-black pr-7 focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                        disabled={isDisabled}
                        placeholder="xx"
                      />
                      <span className="absolute right-2 text-gray-500 pointer-events-none">
                        {unit}
                      </span>
                    </div>
                    {field.value &&
                      typeof field.value === "number" &&
                      field.value !== 0 && (
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          ({decimalToMixedFraction(field.value)})
                        </span>
                      )}
                  </div>
                  <FormMessage className="text-[10px]" />
                </div>
              </FormControl>
            </div>
          </FormItem>
        );
      }}
    />
  );
});
