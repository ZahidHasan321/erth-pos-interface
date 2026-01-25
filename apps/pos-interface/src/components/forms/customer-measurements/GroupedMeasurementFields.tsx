import { type Path, type UseFormReturn } from "react-hook-form";
import { MeasurementInput } from "./MeasurementInput";
import type { CustomerMeasurementsSchema } from "./measurement-form.schema";
import { cn } from "@/lib/utils";

interface GroupedMeasurementFieldsProps {
  form: UseFormReturn<CustomerMeasurementsSchema>;
  title: string;
  unit: string;
  isDisabled: boolean;
  fields: Array<
    |
      {
        name: string;
        label: string;
        className?: string;
        labelClassName?: string;
        isDisabled?: boolean;
      }
    |
      Array<{
        name: string;
        label: string;
        className?: string;
        labelClassName?: string;
        isDisabled?: boolean;
      }>
  >;
  wrapperClassName?: string;
  getFieldRef?: (fieldName: Path<CustomerMeasurementsSchema>) => (element: HTMLInputElement | null) => void;
  getEnterHandler?: (fieldName: Path<CustomerMeasurementsSchema>) => (() => void) | undefined;
}

export function GroupedMeasurementFields({
  form,
  title,
  unit,
  isDisabled,
  fields,
  wrapperClassName,
  getFieldRef,
  getEnterHandler,
}: GroupedMeasurementFieldsProps) {
  return (
    <div key={title} className={cn("bg-card border border-border rounded-xl p-6 shadow-sm", wrapperClassName)}>
      <h4 className="text-lg font-semibold mb-4 text-foreground">{title}</h4>
      <div className="flex flex-col gap-y-4">
        {fields.map((fieldOrFieldGroup, index) => {
          if (Array.isArray(fieldOrFieldGroup)) {
            return (
              <div key={index} className="flex flex-wrap gap-y-6 w-fit gap-x-12 border border-border p-3 rounded-lg bg-card">
                {fieldOrFieldGroup.map((fieldConfig) => {
                  const fieldPath = fieldConfig.name as Path<CustomerMeasurementsSchema>;
                  return (
                    <MeasurementInput
                      key={fieldConfig.name}
                      ref={getFieldRef?.(fieldPath)}
                      form={form}
                      name={fieldPath}
                      label={fieldConfig.label}
                      unit={unit}
                      isDisabled={isDisabled || (fieldConfig.isDisabled ?? false)}
                      className={cn( fieldConfig.className )}
                      labelClassName={fieldConfig.labelClassName}
                      onEnterPress={getEnterHandler?.(fieldPath)}
                    />
                  );
                })}
              </div>
            );
          }

          const fieldConfig = fieldOrFieldGroup;
          const fieldPath = fieldConfig.name as Path<CustomerMeasurementsSchema>;

          return (
            <MeasurementInput
              key={fieldConfig.name}
              ref={getFieldRef?.(fieldPath)}
              form={form}
              name={fieldPath}
              label={fieldConfig.label}
              unit={unit}
              isDisabled={isDisabled || (fieldConfig.isDisabled ?? false)}
              className={cn( fieldConfig.className, "border border-border p-3 rounded-lg w-fit bg-card" )}
              labelClassName={fieldConfig.labelClassName}
              onEnterPress={getEnterHandler?.(fieldPath)}
            />
          );
        })}
      </div>
    </div>
  );
}