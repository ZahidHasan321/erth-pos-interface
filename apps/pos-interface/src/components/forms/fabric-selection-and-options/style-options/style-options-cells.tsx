"use client";

import { cn } from "@/lib/utils";
import React from "react";
import type { Style, StylePricingRule } from "@repo/database";
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

/**
 * Compact Yes / No segmented control for a present-or-absent option (§2.11).
 * Unanswered renders in a "not filled" state (dashed amber, or red when the
 * field is invalid) so the order-taker must pick rather than leave a silent
 * default. `value` is `undefined`/`null` until answered.
 */
function YesNoSegment({
  value,
  onChange,
  disabled,
  invalid,
}: {
  value: boolean | null | undefined;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const answered = value === true || value === false;
  return (
    <div
      className={cn(
        "inline-flex rounded-md border p-0.5 text-xs",
        disabled && "opacity-50",
        !answered ? (invalid ? "border-red-400" : "border-dashed border-amber-400") : "border-border",
      )}
    >
      {([true, false] as const).map((opt) => (
        <button
          key={String(opt)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt)}
          className={cn(
            "px-2 py-0.5 rounded-[4px] font-semibold transition-colors",
            value === opt
              ? opt
                ? "bg-primary text-primary-foreground"
                : "bg-foreground text-background"
              : "text-muted-foreground hover:bg-muted",
            disabled && "cursor-not-allowed",
          )}
        >
          {opt ? "Yes" : "No"}
        </button>
      ))}
    </div>
  );
}

/** Up / Down / Standard picker for collar position (§2.11). Unanswered renders
 *  "not filled"; "standard" persists as null (no DB migration). */
function CollarPositionSegment({
  value,
  onChange,
  disabled,
  invalid,
}: {
  value: string | null | undefined;
  onChange: (v: "up" | "down" | "standard") => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const answered = value === "up" || value === "down" || value === "standard";
  const opts: { v: "up" | "down" | "standard"; l: string }[] = [
    { v: "up", l: "Up" },
    { v: "down", l: "Down" },
    { v: "standard", l: "Std" },
  ];
  return (
    <div
      className={cn(
        "inline-flex rounded-md border p-0.5 text-xs",
        disabled && "opacity-50",
        !answered ? (invalid ? "border-red-400" : "border-dashed border-amber-400") : "border-border",
      )}
    >
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.v)}
          className={cn(
            "px-1.5 py-0.5 rounded-[4px] font-semibold transition-colors",
            value === o.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            disabled && "cursor-not-allowed",
          )}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

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
    styles?: Style[];
    stitchingPrice?: number;
    stylePricingRules?: StylePricingRule[];
  };
  const styles = meta?.styles || [];
  const stitchingPrice = meta?.stitchingPrice || 0;
  const stylePricingRules = meta?.stylePricingRules || [];

  const garment = useWatch({
    control,
    name: `garments.${row.index}` as `garments.${number}`,
  }) as GarmentSchema;

  const stylePrice = React.useMemo(() => {
    if (!garment) return 0;

    // Calculate style options price from styles table
    const baseStylePrice = styles.length > 0
      ? calculateGarmentStylePrice(garment, styles, stylePricingRules)
      : 0;

    // Add stitching price (child or adult from DB)
    return baseStylePrice + stitchingPrice;
  }, [garment, styles, stitchingPrice, stylePricingRules]);

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
    <div className="flex flex-row space-x-3 items-center [&>*]:shrink-0">
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
        render={({ field, fieldState }) => (
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-1">
              <img
                src={smallTabaggiImage}
                alt="Small Tabaggi"
                className="h-4 w-4 object-contain shrink-0"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">small tabbagi</span>
            </div>
            <YesNoSegment
              value={field.value}
              onChange={field.onChange}
              disabled={isFormDisabled}
              invalid={fieldState.invalid}
            />
          </div>
        )}
      />
      <Controller
        name={`garments.${row.index}.collar_position`}
        control={control}
        render={({ field, fieldState }) => (
          <div className="flex flex-col gap-1 min-w-[64px]">
            <span className="text-xs text-muted-foreground leading-none">Position</span>
            <CollarPositionSegment
              value={field.value}
              onChange={field.onChange}
              disabled={isFormDisabled}
              invalid={fieldState.invalid}
            />
          </div>
        )}
      />
      <Controller
        name={`garments.${row.index}.collar_thickness`}
        control={control}
        render={({ field }) => (
          <Select
            onValueChange={field.onChange}
            value={field.value || ""}
            disabled={isFormDisabled}
          >
            <SelectTrigger className="bg-background border-border/60 min-w-[80px]">
              <SelectValue placeholder="Hashwa" />
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

export const JabzourCell = ({
  row,
  table,
}: CellContext<GarmentSchema, unknown>) => {
  const { control, setValue, getValues } = useFormContext();
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
      const current = getValues(`garments.${row.index}.jabzour_thickness`);
      if (!current) {
        setValue(`garments.${row.index}.jabzour_thickness`, "DOUBLE");
      }
    } else {
      setValue(`garments.${row.index}.jabzour_2`, null);
    }
  }, [isShaab, setValue, getValues, row.index]);

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
              <p className="text-sm text-destructive">
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
              disabled={isFormDisabled}
            >
              <SelectTrigger
                className={cn(
                  "bg-background border-border/60 min-w-[60px]",
                  fieldState.error && "border-destructive",
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
              <p className="text-sm text-destructive">
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
  const { control } = useFormContext();
  const meta = table.options.meta as {
    isFormDisabled?: boolean;
  };
  const isFormDisabled = meta?.isFormDisabled || false;

  const accessories: { name: keyof GarmentSchema; icon: string; alt: string }[] = [
    { name: "wallet_pocket", icon: walletIcon, alt: "Wallet Pocket" },
    { name: "pen_holder", icon: penIcon, alt: "Pen Holder" },
    { name: "mobile_pocket", icon: phoneIcon, alt: "Mobile Pocket" },
  ];

  return (
    <div className="flex flex-row space-x-3 items-start">
      {accessories.map((a) => (
        <Controller
          key={a.name}
          name={`garments.${row.index}.${a.name}`}
          control={control}
          render={({ field, fieldState }) => (
            <div className="flex flex-col items-center gap-1">
              <img src={a.icon} alt={a.alt} className="min-w-10 h-10 object-contain" />
              <YesNoSegment
                value={field.value as boolean | null | undefined}
                onChange={field.onChange}
                disabled={isFormDisabled}
                invalid={fieldState.invalid}
              />
            </div>
          )}
        />
      ))}
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

