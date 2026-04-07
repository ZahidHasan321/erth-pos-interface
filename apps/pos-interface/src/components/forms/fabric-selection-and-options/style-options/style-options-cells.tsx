"use client";

import { cn } from "@/lib/utils";
import React from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/select";
import { Checkbox } from "@repo/ui/checkbox";
import { Plus } from "lucide-react";
import {
  collarButtons,
  collarTypes,
  cuffTypes,
  jabzourTypes,
  penIcon,
  phoneIcon,
  walletIcon,
  smallTabaggiImage,
  thicknessOptions as ThicknessOptions,
  topPocketTypes,
} from "../constants";
import type { CellContext } from "@tanstack/react-table";
import type { GarmentSchema } from "../fabric-selection/garment-form.schema";
import { calculateGarmentStylePrice } from "@/lib/utils/style-utils";

export const GarmentIdCell = ({
  row,
}: CellContext<GarmentSchema, unknown>) => {
  const { control } = useFormContext();
  return (
    <Controller
      name={`garments.${row.index}.garment_id`}
      control={control}
      render={({ field }) => <span>{field.value}</span>}
    />
  );
};

export const StyleCell = ({
  row,
  table,
}: CellContext<GarmentSchema, unknown>) => {
  const { control } = useFormContext();
  const meta = table.options.meta as {
    isFormDisabled?: boolean;
  };
  const isFormDisabled = meta?.isFormDisabled || false;

  return (
    <div>
      <Controller
        name={`garments.${row.index}.style`}
        control={control}
        render={({ field }) => (
          <Select
            onValueChange={field.onChange}
            value={field.value || "kuwaiti"}
            disabled={isFormDisabled}
          >
            <SelectTrigger className="bg-background border-border/60 w-full">
              <SelectValue placeholder="Style" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="kuwaiti">Kuwaiti</SelectItem>
              <SelectItem value="design">Designer</SelectItem>
            </SelectContent>
          </Select>
        )}
      />
    </div>
  );
};

export const AmountCell = ({
  row,
  table,
}: CellContext<GarmentSchema, unknown>) => {
  const { control } = useFormContext();
  const meta = table.options.meta as {
    styles?: any[];
    stitchingPrice?: number;
  };
  const styles = meta?.styles || [];
  const stitchingPrice = meta?.stitchingPrice || 0;

  const garment = useWatch({
    control,
    name: `garments.${row.index}` as any,
  }) as GarmentSchema;

  const stylePrice = React.useMemo(() => {
    if (!garment) return 0;

    // Calculate style options price from styles table
    const baseStylePrice = styles.length > 0
      ? calculateGarmentStylePrice(garment, styles)
      : 0;

    // Add stitching price (child or adult from DB)
    return baseStylePrice + stitchingPrice;
  }, [garment, styles, stitchingPrice]);

  return (
    <div className="flex items-center justify-center">
      <span className="text-sm font-semibold text-foreground whitespace-nowrap">
        {stylePrice > 0 ? stylePrice.toFixed(3) : "0.000"} <span className="text-muted-foreground text-xs">KWD</span>
      </span>
    </div>
  );
};

export const LinesCell = ({
  row,
  table,
}: CellContext<GarmentSchema, unknown>) => {
  const { control } = useFormContext();
  const meta = table.options.meta as {
    isFormDisabled?: boolean;
  };
  const isFormDisabled = meta?.isFormDisabled || false;

  return (
    <div className="flex items-center space-x-4 px-1">
      <Controller
        name={`garments.${row.index}.lines`}
        control={control}
        render={({ field }) => (
          <>
            <div className="flex items-center space-x-2">
              <Checkbox
                id={`line1-${row.index}`}
                checked={field.value === 1}
                onCheckedChange={(checked) => {
                  if (checked) field.onChange(1);
                }}
                disabled={isFormDisabled}
              />
              <label
                htmlFor={`line1-${row.index}`}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                1
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id={`line2-${row.index}`}
                checked={field.value === 2}
                onCheckedChange={(checked) => {
                  if (checked) field.onChange(2);
                }}
                disabled={isFormDisabled}
              />
              <label
                htmlFor={`line2-${row.index}`}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                2
              </label>
            </div>
          </>
        )}
      />
    </div>
  );
};

