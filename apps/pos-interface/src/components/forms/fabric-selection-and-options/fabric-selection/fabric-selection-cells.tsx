"use client";

import * as React from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@repo/ui/select";
import { Checkbox } from "@repo/ui/checkbox";
import { Input } from "@repo/ui/input";
import { Textarea } from "@repo/ui/textarea";
import { DatePicker } from "@repo/ui/date-picker";
import { Combobox } from "@repo/ui/combobox";
import { getFabrics } from "@/api/fabrics";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import Fuse from "fuse.js";
import type { CellContext } from "@tanstack/react-table";
import type { GarmentSchema } from "./garment-form.schema";
import { Banknote, Package } from "lucide-react";

export const GarmentIdCell = ({
    row,
}: CellContext<GarmentSchema, unknown>) => {
    const { control } = useFormContext();
    return (
        <div>
            <Controller
                name={`garments.${row.index}.garment_id`}
                control={control}
                defaultValue={row.original.garment_id}
                render={({ field }) => <span className="whitespace-nowrap">{field.value}</span>}
            />
        </div>
    );
};

export const MeasurementIdCell = ({
    row,
    table,
}: CellContext<GarmentSchema, unknown>) => {
    const { control } = useFormContext();
    const meta = table.options.meta as {
        measurementOptions?: { id: string; MeasurementID: string }[];
        isFormDisabled?: boolean;
    };
    const measurementOptions: { id: string; MeasurementID: string }[] =
        meta?.measurementOptions || [];
    const isFormDisabled = meta?.isFormDisabled || false;
    return (
        <div>
            <Controller
                name={`garments.${row.index}.measurement_id`}
                control={control}
                render={({ field, fieldState: { error } }) => (
                    <div className="flex flex-col gap-1">
                        <Select
                            onValueChange={field.onChange}
                            value={field.value || ""}
                            disabled={isFormDisabled}
                        >
                            <SelectTrigger
                                className={cn(
                                    "w-full bg-background border-border/60 gap-1",
                                    error && "border-destructive",
                                )}
                            >
                                <SelectValue placeholder="Select ID" />
                            </SelectTrigger>
                            <SelectContent>
                                {measurementOptions.map(
                                    (m: { id: string; MeasurementID: string }) => (
                                        <SelectItem key={m.id} value={m.id}>
                                            {m.MeasurementID}
                                        </SelectItem>
                                    ),
                                )}
                            </SelectContent>
                        </Select>
                    </div>
                )}
            />
        </div>
    );
};

export const GarmentTypeCell = ({
    row,
    table,
}: CellContext<GarmentSchema, unknown>) => {
    const { control } = useFormContext();
    const meta = table.options.meta as {
        isFormDisabled?: boolean;
    };
    const isFormDisabled = meta?.isFormDisabled || false;
    return (
        <div className="w-full flex justify-center items-center">
            <Controller
                name={`garments.${row.index}.garment_type`}
                control={control}
                render={({ field }) => (
                    <Checkbox
                        checked={field.value === "brova"}
                        onCheckedChange={(checked) => {
                            field.onChange(checked ? "brova" : "final");
                        }}
                        disabled={isFormDisabled}
                    />
                )}
            />
        </div>
    );
};

export const FabricSourceCell = ({
    row,
    table,
}: CellContext<GarmentSchema, unknown>) => {
    const { control, setValue } = useFormContext();
    const meta = table.options.meta as {
        isFormDisabled?: boolean;
    };
    const isFormDisabled = meta?.isFormDisabled || false;

    const fabricSourceWatch = useWatch({
        name: `garments.${row.index}.fabric_source`,
    });

    const fabricSource = fabricSourceWatch ?? row.original.fabric_source;

    const previousFabricSource = React.useRef(fabricSource);

    React.useEffect(() => {
        if (fabricSource === "OUT" && previousFabricSource.current === "IN") {
            setValue(`garments.${row.index}.color`, "", {
                shouldValidate: true,
            });
            setValue(`garments.${row.index}.fabric_id`, null, {
                shouldValidate: true,
            });
        }
        previousFabricSource.current = fabricSource;
    }, [fabricSource, row.index, setValue]);

    return (
        <div className="flex flex-col space-y-1">
            <Controller
                name={`garments.${row.index}.fabric_source`}
                control={control}
                defaultValue={row.original.fabric_source}
                render={({ field, fieldState: { error } }) => (
                    <div className="flex flex-col gap-1">
                        <Select
                            onValueChange={field.onChange}
                            value={field.value || ""}
                            disabled={isFormDisabled}
                        >
                            <SelectTrigger
                                className={cn(
                                    "bg-background border-border/60",
                                    error && "border-destructive",
                                )}
                            >
                                <SelectValue placeholder="Select source" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="IN">IN</SelectItem>
                                <SelectItem value="OUT">OUT</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                )}
            />
        </div>
    );
};

