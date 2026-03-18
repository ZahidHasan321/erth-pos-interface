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
    <div key={title} className={cn("bg-card border border-border rounded-xl p-3 shadow-sm", wrapperClassName)}>
      {title && <h4 className="text-sm font-semibold mb-2 text-foreground">{title}</h4>}
      <div className="flex flex-wrap gap-x-4 gap-y-2 items-end">
        {fields.map((fieldOrFieldGroup, index) => {
          if (Array.isArray(fieldOrFieldGroup)) {
            return (
              <div key={index} className="flex flex-wrap gap-x-4 gap-y-2 items-end border-l-2 border-primary/20 pl-3">
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
                      isComputed={fieldConfig.isDisabled ?? false}
                      className={cn(fieldConfig.className)}
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
              className={cn(fieldConfig.className)}
              labelClassName={fieldConfig.labelClassName}
              onEnterPress={getEnterHandler?.(fieldPath)}
            />
          );
        })}
      </div>
    </div>
  );
}
