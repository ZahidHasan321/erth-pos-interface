"use client";

import * as React from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { Combobox } from "@/components/ui/combobox";
import { getFabrics } from "@/api/fabrics";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import Fuse from "fuse.js";
import type { CellContext } from "@tanstack/react-table";
import type { GarmentSchema } from "./garment-form.schema";

export const GarmentIdCell = ({
    row,
}: CellContext<GarmentSchema, unknown>) => {
    const { control } = useFormContext();
    return (
        <div className="min-w-25">
            <Controller
                name={`garments.${row.index}.garment_id`}
                control={control}
                defaultValue={row.original.garment_id}
                render={({ field }) => <span>{field.value}</span>}
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
        <div className="min-w-[150px]">
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
                                    "w-[150px] min-w-[150px] bg-background border-border/60",
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
                        {error && (
                            <span className="text-xs text-destructive">{error.message}</span>
                        )}
                    </div>
                )}
            />
        </div>
    );
};

export const BrovaCell = ({
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
                name={`garments.${row.index}.brova`}
                control={control}
                render={({ field, fieldState: { error } }) => (
                    <div className="flex flex-col gap-1 items-center">
                        <Checkbox
                            checked={field.value || false}
                            onCheckedChange={field.onChange}
                            disabled={isFormDisabled}
                            className={cn(error && "border-destructive")}
                        />
                        {error && (
                            <span className="text-xs text-destructive text-center">
                                {error.message}
                            </span>
                        )}
                    </div>
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

    const fabricSource = useWatch({
        name: `garments.${row.index}.fabric_source`,
    });

    const previousFabricSource = React.useRef(fabricSource);

    React.useEffect(() => {
        if (fabricSource === "OUT" && previousFabricSource.current === "IN") {
            // In the new schema, color is not a direct field but let's assume it's needed for UI
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
        <div className="flex flex-col space-y-1 w-[200px] min-w-[180px]">
            <Controller
                name={`garments.${row.index}.fabric_source`}
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
                        {error && (
                            <span className="text-xs text-destructive">{error.message}</span>
                        )}
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

    const fabricSource = useWatch({
        name: `garments.${row.index}.fabric_source`,
    });

    const isDisabled = fabricSource !== "OUT";

    return (
        <div className="min-w-[150px]">
            <Controller
                name={`garments.${row.index}.shop_name`}
                control={control}
                render={({ field, fieldState: { error } }) => (
                    <div className="flex flex-col gap-1">
                        <Input
                            className={cn(
                                "min-w-[150px] bg-background border-border/60",
                                error && "border-destructive",
                            )}
                            placeholder="Enter shop name"
                            {...field}
                            value={field.value || ""}
                            disabled={isDisabled || isFormDisabled}
                        />
                        {error && (
                            <span className="text-xs text-destructive">{error.message}</span>
                        )}
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
    };
    const isFormDisabled = meta?.isFormDisabled || false;

    const [fabricSource, fabricId] = useWatch({
        name: [
            `garments.${row.index}.fabric_source`,
            `garments.${row.index}.fabric_id`,
        ],
    });

    const isDisabled = fabricSource === "OUT" || !fabricSource;
    const [searchQuery, setSearchQuery] = React.useState("");

    const { data: fabricsResponse } = useQuery({
        queryKey: ["fabrics"],
        queryFn: getFabrics,
        staleTime: Infinity,
        gcTime: Infinity,
    });

    const fabrics = fabricsResponse?.data || [];

    React.useEffect(() => {
        if (fabricSource === "IN" && fabricId) {
            const selectedFabric = fabrics.find((f) => f.id === fabricId);
            if (selectedFabric) {
                setValue(
                    `garments.${row.index}.color`,
                    selectedFabric.color,
                    { shouldValidate: true, shouldDirty: true },
                );
            }
        }
    }, [fabricId, fabricSource, fabrics, row.index, setValue]);

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

        return results.map((fabric) => ({
            value: fabric.id.toString(),
            label: `${fabric.name} - ${fabric.color} - ${fabric.price_per_meter} - ${fabric.real_stock}`,
            node: (
                <div className="flex justify-between w-full">
                    <span
                        className={getStockColorClass(fabric.real_stock ?? 0)}
                    >{`${fabric.name} - ${fabric.color}`}</span>
                    <div className="flex gap-1">
                        <span className="text-muted-foreground">{`Price: ${fabric.price_per_meter}`}</span>
                        <span
                            className={getStockColorClass(fabric.real_stock ?? 0)}
                        >{`Stock: ${(fabric.real_stock ?? 0).toFixed(2)}`}</span>
                    </div>
                </div>
            ),
        }));
    }, [fabrics, fuse, searchQuery]);

    return (
        <div className="flex flex-col space-y-1 w-[200px] min-w-[200px]">
            {isDisabled || isFormDisabled ? (
                <Input
                    placeholder="Search fabric..."
                    disabled
                    className="cursor-not-allowed text-destructive bg-muted border-border/60"
                />
            ) : (
                <Controller
                    name={`garments.${row.index}.fabric_id`}
                    control={control}
                    render={({ field, fieldState: { error } }) => (
                        <div className="flex flex-col gap-1">
                            <Combobox
                                options={fabricOptions}
                                value={field.value?.toString() || ""}
                                onChange={(value) => {
                                    field.onChange(value ? parseInt(value) : null);
                                    setSearchQuery("");
                                }}
                                onSearch={setSearchQuery}
                                placeholder="Search fabric..."
                                disabled={isFormDisabled}
                                className={cn(
                                    "bg-background border-border/60",
                                    error && "border-destructive",
                                )}
                            />
                            {error && (
                                <span className="text-xs text-destructive">
                                    {error.message}
                                </span>
                            )}
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

    const fabricSource = useWatch({
        name: `garments.${row.index}.fabric_source`,
    });

    const isReadOnly = fabricSource === "IN";

    return (
        <div className="min-w-30">
            <Controller
                name={`garments.${row.index}.color`}
                control={control}
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
                        {error && (
                            <span className="text-xs text-destructive">{error.message}</span>
                        )}
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
    const { control, setError, clearErrors } = useFormContext();
    const meta = table.options.meta as {
        isFormDisabled?: boolean;
        tempStockUsage?: Map<string, number>;
    };
    const isFormDisabled = meta?.isFormDisabled || false;
    const tempStockUsage = meta?.tempStockUsage || new Map();
    const { data: fabricsResponse } = useQuery({
        queryKey: ["fabrics"],
        queryFn: getFabrics,
        staleTime: Infinity,
        gcTime: Infinity,
    });
    const fabrics = fabricsResponse?.data || [];

    const [fabricSource, fabricId, fabricLength] = useWatch({
        name: [
            `garments.${row.index}.fabric_source`,
            `garments.${row.index}.fabric_id`,
            `garments.${row.index}.fabric_length`,
        ],
    });

    React.useEffect(() => {
        // Skip validation if fabric_length is empty (will be validated on submit via schema refine)
        if (fabricLength == null) {
            clearErrors(`garments.${row.index}.fabric_length`);
            return;
        }

        const requestedLength = Number(fabricLength);

        if (fabricSource === "IN" && fabricId) {
            const selectedFabric = fabrics.find((f) => f.id === fabricId);
            if (selectedFabric) {
                const realStock = selectedFabric.real_stock ?? 0;
                const totalUsage = tempStockUsage.get(fabricId.toString()) || 0;

                if (isNaN(requestedLength) || requestedLength < 0) {
                    setError(`garments.${row.index}.fabric_length`, {
                        type: "manual",
                        message: "Invalid length",
                    });
                } else if (totalUsage > realStock) {
                    setError(`garments.${row.index}.fabric_length`, {
                        type: "manual",
                        message: `Insufficient stock (Total used: ${totalUsage.toFixed(2)}m, Available: ${realStock.toFixed(2)}m)`,
                    });
                } else {
                    clearErrors(`garments.${row.index}.fabric_length`);
                }
            }
        } else if (fabricSource === "OUT") {
            if (isNaN(requestedLength) || requestedLength < 0) {
                setError(`garments.${row.index}.fabric_length`, {
                    type: "manual",
                    message: "Invalid length",
                });
            } else {
                clearErrors(`garments.${row.index}.fabric_length`);
            }
        }
    }, [
        fabricId,
        fabricLength,
        fabricSource,
        fabrics,
        setError,
        clearErrors,
        row.index,
        tempStockUsage,
    ]);

    return (
        <div className="min-w-30">
            <Controller
                name={`garments.${row.index}.fabric_length`}
                control={control}
                render={({ field, fieldState: { error } }) => (
                    <div className="flex flex-col gap-1">
                        <Input
                            {...field}
                            value={field.value ?? ""}
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            className={cn(
                                "min-w-30 bg-background border-border/60",
                                error && "border-destructive",
                            )}
                            readOnly={isFormDisabled}
                            onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                        />
                        {error && (
                            <span className="text-xs text-destructive">{error.message}</span>
                        )}
                    </div>
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
    const { control, setValue, setError, clearErrors } = useFormContext();
    const meta = table.options.meta as {
        isFormDisabled?: boolean;
    };
    const isFormDisabled = meta?.isFormDisabled || false;

    const deliveryDate = useWatch({
        name: `garments.${row.index}.delivery_date`,
    });

    React.useEffect(() => {
        if (!deliveryDate) {
            setError(`garments.${row.index}.delivery_date`, {
                type: "manual",
                message: "Delivery date is required",
            });
        } else {
            clearErrors(`garments.${row.index}.delivery_date`);
        }
    }, [deliveryDate, row.index, setError, clearErrors]);

    const handleDateChange = (date: Date | null) => {
        setValue(`garments.${row.index}.delivery_date`, date?.toISOString() || null);
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
                        {error && (
                            <span className="text-xs text-destructive whitespace-nowrap">
                                {error.message}
                            </span>
                        )}
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
    const { data: fabricsResponse } = useQuery({
        queryKey: ["fabrics"],
        queryFn: getFabrics,
        staleTime: Infinity,
    });
    const fabrics = fabricsResponse?.data || [];

    const [fabricSource, fabricId, fabricLength] = useWatch({
        name: [
            `garments.${row.index}.fabric_source`,
            `garments.${row.index}.fabric_id`,
            `garments.${row.index}.fabric_length`,
        ],
    });

    React.useEffect(() => {
        if (fabricSource === "OUT") {
            setValue(`garments.${row.index}.fabric_amount`, 0);
            return;
        }

        const length = Number(fabricLength ?? 0);

        if (fabricSource === "IN" && fabricId !== undefined && fabricId !== null) {
            const selectedFabric = fabrics.find((f) => f.id === Number(fabricId));
            if (selectedFabric) {
                const pricePerMeter = selectedFabric.price_per_meter ?? 0;
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
        <div className="min-w-40">
            <Controller
                name={`garments.${row.index}.fabric_amount`}
                control={control}
                render={({ field }) => (
                    <Input
                        type="text"
                        {...field}
                        value={
                            typeof field.value === "number" ? field.value.toFixed(2) : "0.00"
                        }
                        readOnly
                        className="w-40 min-w-40 bg-muted border-border/60"
                    />
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
                        {error && (
                            <span className="text-xs text-destructive text-center">
                                {error.message}
                            </span>
                        )}
                    </div>
                )}
            />
        </div>
    );
};