export const ShopNameCell = ({
    row,
    table,
}: CellContext<GarmentSchema, unknown>) => {
    const { control } = useFormContext();
    const meta = table.options.meta as {
        isFormDisabled?: boolean;
    };
    const isFormDisabled = meta?.isFormDisabled || false;

    const fabricSourceWatch = useWatch({
        name: `garments.${row.index}.fabric_source`,
    });

    const fabricSource = fabricSourceWatch ?? row.original.fabric_source;

    const isDisabled = fabricSource !== "OUT";

    return (
        <div>
            <Controller
                name={`garments.${row.index}.shop_name`}
                control={control}
                defaultValue={row.original.shop_name}
                render={({ field, fieldState: { error } }) => (
                    <div className="flex flex-col gap-1">
                        <Input
                            className={cn(
                                "w-full bg-background border-border/60",
                                error && "border-destructive",
                            )}
                            placeholder="Enter shop name"
                            {...field}
                            value={field.value || ""}
                            disabled={isDisabled || isFormDisabled}
                        />
                    </div>
                )}
            />
        </div>
    );
};

export const IfInsideCell = ({
    row,
    table,
}: CellContext<GarmentSchema, unknown>) => {
    const { control, setValue } = useFormContext();
    const meta = table.options.meta as {
        isFormDisabled?: boolean;
        tempStockUsage?: Map<string, number>;
    };
    const isFormDisabled = meta?.isFormDisabled || false;
    const tempStockUsage = meta?.tempStockUsage;

    const [fabricSourceWatch, fabricIdWatch] = useWatch({
        name: [
            `garments.${row.index}.fabric_source`,
            `garments.${row.index}.fabric_id`,
        ],
    });

    const fabricSource = fabricSourceWatch ?? row.original.fabric_source;
    const fabricId = fabricIdWatch ?? row.original.fabric_id;

    const isInternal = fabricSource === "IN";
    const [searchQuery, setSearchQuery] = React.useState("");

    const { data: fabrics = [], isLoading: isLoadingFabrics } = useQuery({
        queryKey: ["fabrics"],
        queryFn: getFabrics,
        staleTime: Infinity,
        gcTime: Infinity,
    });

    React.useEffect(() => {
        if (isInternal && fabricId) {
            const selectedFabric = fabrics.find((f) => f.id === fabricId);
            if (selectedFabric) {
                setValue(
                    `garments.${row.index}.color`,
                    selectedFabric.color,
                    { shouldValidate: true, shouldDirty: true },
                );
            }
        }
    }, [fabricId, isInternal, fabrics, row.index, setValue]);

    const fuse = React.useMemo(
        () =>
            new Fuse(fabrics, {
                keys: [
                    "name",
                    "color",
                ],
                includeScore: true,
            }),
        [fabrics],
    );

    const getStockColorClass = (stock: number) => {
        if (stock <= 0) return "text-red-600 font-semibold";
        if (stock < 5) return "text-orange-500 font-semibold";
        if (stock >= 5 && stock <= 11) return "text-green-600 font-semibold";
        return "text-muted-foreground";
    };

    const fabricOptions = React.useMemo(() => {
        const results = searchQuery
            ? fuse.search(searchQuery).map((r) => r.item)
            : fabrics;

        // Hide fabrics with no base stock, unless they're already selected for
        // this row (e.g. editing an order that consumed the last unit).
        const visible = results.filter(
            (f) => (f.shop_stock ?? 0) > 0 || f.id.toString() === fabricId?.toString(),
        );

        return visible.map((fabric) => {
            const baseStock = fabric.shop_stock ?? 0;
            const used = tempStockUsage?.get(fabric.id.toString()) ?? 0;
            const availableStock = baseStock - used;

            return {
                value: fabric.id.toString(),
                label: fabric.name,
                selectedNode: (
                    <div className="flex items-center gap-2 w-full min-w-0">
                        {fabric.color_hex && (
                            <span
                                className="w-3 h-3 rounded-full border border-border/60 shrink-0"
                                style={{ backgroundColor: fabric.color_hex }}
                            />
                        )}
                        <span className="truncate text-sm">{fabric.name}</span>
                        <span className={cn("flex items-center gap-0.5 ml-auto shrink-0 text-xs", getStockColorClass(availableStock))}>
                            <Package className="w-3 h-3" />{availableStock.toFixed(1)}
                        </span>
                    </div>
                ),
                node: (
                    <div className="flex items-center justify-between w-full gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                            {fabric.color_hex && (
                                <span
                                    className="w-3.5 h-3.5 rounded-full border border-border/60 shrink-0"
                                    style={{ backgroundColor: fabric.color_hex }}
                                />
                            )}
                            <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{fabric.name}</p>
                                {fabric.color && (
                                    <p className="text-xs text-muted-foreground">{fabric.color}</p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0 text-xs">
                            <span className="flex items-center gap-0.5 text-muted-foreground">
                                <Banknote className="w-3 h-3" />{fabric.price_per_meter}
                            </span>
                            <span className={cn("flex items-center gap-0.5 font-medium", getStockColorClass(availableStock))}>
                                <Package className="w-3 h-3" />{availableStock.toFixed(1)}
                            </span>
                        </div>
                    </div>
                ),
            };
        });
    }, [fabrics, fuse, searchQuery, tempStockUsage]);

    return (
        <div className="flex flex-col space-y-1 w-full">
            {!isInternal ? (
                <Input
                    placeholder="N/A"
                    disabled
                    className="cursor-not-allowed bg-muted border-border/60"
                />
            ) : (
                <Controller
                    name={`garments.${row.index}.fabric_id`}
                    control={control}
                    defaultValue={row.original.fabric_id}
                    render={({ field, fieldState: { error } }) => (
                        <div className="flex flex-col gap-1">
                            <Combobox
                                options={fabricOptions}
                                value={field.value?.toString() || ""}
                                isLoading={isLoadingFabrics}
                                onChange={(value) => {
                                    field.onChange(value ? parseInt(value) : null);
                                    setSearchQuery("");
                                }}
                                onSearch={setSearchQuery}
                                placeholder="Search fabric…"
                                disabled={isFormDisabled}
                                className={cn(
                                    "bg-background border-border/60",
                                    error && "border-destructive",
                                    isFormDisabled && "opacity-100 cursor-default"
                                )}
                            />
                        </div>
                    )}
                />
            )}
        </div>
    );
};


