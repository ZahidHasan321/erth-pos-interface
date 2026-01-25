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
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
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
    <div className="min-w-[150px]">
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

    // Designer style: always 15, regardless of prices being loaded (includes stitching)
    if (garment.style === "design") {
      return 15;
    }

    // For kuwaiti/other styles: calculate style options price if prices are available
    const baseStylePrice = styles.length > 0
      ? calculateGarmentStylePrice(garment, styles)
      : 0;

    // Add stitching price (7 or 9 KWD from the checkboxes)
    return baseStylePrice + stitchingPrice;
  }, [garment, styles, stitchingPrice]);

  return (
    <div className="min-w-[100px] flex items-center justify-center">
      <span className="text-sm font-semibold text-foreground">
        {stylePrice > 0 ? `${stylePrice.toFixed(3)} KD` : "0.000 KD"}
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
    <div className="min-w-[180px] flex items-center space-x-6 px-2">
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
                1 Line
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
                2 Lines
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
  const [collar_type, collar_button, small_tabaggi] = useWatch({
    name: [
      `garments.${row.index}.collar_type`,
      `garments.${row.index}.collar_button`,
      `garments.${row.index}.small_tabaggi`,
    ],
  });

  return (
    <div className="min-w-[350px] flex flex-row space-x-2">
      <Controller
        name={`garments.${row.index}.collar_type`}
        control={control}
        render={({ field }) => (
          <Select
            onValueChange={field.onChange}
            value={field.value || ""}
            disabled={isFormDisabled}
          >
            <SelectTrigger className="bg-background border-border/60 min-w-[120px]">
              {collar_type ? (
                <img
                  src={
                    collarTypes.find((c) => c.value === collar_type)?.image ||
                    undefined
                  }
                  alt={collarTypes.find((c) => c.value === collar_type)?.alt}
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
            <SelectTrigger className="bg-background border-border/60 min-w-[120px]">
              {collar_button ? (
                <img
                  src={
                    collarButtons.find((b) => b.value === collar_button)
                      ?.image || undefined
                  }
                  alt={collarButtons.find((b) => b.value === collar_button)?.alt}
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
  const [jabzour_1, jabzour_2] = useWatch({
    name: [
      `garments.${row.index}.jabzour_1`,
      `garments.${row.index}.jabzour_2`,
    ],
  });

  React.useEffect(() => {
    if (jabzour_1 === "JAB_SHAAB") {
      if (!jabzour_2) {
        setValue(
          `garments.${row.index}.jabzour_2`,
          "JAB_MAGFI_MURABBA",
        );
      }
      setValue(`garments.${row.index}.jabzour_thickness`, "DOUBLE");
    } else {
      setValue(`garments.${row.index}.jabzour_2`, null);
    }
  }, [jabzour_1, jabzour_2, setValue, row.index]);

  return (
    <div className="min-w-[420px] flex flex-row space-x-2">
      <Controller
        name={`garments.${row.index}.jabzour_1`}
        control={control}
        render={({ field, fieldState }) => (
          <div className="flex flex-col space-y-1">
            <Select
              onValueChange={field.onChange}
              value={field.value || ""}
              disabled={isFormDisabled}
            >
              <SelectTrigger
                className={cn(
                  "bg-background border-border/60 min-w-[120px]",
                  fieldState.error && "border-destructive",
                )}
              >
                {jabzour_1 ? (
                  <img
                    src={
                      jabzourTypes.find((j) => j.value === jabzour_1)?.image ||
                      undefined
                    }
                    alt={jabzourTypes.find((j) => j.value === jabzour_1)?.alt}
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
      <Plus className="min-w-5 h-6 mt-2" />
      <Controller
        name={`garments.${row.index}.jabzour_2`}
        control={control}
        render={({ field, fieldState }) => (
          <div className="flex flex-col space-y-1">
            <Select
              onValueChange={field.onChange}
              value={field.value || ""}
              disabled={isFormDisabled || jabzour_1 !== "JAB_SHAAB"}
            >
              <SelectTrigger
                className={cn(
                  "bg-background border-border/60 min-w-[120px]",
                  fieldState.error && "border-destructive",
                )}
              >
                {jabzour_2 ? (
                  <img
                    src={
                      jabzourTypes.find((j) => j.value === jabzour_2)?.image ||
                      undefined
                    }
                    alt={jabzourTypes.find((j) => j.value === jabzour_2)?.alt}
                    className="min-w-10 h-10 object-contain"
                  />
                ) : (
                  <SelectValue placeholder="Select Type" />
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
        )}
      />
      <Controller
        name={`garments.${row.index}.jabzour_thickness`}
        control={control}
        render={({ field, fieldState }) => (
          <div className="flex flex-col space-y-1">
            <Select
              onValueChange={field.onChange}
              value={field.value || ""}
              disabled={isFormDisabled}
            >
              <SelectTrigger
                className={cn(
                  "bg-background border-border/60 min-w-[60px]",
                  fieldState.error && "border-destructive",
                )}
              >
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
  const { control, setValue, getValues } = useFormContext();
  const meta = table.options.meta as {
    isFormDisabled?: boolean;
  };
  const isFormDisabled = meta?.isFormDisabled || false;
  const front_pocket_type = useWatch({
    name: `garments.${row.index}.front_pocket_type`,
  });

  React.useEffect(() => {
    const isMudawwar = front_pocket_type === "FRO_MUDAWWAR_FRONT_POCKET";
    if (isMudawwar) {
      const currentThickness = getValues(
        `garments.${row.index}.front_pocket_thickness`,
      );
      if (currentThickness === "NO HASHWA") {
        setValue(
          `garments.${row.index}.front_pocket_thickness`,
          "DOUBLE",
        );
      }
    }
  }, [front_pocket_type, setValue, getValues, row.index]);

  return (
    <div className="min-w-[300px] flex flex-row space-x-2 justify-center items-center">
      <Controller
        name={`garments.${row.index}.front_pocket_type`}
        control={control}
        render={({ field }) => (
          <Select
            onValueChange={field.onChange}
            value={field.value || ""}
            disabled={isFormDisabled}
          >
            <SelectTrigger className="bg-background border-border/60 min-w-[120px]">
              {front_pocket_type ? (
                <img
                  src={
                    topPocketTypes.find((j) => j.value === front_pocket_type)
                      ?.image || undefined
                  }
                  alt={
                    topPocketTypes.find((j) => j.value === front_pocket_type)?.alt
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
        render={({ field }) => {
          const isMudawwar = front_pocket_type === "FRO_MUDAWWAR_FRONT_POCKET";
          const filteredOptions = isMudawwar
            ? ThicknessOptions.filter((option) => option.value !== "NO HASHWA")
            : ThicknessOptions;

          return (
            <Select
              onValueChange={field.onChange}
              value={field.value || ""}
              disabled={isFormDisabled || !front_pocket_type}
            >
              <SelectTrigger className="bg-background border-border/60 min-w-[60px]">
                <SelectValue placeholder="Select Thickness" />
              </SelectTrigger>
              <SelectContent>
                {filteredOptions.map((option) => (
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
          );
        }}
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
    <div className="min-w-[280px] flex flex-row space-x-4 items-center">
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
                className="min-w-14 h-20 object-contain"
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
                className="min-w-14 h-20 object-contain"
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
  const { control, setValue } = useFormContext();
  const meta = table.options.meta as {
    isFormDisabled?: boolean;
  };
  const isFormDisabled = meta?.isFormDisabled || false;
  const [cuffs_type] = useWatch({
    name: [
      `garments.${row.index}.cuffs_type`,
    ],
  });

  return (
    <div className="min-w-[380px] flex flex-row space-x-2 items-center">
      <Controller
        name={`garments.${row.index}.cuffs_type`}
        control={control}
        render={({ field }) => (
          <Select
            onValueChange={field.onChange}
            value={field.value || ""}
            disabled={isFormDisabled}
          >
            <SelectTrigger className="bg-background border-border/60 min-w-[120px]">
              {cuffs_type ? (
                cuffTypes.find((c) => c.value === cuffs_type)?.image ? (
                  <img
                    src={
                      cuffTypes.find((c) => c.value === cuffs_type)?.image ||
                      undefined
                    }
                    alt={
                      cuffTypes.find((c) => c.value === cuffs_type)?.alt ?? ""
                    }
                    className="min-w-10 h-10 object-contain"
                  />
                ) : (
                  <span>
                    {cuffTypes.find((c) => c.value === cuffs_type)?.displayText}
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