export const CollarCell = ({
  row,
  table,
}: CellContext<GarmentSchema, unknown>) => {
  const { control } = useFormContext();
  const meta = table.options.meta as {
    isFormDisabled?: boolean;
  };
  const isFormDisabled = meta?.isFormDisabled || false;

  return (
    <div className="flex flex-row space-x-2">
      <Controller
        name={`garments.${row.index}.collar_type`}
        control={control}
        render={({ field }) => (
          <Select
            onValueChange={field.onChange}
            value={field.value || ""}
            disabled={isFormDisabled}
          >
            <SelectTrigger className="bg-background border-border/60">
              {field.value ? (
                <img
                  src={
                    collarTypes.find((c) => c.value === field.value)?.image ||
                    undefined
                  }
                  alt={collarTypes.find((c) => c.value === field.value)?.alt}
                  className="min-w-10 h-10 object-contain"
                />
              ) : (
                <SelectValue placeholder="Select Type" />
              )}
            </SelectTrigger>
            <SelectContent>
              {collarTypes.map((ct) => (
                <SelectItem key={ct.value} value={ct.value}>
                  <div className="flex items-center space-x-2">
                    <img
                      src={ct.image || undefined}
                      alt={ct.alt}
                      className="min-w-12 h-12 object-contain"
                    />
                    <span>{ct.displayText}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <Controller
        name={`garments.${row.index}.collar_button`}
        control={control}
        render={({ field }) => (
          <Select
            onValueChange={field.onChange}
            value={field.value || ""}
            disabled={isFormDisabled}
          >
            <SelectTrigger className="bg-background border-border/60">
              {field.value ? (
                <img
                  src={
                    collarButtons.find((b) => b.value === field.value)
                      ?.image || undefined
                  }
                  alt={collarButtons.find((b) => b.value === field.value)?.alt}
                  className="min-w-10 h-10 object-contain"
                />
              ) : (
                <SelectValue placeholder="Select Button" />
              )}
            </SelectTrigger>
            <SelectContent>
              {collarButtons.map((button) => (
                <SelectItem key={button.value} value={button.value}>
                  <div className="flex items-center space-x-2">
                    <img
                      src={button.image || undefined}
                      alt={button.alt}
                      className="min-w-12 h-12 object-contain"
                    />
                    <span>{button.displayText}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <Controller
        name={`garments.${row.index}.small_tabaggi`}
        control={control}
        render={({ field }) => (
          <div className="flex items-center space-x-2 min-w-[60px]">
            <Checkbox
              id={`small_tabaggi-${row.index}`}
              checked={field.value || false}
              onCheckedChange={field.onChange}
              disabled={isFormDisabled}
            />
            <label htmlFor={`small_tabaggi-${row.index}`}>
              <img
                src={smallTabaggiImage}
                alt="Small Tabaggi"
                className="min-w-8 h-8 object-contain"
              />
            </label>
          </div>
        )}
      />
    </div>
  );
};

export const JabzourCell = ({
  row,
  table,
}: CellContext<GarmentSchema, unknown>) => {
  const { control, setValue } = useFormContext();
  const meta = table.options.meta as {
    isFormDisabled?: boolean;
  };
  const isFormDisabled = meta?.isFormDisabled || false;
  const jabzour_1 = useWatch({
    name: `garments.${row.index}.jabzour_1`,
  });
  const isShaab = jabzour_1 === "JAB_SHAAB";

  React.useEffect(() => {
    if (isShaab) {
      setValue(`garments.${row.index}.jabzour_thickness`, "DOUBLE");
    } else {
      setValue(`garments.${row.index}.jabzour_2`, null);
    }
  }, [isShaab, setValue, row.index]);

  return (
    <div className="flex items-center gap-2">
      <Controller
        name={`garments.${row.index}.jabzour_1`}
        control={control}
        render={({ field, fieldState }) => (
          <div className="flex flex-col gap-1">
            <Select
              onValueChange={field.onChange}
              value={field.value || ""}
              disabled={isFormDisabled}
            >
              <SelectTrigger
                className={cn(
                  "bg-background border-border/60",
                  fieldState.error && "border-destructive",
                )}
              >
                {field.value ? (
                  <img
                    src={
                      jabzourTypes.find((j) => j.value === field.value)?.image ||
                      undefined
                    }
                    alt={jabzourTypes.find((j) => j.value === field.value)?.alt}
                    className="min-w-10 h-10 object-contain"
                  />
                ) : (
                  <SelectValue placeholder="Select Type" />
                )}
              </SelectTrigger>
              <SelectContent>
                {jabzourTypes.map((jabzourType) => (
                  <SelectItem key={jabzourType.value} value={jabzourType.value}>
                    <div className="flex items-center space-x-2">
                      <img
                        src={jabzourType.image || undefined}
                        alt={jabzourType.alt}
                        className="min-w-12 h-12 object-contain"
                      />
                      <span>{jabzourType.displayText}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldState.error && (
              <p className="text-xs text-destructive">
                {fieldState.error.message}
              </p>
            )}
          </div>
        )}
      />
      {isShaab && (
        <Controller
          name={`garments.${row.index}.jabzour_2`}
          control={control}
          render={({ field, fieldState }) => (
            <div className="flex items-center gap-1.5">
              <Plus className="size-3 text-muted-foreground/60 shrink-0" />
              <div className="flex flex-col gap-1">
                <Select
                  onValueChange={field.onChange}
                  value={field.value || ""}
                  disabled={isFormDisabled}
                >
                  <SelectTrigger
                    className={cn(
                      "bg-background border-border/60",
                      fieldState.error && "border-destructive",
                    )}
                  >
                    {field.value ? (
                      <img
                        src={
                          jabzourTypes.find((j) => j.value === field.value)?.image ||
                          undefined
                        }
                        alt={jabzourTypes.find((j) => j.value === field.value)?.alt}
                        className="min-w-10 h-10 object-contain"
                      />
                    ) : (
                      <SelectValue placeholder="2nd" />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {jabzourTypes
                      .filter((j) => j.value !== "JAB_SHAAB")
                      .map((jabzourType) => (
                        <SelectItem
                          key={jabzourType.value}
                          value={jabzourType.value}
                        >
                          <div className="flex items-center space-x-2">
                            <img
                              src={jabzourType.image || undefined}
                              alt={jabzourType.alt}
                              className="min-w-12 h-12 object-contain"
                            />
                            <span>{jabzourType.displayText}</span>
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {fieldState.error && (
                  <p className="text-xs text-destructive">
                    {fieldState.error.message}
                  </p>
                )}
              </div>
            </div>
          )}
        />
      )}
      <Controller
        name={`garments.${row.index}.jabzour_thickness`}
        control={control}
        render={({ field, fieldState }) => (
          <div className="flex flex-col gap-1">
            <Select
              onValueChange={field.onChange}
              value={field.value || ""}
              disabled={isFormDisabled || isShaab}
            >
              <SelectTrigger
                className={cn(
                  "bg-background border-border/60 min-w-[60px]",
                  fieldState.error && "border-destructive",
                  isShaab && "opacity-60",
                )}
              >
                <SelectValue placeholder="Thickness" />
              </SelectTrigger>
              <SelectContent>
                {ThicknessOptions.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className={option.className}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldState.error && (
              <p className="text-xs text-destructive">
                {fieldState.error.message}
              </p>
            )}
          </div>
        )}
      />
    </div>
  );
};

export const FrontPocketCell = ({
  row,
  table,
}: CellContext<GarmentSchema, unknown>) => {
  const { control } = useFormContext();
  const meta = table.options.meta as {
    isFormDisabled?: boolean;
  };
  const isFormDisabled = meta?.isFormDisabled || false;
  const front_pocket_type = useWatch({
    name: `garments.${row.index}.front_pocket_type`,
  });

  return (
    <div className="flex flex-row space-x-2 items-center">
      <Controller
        name={`garments.${row.index}.front_pocket_type`}
        control={control}
        render={({ field }) => (
          <Select
            onValueChange={field.onChange}
            value={field.value || ""}
            disabled={isFormDisabled}
          >
            <SelectTrigger className="bg-background border-border/60">
              {field.value ? (
                <img
                  src={
                    topPocketTypes.find((j) => j.value === field.value)
                      ?.image || undefined
                  }
                  alt={
                    topPocketTypes.find((j) => j.value === field.value)?.alt
                  }
                  className="min-w-7 h-7 object-contain"
                />
              ) : (
                <SelectValue placeholder="Select Type" />
              )}
            </SelectTrigger>
            <SelectContent>
              {topPocketTypes.map((tpt) => (
                <SelectItem key={tpt.value} value={tpt.value}>
                  <div className="flex items-center space-x-2">
                    <img
                      src={tpt.image || undefined}
                      alt={tpt.alt}
                      className="min-w-12 h-12 object-contain"
                    />
                    <span>{tpt.displayText}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <Controller
        name={`garments.${row.index}.front_pocket_thickness`}
        control={control}
        render={({ field }) => (
          <Select
            onValueChange={field.onChange}
            value={field.value || ""}
            disabled={isFormDisabled || !front_pocket_type}
          >
            <SelectTrigger className="bg-background border-border/60 min-w-[60px]">
              <SelectValue placeholder="Select Thickness" />
            </SelectTrigger>
            <SelectContent>
              {ThicknessOptions.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className={option.className}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </div>
  );
};

export const AccessoriesCell = ({
  row,
  table,
}: CellContext<GarmentSchema, unknown>) => {
  const { control, setValue, getValues } = useFormContext();
  const meta = table.options.meta as {
    isFormDisabled?: boolean;
  };
  const isFormDisabled = meta?.isFormDisabled || false;

  const handleAccessoryChange = (field: string, value: boolean) => {
    if (row.index === 0) {
      const allGarments = getValues("garments") as GarmentSchema[];
      allGarments.forEach((_, index) => {
        setValue(`garments.${index}.${field}` as any, value);
      });
    }
  };

  return (
    <div className="flex flex-row space-x-3 items-center">
      <Controller
        name={`garments.${row.index}.wallet_pocket`}
        control={control}
        render={({ field }) => (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={`wallet-${row.index}`}
              checked={field.value || false}
              onCheckedChange={(value) => {
                if (row.index === 0) {
                  handleAccessoryChange("wallet_pocket", value as boolean);
                } else {
                  field.onChange(value);
                }
              }}
              disabled={isFormDisabled}
            />
            <label htmlFor={`wallet-${row.index}`}>
              <img
                src={walletIcon}
                alt="Wallet Pocket"
                className="min-w-10 h-10 object-contain"
              />
            </label>
          </div>
        )}
      />
      <Controller
        name={`garments.${row.index}.pen_holder`}
        control={control}
        render={({ field }) => (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={`pen_holder-${row.index}`}
              checked={field.value || false}
              onCheckedChange={(value) => {
                if (row.index === 0) {
                  handleAccessoryChange("pen_holder", value as boolean);
                } else {
                  field.onChange(value);
                }
              }}
              disabled={isFormDisabled}
            />
            <label htmlFor={`pen_holder-${row.index}`}>
              <img
                src={penIcon}
                alt="Pen Holder"
                className="min-w-10 h-10 object-contain"
              />
            </label>
          </div>
        )}
      />
      <Controller
        name={`garments.${row.index}.mobile_pocket`}
        control={control}
        render={({ field }) => (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={`mobile_pocket-${row.index}`}
              checked={field.value || false}
              onCheckedChange={(value) => {
                if (row.index === 0) {
                  handleAccessoryChange("mobile_pocket", value as boolean);
                } else {
                  field.onChange(value);
                }
              }}
              disabled={isFormDisabled}
            />
            <label htmlFor={`mobile_pocket-${row.index}`}>
              <img
                src={phoneIcon}
                alt="Mobile Pocket"
                className="min-w-10 h-10 object-contain"
              />
            </label>
          </div>
        )}
      />
    </div>
  );
};

export const CuffsCell = ({
  row,
  table,
}: CellContext<GarmentSchema, unknown>) => {
  const { control } = useFormContext();
  const meta = table.options.meta as {
    isFormDisabled?: boolean;
  };
  const isFormDisabled = meta?.isFormDisabled || false;
  const cuffs_type = useWatch({
    name: `garments.${row.index}.cuffs_type`,
  });

  return (
    <div className="flex flex-row space-x-2 items-center">
      <Controller
        name={`garments.${row.index}.cuffs_type`}
        control={control}
        render={({ field }) => (
          <Select
            onValueChange={field.onChange}
            value={field.value || ""}
            disabled={isFormDisabled}
          >
            <SelectTrigger className="bg-background border-border/60">
              {field.value ? (
                cuffTypes.find((c) => c.value === field.value)?.image ? (
                  <img
                    src={
                      cuffTypes.find((c) => c.value === field.value)?.image ||
                      undefined
                    }
                    alt={
                      cuffTypes.find((c) => c.value === field.value)?.alt ?? ""
                    }
                    className="min-w-10 h-10 object-contain"
                  />
                ) : (
                  <span>
                    {cuffTypes.find((c) => c.value === field.value)?.displayText}
                  </span>
                )
              ) : (
                <SelectValue placeholder="Select Type" />
              )}
            </SelectTrigger>
            <SelectContent>
              {cuffTypes.map((ct) => (
                <SelectItem key={ct.value} value={ct.value}>
                  <div className="flex items-center space-x-2">
                    {ct.image && (
                      <img
                        src={ct.image || undefined}
                        alt={ct.alt ?? ""}
                        className="min-w-12 h-12 object-contain"
                      />
                    )}
                    <span>{ct.displayText}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <Controller
        name={`garments.${row.index}.cuffs_thickness`}
        control={control}
        render={({ field }) => (
          <Select
            onValueChange={field.onChange}
            value={field.value || ""}
            disabled={isFormDisabled || cuffs_type === "CUF_NO_CUFF"}
          >
            <SelectTrigger className="bg-background border-border/60 min-w-[60px]">
              <SelectValue placeholder="Select Thickness" />
            </SelectTrigger>
            <SelectContent>
              {ThicknessOptions.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className={option.className}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </div>
  );
};