export const ColorCell = ({
    row,
    table,
}: CellContext<GarmentSchema, unknown>) => {
    const { control } = useFormContext();
    const meta = table.options.meta as {
        isFormDisabled?: boolean;
    };
    const isFormDisabled = meta?.isFormDisabled || false;

    const fabricSourceWatch = useWatch({
        name: `garments.${row.index}.fabric_source`,
    });

    const fabricSource = fabricSourceWatch ?? row.original.fabric_source;

    const isReadOnly = fabricSource === "IN";

    return (
        <div className="min-w-30">
            <Controller
                name={`garments.${row.index}.color`}
                control={control}
                defaultValue={row.original.color}
                render={({ field, fieldState: { error } }) => (
                    <div className="flex flex-col gap-1">
                        <Input
                            className={cn(
                                "min-w-30",
                                isReadOnly
                                    ? "bg-muted border-border/60"
                                    : "bg-background border-border/60",
                                error && "border-destructive",
                            )}
                            {...field}
                            value={field.value || ""}
                            readOnly={isReadOnly || isFormDisabled}
                        />
                    </div>
                )}
            />
        </div>
    );
};

export const FabricLengthCell = ({
    row,
    table,
}: CellContext<GarmentSchema, unknown>) => {
    const { control } = useFormContext();
    const meta = table.options.meta as {
        isFormDisabled?: boolean;
        tempStockUsage?: Map<string, number>;
        stockValidationActive?: boolean;
    };
    const isFormDisabled = meta?.isFormDisabled || false;
    const tempStockUsage = meta?.tempStockUsage;
    const stockValidationActive = meta?.stockValidationActive ?? true;

    const [fabricSourceWatch, fabricIdWatch] = useWatch({
        name: [
            `garments.${row.index}.fabric_source`,
            `garments.${row.index}.fabric_id`,
        ],
    });

    const { data: fabrics = [] } = useQuery({
        queryKey: ["fabrics"],
        queryFn: getFabrics,
        staleTime: Infinity,
        gcTime: Infinity,
    });

    const isInternal = fabricSourceWatch === "IN";
    const selectedFabric = isInternal && fabricIdWatch
        ? fabrics.find((f) => f.id === fabricIdWatch)
        : null;

    // Available stock for THIS garment = base - what OTHER garments used (exclude current row)
    const currentLength = useWatch({ name: `garments.${row.index}.fabric_length` }) ?? 0;
    const baseStock = selectedFabric?.shop_stock ?? 0;
    const totalUsed = tempStockUsage?.get(String(fabricIdWatch)) ?? 0;
    const othersUsed = totalUsed - Number(currentLength);
    const available = baseStock - othersUsed;

    return (
        <div>
            <Controller
                name={`garments.${row.index}.fabric_length`}
                control={control}
                render={({ field, fieldState: { error } }) => {
                    const exceedsStock = stockValidationActive && isInternal && selectedFabric && (field.value ?? 0) > available;
                    return (
                        <div className="flex flex-col gap-1">
                            <Input
                                ref={field.ref}
                                name={field.name}
                                onBlur={field.onBlur}
                                value={field.value ?? ""}
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                className={cn(
                                    "bg-background border-border/60",
                                    (error || exceedsStock) && "border-destructive",
                                )}
                                disabled={isFormDisabled}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    field.onChange(val === "" ? null : Number(val));
                                }}
                            />
                            {exceedsStock && !error && (
                                <span className="text-xs text-destructive">
                                    Exceeds stock ({available.toFixed(1)}m)
                                </span>
                            )}
                        </div>
                    );
                }}
            />
        </div>
    );
};

export const SoakingCell = ({
    row,
    table,
}: CellContext<GarmentSchema, unknown>) => {
    const { control, setValue } = useFormContext();
    const meta = table.options.meta as {
        isFormDisabled?: boolean;
    };
    const isFormDisabled = meta?.isFormDisabled || false;

    const setHours = (hours: 8 | 24, checked: boolean) => {
        if (checked) {
            setValue(`garments.${row.index}.soaking`, true, { shouldDirty: true, shouldValidate: true });
            setValue(`garments.${row.index}.soaking_hours`, hours, { shouldDirty: true, shouldValidate: true });
        } else {
            setValue(`garments.${row.index}.soaking`, false, { shouldDirty: true, shouldValidate: true });
            setValue(`garments.${row.index}.soaking_hours`, null, { shouldDirty: true, shouldValidate: true });
        }
    };

    return (
        <div className="w-full flex flex-col justify-center items-center min-w-24 gap-1">
            <Controller
                name={`garments.${row.index}.soaking_hours`}
                control={control}
                render={({ field }) => (
                    <>
                        <label className="flex items-center gap-1 text-[11px] cursor-pointer select-none">
                            <Checkbox
                                checked={field.value === 8}
                                onCheckedChange={(c) => setHours(8, !!c)}
                                disabled={isFormDisabled}
                            />
                            <span>8h</span>
                        </label>
                        <label className="flex items-center gap-1 text-[11px] cursor-pointer select-none">
                            <Checkbox
                                checked={field.value === 24}
                                onCheckedChange={(c) => setHours(24, !!c)}
                                disabled={isFormDisabled}
                            />
                            <span>24h</span>
                        </label>
                    </>
                )}
            />
        </div>
    );
};

export const ExpressCell = ({
    row,
    table,
}: CellContext<GarmentSchema, unknown>) => {
    const { control } = useFormContext();
    const meta = table.options.meta as {
        isFormDisabled?: boolean;
    };
    const isFormDisabled = meta?.isFormDisabled || false;

    return (
        <div className="w-full flex flex-col justify-center items-center min-w-28">
            <Controller
                name={`garments.${row.index}.express`}
                control={control}
                render={({ field }) => (
                    <div className="flex flex-col gap-1 items-center">
                        <Checkbox
                            checked={field.value || false}
                            onCheckedChange={field.onChange}
                            disabled={isFormDisabled}
                        />
                    </div>
                )}
            />
        </div>
    );
};

export const DeliveryDateCell = ({
    row,
    table,
}: CellContext<GarmentSchema, unknown>) => {
    const { control, setValue } = useFormContext();
    const meta = table.options.meta as {
        isFormDisabled?: boolean;
    };
    const isFormDisabled = meta?.isFormDisabled || false;

    const handleDateChange = (date: Date | null) => {
        setValue(`garments.${row.index}.delivery_date`, date?.toISOString() || null, { shouldValidate: true });
    };

    return (
        <div className="w-50 min-w-37.5">
            <Controller
                name={`garments.${row.index}.delivery_date`}
                control={control}
                render={({ field, fieldState: { error } }) => (
                    <div className="flex flex-col gap-1">
                        <DatePicker
                            value={field.value ? new Date(field.value) : null}
                            onChange={handleDateChange}
                            disabled={isFormDisabled}
                            className={cn(
                                "bg-background border-border/60",
                                error && "border-destructive",
                            )}
                        />
                    </div>
                )}
            />
        </div>
    );
};

export const FabricAmountCell = ({
    row,
}: CellContext<GarmentSchema, unknown>) => {
    const { control, setValue } = useFormContext();
    const { data: fabrics = [] } = useQuery({
        queryKey: ["fabrics"],
        queryFn: getFabrics,
        staleTime: Infinity,
        gcTime: Infinity,
    });

    const [fabricSourceWatch, fabricIdWatch, fabricLengthWatch] = useWatch({
        name: [
            `garments.${row.index}.fabric_source`,
            `garments.${row.index}.fabric_id`,
            `garments.${row.index}.fabric_length`,
        ],
    });

    const fabricSource = fabricSourceWatch ?? row.original.fabric_source;
    const fabricId = fabricIdWatch ?? row.original.fabric_id;
    const fabricLength = fabricLengthWatch ?? row.original.fabric_length;

    React.useEffect(() => {
        if (fabricSource === "OUT") {
            setValue(`garments.${row.index}.fabric_amount`, 0);
            return;
        }

        const length = Number(fabricLength ?? 0);

        if (fabricSource === "IN" && fabricId !== undefined && fabricId !== null) {
            const selectedFabric = fabrics.find((f) => f.id === Number(fabricId));
            if (selectedFabric) {
                const pricePerMeter = Number(selectedFabric.price_per_meter) || 0;
                const amount = length * pricePerMeter;
                setValue(
                    `garments.${row.index}.fabric_amount`,
                    parseFloat(amount.toFixed(3)),
                );
            } else {
                setValue(`garments.${row.index}.fabric_amount`, 0);
            }
        } else {
            setValue(`garments.${row.index}.fabric_amount`, 0);
        }
    }, [fabricId, fabricLength, fabricSource, fabrics, row.index, setValue]);

    return (
        <div>
            <Controller
                name={`garments.${row.index}.fabric_amount`}
                control={control}
                render={({ field }) => (
                    <span className="text-sm font-semibold whitespace-nowrap">
                        {typeof field.value === "number" ? field.value.toFixed(3) : "0.000"} <span className="text-muted-foreground text-xs">KWD</span>
                    </span>
                )}
            />
        </div>
    );
};

export const NoteCell = ({
    row,
    table,
}: CellContext<GarmentSchema, unknown>) => {
    const { control } = useFormContext();
    const meta = table.options.meta as {
        isFormDisabled?: boolean;
    };
    const isFormDisabled = meta?.isFormDisabled || false;
    return (
        <div className="min-w-37.5">
            <Controller
                name={`garments.${row.index}.notes`}
                control={control}
                render={({ field }) => (
                    <Textarea
                        {...field}
                        value={field.value || ""}
                        className="min-w-47.5 min-h-10 max-h-47.5 bg-background border-border/60"
                        readOnly={isFormDisabled}
                    />
                )}
            />
        </div>
    );
};

export const HomeDeliveryCell = ({
    row,
    table,
}: CellContext<GarmentSchema, unknown>) => {
    const { control } = useFormContext();
    const meta = table.options.meta as {
        isFormDisabled?: boolean;
    };
    const isFormDisabled = meta?.isFormDisabled || false;

    return (
        <div className="w-full flex flex-col items-center min-w-20">
            <Controller
                name={`garments.${row.index}.home_delivery`}
                control={control}
                render={({ field, fieldState: { error } }) => (
                    <div className="flex flex-col gap-1 items-center">
                        <Checkbox
                            checked={field.value || false}
                            onCheckedChange={field.onChange}
                            disabled={isFormDisabled}
                            className={cn(error && "border-destructive")}
                        />
                    </div>
                )}
            />
        </div>
    );
};