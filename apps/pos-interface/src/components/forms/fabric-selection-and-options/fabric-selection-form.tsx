"use client";

import { getFabrics } from "@/api/fabrics";
import { getPrices } from "@/api/prices";
import { createGarment, updateGarment } from "@/api/garments";
import { getMeasurementsByCustomerId } from "@/api/measurements";
import { getStyles } from "@/api/styles";
import { getCampaigns } from "@/api/campaigns";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { SignaturePad } from "@/components/forms/signature-pad";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as React from "react";
import { useReactToPrint } from "react-to-print";
import {
    FormProvider,
    type UseFormReturn,
    useFieldArray,
    Controller,
} from "react-hook-form";
import { toast } from "sonner";
import {
    AlertCircle,
    XCircle,
    Package,
    DollarSign,
    Sparkles,
    Loader2,
    Plus,
    Copy,
    Save,
    Pencil,
    X,
    Printer,
    ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getFabricValue } from "@/lib/utils/fabric-utils";
import { DataTable } from "./data-table";
import { columns as fabricSelectionColumns } from "./fabric-selection/fabric-selection-columns";
import {
    type GarmentSchema,
    garmentDefaults,
} from "./fabric-selection/garment-form.schema";
import {
    mapFormValuesToGarment,
} from "./fabric-selection/garment-form.mapper";
import { columns as styleOptionsColumns } from "./style-options/style-options-columns";
import {
    type StyleOptionsSchema,
    styleOptionsDefaults,
} from "./style-options/style-options-form.schema";
import { FabricLabel } from "./fabric-selection/fabric-print-component";

type FabricFormValues = {
    garments: GarmentSchema[];
    signature: string;
};

interface FabricSelectionFormProps {
    customerId: number | null;
    customerName?: string;
    customerMobile?: string;
    orderId: number | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    form: UseFormReturn<FabricFormValues, any, any>;
    onSubmit?: (data: FabricFormValues) => void;
    onProceed: () => void;
    isProceedDisabled?: boolean;
    onCampaignsChange: (campaigns: string[]) => void;
    isOrderClosed: boolean;
    checkoutStatus?: "draft" | "confirmed" | "cancelled";
    fatoura?: number;
    orderDate?: Date | string | null;
    deliveryDate?: string | undefined;
    setDeliveryDate: (date: string) => void;
    stitchingPrice: number;
    setStitchingPrice: (price: number) => void;
    initialCampaigns?: string[];
}

export function FabricSelectionForm({
    customerId,
    customerName,
    customerMobile,
    orderId,
    form,
    onSubmit,
    onProceed,
    onCampaignsChange,
    isProceedDisabled = false,
    isOrderClosed,
    checkoutStatus,
    fatoura,
    orderDate,
    deliveryDate,
    setDeliveryDate,
    stitchingPrice,
    setStitchingPrice,
    initialCampaigns = [],
}: FabricSelectionFormProps) {
    const [numRowsToAdd, setNumRowsToAdd] = React.useState(0);
    const [selectedCampaigns, setSelectedCampaigns] = React.useState<string[]>(
        [],
    );
    const [isEditing, setIsEditing] = React.useState(true);
    const [isSaved, setIsSaved] = React.useState(false);
    const [validationErrors, setValidationErrors] = React.useState<string[]>([]);
    const [selectedMeasurementId, setSelectedMeasurementId] = React.useState<
        string | null
    >(null);
    const [fabricMeter, setFabricMeter] = React.useState<number | null>(null);
    const [qallabi, setQallabi] = React.useState<number | null>(null);
    const [cuffs, setCuffs] = React.useState<number | null>(null);

    const [tempStockUsage, setTempStockUsage] = React.useState<
        Map<string, number>
    >(new Map());

    const printAllRef = React.useRef<HTMLDivElement>(null);

    const handlePrintAll = useReactToPrint({
        contentRef: printAllRef,
        documentTitle: `Fabric-Labels-${orderId || "all"}`,
        pageStyle: `
      @page {
        size: 5in 4in;
        margin: 0;
      }
      @media print {
        html, body {
          margin: 0;
          padding: 0;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .page-break {
          page-break-after: always;
          break-after: page;
        }
      }
    `,
    });

    React.useEffect(() => {
        setSelectedCampaigns(initialCampaigns || []);
    }, [initialCampaigns?.join(",")]);

    const { data: fabricsResponse } = useQuery({
        queryKey: ["fabrics"],
        queryFn: getFabrics,
        staleTime: Infinity,
        gcTime: Infinity,
    });

    const fabrics = fabricsResponse?.data || [];

    const { data: pricesResponse } = useQuery({
        queryKey: ["prices"],
        queryFn: getPrices,
        staleTime: Infinity,
        gcTime: Infinity,
    });

    const prices = pricesResponse?.data || [];

    const { data: stylesResponse } = useQuery({
        queryKey: ["styles"],
        queryFn: getStyles,
        staleTime: Infinity,
        gcTime: Infinity,
    });

    const styles = stylesResponse?.data || [];

    // --- MOVE HERE ---
    const {
        fields: garmentFields,
        append: appendGarment,
        remove: removeGarment,
    } = useFieldArray({
        control: form.control,
        name: "garments",
    });
    // -----------------

    const calculateTempStockUsage = React.useCallback(() => {
        const garments = form.getValues("garments");
        const usage = new Map<string, number>();

        garments.forEach((garment) => {
            if (garment.fabric_source === "IN" && garment.fabric_id) {
                const length = garment.fabric_length ?? 0;
                if (length > 0) {
                    const fabricIdStr = garment.fabric_id.toString();
                    const currentUsage = usage.get(fabricIdStr) || 0;
                    usage.set(fabricIdStr, currentUsage + length);
                }
            }
        });

        return usage;
    }, [form]);

    React.useEffect(() => {
        const initialUsage = calculateTempStockUsage();
        setTempStockUsage(initialUsage);
    }, [calculateTempStockUsage]);

    React.useEffect(() => {
        const subscription = form.watch((_value, { name }) => {
            if (name?.startsWith("garments")) {
                const newUsage = calculateTempStockUsage();
                setTempStockUsage(newUsage);
            }
        });
        return () => subscription.unsubscribe();
    }, [form, calculateTempStockUsage]);


    React.useEffect(() => {
        if (!deliveryDate) return;

        garmentFields.forEach((_, index) => {
            form.setValue(
                `garments.${index}.delivery_date`,
                new Date(deliveryDate).toISOString(),
                {
                    shouldDirty: true,
                    shouldTouch: false,
                    shouldValidate: false,
                },
            );
        });
    }, [deliveryDate, garmentFields.length]);

    React.useEffect(() => {
        const subscription = form.watch((_value, { name }) => {
            if (
                name?.includes(".brova") ||
                name?.includes(".home_delivery")
            ) {
                const match = name?.match(/garments\.(\d+)\./);
                if (match) {
                    const rowIndex = parseInt(match[1], 10);
                    form.trigger(`garments.${rowIndex}.brova`);
                    // home_delivery trigger removed as it's not in the flat schema yet or handled elsewhere
                }
            }
        });
        return () => subscription.unsubscribe();
    }, [form]);

    const validateGarments = React.useCallback(() => {
        const errors: string[] = [];
        const garments = form.getValues("garments");

        if (garments.length === 0) {
            errors.push("At least one garment must be added to save");
            return errors;
        }

        garments.forEach((garment, index) => {
            if (!garment.fabric_source) {
                errors.push(`Row ${index + 1}: Fabric source is required`);
            }

            if (!garment.measurement_id) {
                errors.push(`Row ${index + 1}: Measurement ID is required`);
            }

            if (!garment.fabric_length || (garment.fabric_length ?? 0) <= 0) {
                errors.push(`Row ${index + 1}: Valid fabric length is required`);
            }

            if (garment.fabric_source === "IN") {
                if (!garment.fabric_id) {
                    errors.push(
                        `Row ${index + 1}: Fabric selection is required for "IN" source`,
                    );
                } else {
                    const selectedFabric = fabrics.find(
                        (f) => f.id === garment.fabric_id,
                    );
                    if (selectedFabric) {
                        const realStock = selectedFabric.real_stock ?? 0;
                        const totalUsage = tempStockUsage.get(garment.fabric_id.toString()) || 0;

                        if (totalUsage > realStock) {
                            errors.push(
                                `Row ${index + 1}: Insufficient stock. Total requested for this fabric: ${totalUsage.toFixed(2)}m, Available: ${realStock}m`,
                            );
                        }
                    }
                }
            }

            if (!garment.delivery_date) {
                errors.push(`Row ${index + 1}: Delivery date is required`);
            }
        });

        return errors;
    }, [form]);

    const { mutate: saveGarmentsMutation, isPending: isSaving } = useMutation({
        mutationFn: async (data: {
            garments: GarmentSchema[];
        }) => {
            if (!orderId) {
                throw new Error(
                    "Please create an order first before saving fabric selections",
                );
            }

            const promises = data.garments.map(async (garment) => {
                const stitchingSnapshot = garment.style === "design" ? 9 : stitchingPrice;
                const styleSnapshot = calculateGarmentStylePrice(garment, prices || []);
                const fabricSnapshot = garment.fabric_amount || 0;

                const garmentData = mapFormValuesToGarment(garment, orderId, {
                    stitching_price_snapshot: stitchingSnapshot,
                    style_price_snapshot: styleSnapshot,
                    fabric_price_snapshot: fabricSnapshot,
                });

                if (garment.id && garment.id !== "") {
                    return updateGarment(garment.id, garmentData);
                } else {
                    return createGarment(garmentData);
                }
            });

            return Promise.all(promises);
        },
        onSuccess: (responses) => {
            const errorResponses = responses.filter((r) => !r || (r as any).status === "error");

            if (errorResponses.length > 0) {
                toast.error(
                    `Failed to save ${errorResponses.length} garment(s)`,
                );
                return;
            }

            toast.success(`${responses.length} garment(s) saved successfully!`);

            const updatedGarments = form
                .getValues("garments")
                .map((garment, index) => {
                    const savedData = responses[index]?.data;
                    if (savedData) {
                        return mapFormValuesToGarment(savedData as any, orderId); // Wait, mapGarmentToFormValues
                    }
                    return garment;
                });

            form.setValue("garments", updatedGarments);

            setValidationErrors([]);
            setIsSaved(true);
            setIsEditing(false);

            onSubmit?.({
                garments: updatedGarments,
                signature: form.getValues("signature"),
            });
        },
        onError: (error) => {
            console.error("Failed to save garments:", error);
            const errorMessage =
                error instanceof Error
                    ? error.message
                    : "Failed to save garments. Please try again.";
            toast.error(errorMessage);
        },
    });

    const handleSaveSelections = () => {
        const errors = validateGarments();

        if (errors.length > 0) {
            setValidationErrors(errors);
            toast.error(`Cannot save: ${errors.length} validation error(s) found`);

            setTimeout(() => {
                const alertElement = document.getElementById("validation-errors");
                if (alertElement) {
                    alertElement.scrollIntoView({ behavior: "smooth", block: "center" });
                }
            }, 100);
            fabrics
            return;
        }

        setValidationErrors([]);
        const data = form.getValues();
        saveGarmentsMutation({ garments: data.garments });
    };

    const { data: campaignsResponse, isSuccess: campaignResSuccess } = useQuery({
        queryKey: ["campaigns"],
        queryFn: getCampaigns,
        staleTime: Infinity,
        gcTime: Infinity,
    });

    const activeCampaigns =
        campaignResSuccess && campaignsResponse && campaignsResponse.data
            ? campaignsResponse.data
            : [];

    const { data: measurementQuery, isLoading: isLoadingMeasurements } = useQuery({
        queryKey: ["measurements", customerId],
        queryFn: () => {
            if (!customerId) {
                return Promise.resolve(null);
            }
            return getMeasurementsByCustomerId(customerId);
        },
        staleTime: Infinity,
        gcTime: Infinity,
    });

    const measurements = measurementQuery?.data || [];

    React.useEffect(() => {
        if (selectedMeasurementId) {
            const selectedMeasurement = measurements.find(
                (m) => m.id === selectedMeasurementId,
            );
            if (selectedMeasurement) {
                const length = selectedMeasurement.length_front;
                const bottom = selectedMeasurement.bottom;

                if (length && bottom) {
                    const meter = getFabricValue(Number(length), Number(bottom)); // <--- Fix: Convert to Number
                    if (meter) {
                        setFabricMeter(meter);
                        setQallabi(meter + 0.25);
                        setCuffs(meter + 0.5);
                    } else {
                        setFabricMeter(null);
                        setQallabi(null);
                        setCuffs(null);
                    }
                } else {
                    setFabricMeter(null);
                    setQallabi(null);
                    setCuffs(null);
                }
            }
        } else {
            setFabricMeter(null);
            setQallabi(null);
            setCuffs(null);
        }
    }, [selectedMeasurementId, measurements]);

    const measurementOptions =
        measurementQuery?.data && measurementQuery.data.length > 0
            ? measurementQuery.data
                .filter((m) => !!m.id)
                .map((m) => ({
                    id: m.id as string,
                    MeasurementID: m.measurement_id || m.id,
                }))
            : [];

    const addGarmentRow = (index: number, orderIdParam?: string | number) => {
        const latestMeasurement =
            measurements.length > 0 ? measurements[measurements.length - 1] : null;
        const currentOrderId = orderIdParam || orderId || "";
        appendGarment({
            ...garmentDefaults,
            garment_id: currentOrderId + "-" + (index + 1),
            measurement_id: latestMeasurement?.id ?? null,
        });
    };

    const removeGarmentRow = (rowIndex: number) => {
        removeGarment(rowIndex);

        const currentOrderId = orderId || "";
        const garments = form.getValues("garments");

        garments.forEach((_, index) => {
            if (index >= rowIndex) {
                const newGarmentId = currentOrderId + "-" + (index + 1);
                form.setValue(`garments.${index}.garment_id`, newGarmentId);
            }
        });

        setValidationErrors((prev) =>
            prev.filter((error) => !error.startsWith(`Row ${rowIndex + 1}:`)),
        );
    };

    function syncRows(
        desiredCount: number,
        fields: any[],
        handlers: {
            addRow: (index: number, orderId?: string | number) => void;
            removeRow: (rowIndex: number) => void;
        },
    ) {
        const currentCount = fields.length;

        if (currentCount < desiredCount) {
            for (let i = currentCount; i < desiredCount; i++) {
                handlers.addRow(i, orderId || undefined);
            }
        } else if (currentCount > desiredCount) {
            for (let i = currentCount - 1; i >= desiredCount; i--) {
                handlers.removeRow(i);
            }
        }
    }

    const isFormDisabled = (isSaved && !isEditing) || !orderId || isOrderClosed;

    const hasFormErrors =
        Object.keys(form.formState.errors).length > 0 && form.formState.isSubmitted;

    const copyGarmentToAll = () => {
        const garments = form.getValues("garments");
        if (garments.length < 2) {
            toast.info("Need at least 2 rows to copy");
            return;
        }

        const firstRow = garments[0];
        const updatedGarments = garments.map((garment, index) => {
            if (index === 0) return garment;

            return {
                ...garment,
                ...firstRow,
                id: garment.id, // Keep original ID
                garment_id: garment.garment_id, // Keep original garment_id
            };
        });

        form.setValue("garments", updatedGarments);
        toast.success("Copied first row's data to all rows");
    };

    return (
        <FormProvider {...form}>
            <form
                onSubmit={form.handleSubmit(handleSaveSelections, (errors) =>
                    console.log("validation errors: ", errors, form.getValues()),
                )}
                className="w-full space-y-6"
            >
                {/* Title Section */}
                <div className="flex justify-between items-start mb-2">
                    <div className="space-y-1">
                        <h1 className="text-3xl font-bold text-foreground">
                            Fabric Selection & Style Options
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Choose fabrics and customize style options for garments
                        </p>
                    </div>
                </div>

                {/* Order Required Warning */}
                {!orderId && !isOrderClosed && (
                    <Alert variant="destructive" className="mb-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Order Required</AlertTitle>
                        <AlertDescription>
                            Please complete the Demographics step and create an order before
                            saving fabric selections.
                        </AlertDescription>
                    </Alert>
                )}

                <div className="p-6 border border-border rounded-xl bg-card w-full overflow-hidden shadow-sm space-y-6">
                    {/* Validation Errors Alert */}
                    {validationErrors.length > 0 && (
                        <Alert
                            id="validation-errors"
                            variant="destructive"
                            className="mb-4 border-2 border-red-500"
                        >
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle className="font-bold">
                                Validation Errors ({validationErrors.length})
                            </AlertTitle>
                            <AlertDescription>
                                <ul className="list-disc pl-5 mt-2 space-y-1">
                                    {validationErrors.map((error, index) => (
                                        <li key={index} className="text-sm">
                                            {error}
                                        </li>
                                    ))}
                                </ul>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="mt-3"
                                    onClick={() => setValidationErrors([])}
                                >
                                    <XCircle className="h-4 w-4 mr-1" />
                                    Dismiss
                                </Button>
                            </AlertDescription>
                        </Alert>
                    )}

                    {/* Form Errors Alert */}
                    {hasFormErrors && validationErrors.length === 0 && (
                        <Alert variant="destructive" className="mb-4">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Form has errors</AlertTitle>
                            <AlertDescription>
                                Please check the fields marked in red and correct the errors
                                before saving.
                            </AlertDescription>
                        </Alert>
                    )}

                    <div className="flex flex-wrap justify-between gap-4">
                        <div className="flex flex-wrap gap-4">
                            <div className="flex flex-col gap-3 border-2 border-accent/50 w-fit p-5 rounded-xl bg-linear-to-br from-accent/10 to-muted/20 shadow-md">
                                <div className="flex items-center gap-2 mb-1">
                                    <Package className="w-5 h-5 text-accent-foreground" />
                                    <Label className="text-lg font-bold text-accent-foreground">
                                        Add Pieces
                                    </Label>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <Label
                                        htmlFor="num-fabrics"
                                        className="text-sm font-medium text-muted-foreground"
                                    >
                                        Number of pieces
                                    </Label>
                                    <Input
                                        id="num-fabrics"
                                        type="number"
                                        placeholder="e.g., 2"
                                        onChange={(e) =>
                                            setNumRowsToAdd(parseInt(e.target.value, 10))
                                        }
                                        className="w-32 bg-background border-border/60"
                                        disabled={isFormDisabled}
                                    />
                                </div>
                                <Button
                                    type="button"
                                    onClick={() => {
                                        if (numRowsToAdd > 0) {
                                            syncRows(numRowsToAdd, garmentFields, {
                                                addRow: addGarmentRow,
                                                removeRow: removeGarmentRow,
                                            });
                                        }
                                    }}
                                    disabled={isFormDisabled}
                                    size="sm"
                                    className="w-full"
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Add / Sync
                                </Button>
                            </div>

                            <div className="flex flex-col gap-3 border-2 border-secondary/30 w-fit p-5 rounded-xl bg-linear-to-br from-secondary/5 to-primary/5 shadow-md">
                                <div className="flex items-center gap-2 mb-1">
                                    <DollarSign className="w-5 h-5 text-secondary" />
                                    <Label className="text-lg font-bold text-secondary">
                                        Stitching Price
                                    </Label>
                                </div>
                                <div className="space-y-2">
                                    <label
                                        htmlFor="price-9"
                                        className={cn(
                                            "flex items-center space-x-3 p-3 rounded-lg border-2 transition-all cursor-pointer",
                                            stitchingPrice === 9
                                                ? "border-secondary bg-secondary/10 shadow-sm"
                                                : "border-border/50 bg-background hover:border-secondary/50 hover:bg-accent/20",
                                        )}
                                    >
                                        <Checkbox
                                            id="price-9"
                                            checked={stitchingPrice === 9}
                                            onCheckedChange={(checked) =>
                                                checked ? setStitchingPrice(9) : null
                                            }
                                            disabled={isFormDisabled}
                                        />
                                        <span
                                            className={cn(
                                                "font-medium text-sm",
                                                stitchingPrice === 9
                                                    ? "text-secondary"
                                                    : "text-foreground",
                                            )}
                                        >
                                            9 KWD
                                        </span>
                                    </label>

                                    <label
                                        htmlFor="price-7"
                                        className={cn(
                                            "flex items-center space-x-3 p-3 rounded-lg border-2 transition-all cursor-pointer",
                                            stitchingPrice === 7
                                                ? "border-secondary bg-secondary/10 shadow-sm"
                                                : "border-border/50 bg-background hover:border-secondary/50 hover:bg-accent/20",
                                        )}
                                    >
                                        <Checkbox
                                            id="price-7"
                                            checked={stitchingPrice === 7}
                                            onCheckedChange={(checked) =>
                                                checked ? setStitchingPrice(7) : null
                                            }
                                            disabled={isFormDisabled}
                                        />
                                        <span
                                            className={cn(
                                                "font-medium text-sm",
                                                stitchingPrice === 7
                                                    ? "text-secondary"
                                                    : "text-foreground",
                                            )}
                                        >
                                            7 KWD
                                        </span>
                                    </label>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 border-2 border-muted/50 w-fit min-w-50 p-5 rounded-xl bg-linear-to-br from-muted/10 to-accent/10 shadow-md">
                                <div className="flex items-center gap-2 mb-1">
                                    <Label className="text-lg font-bold text-foreground">
                                        Delivery Date
                                    </Label>
                                </div>
                                <div className="space-y-3">
                                    <div className="flex flex-col gap-2">
                                        <Label className="text-sm font-medium text-muted-foreground">
                                            Actual Delivery
                                        </Label>
                                        <DatePicker
                                            placeholder={new Date().toISOString()}
                                            value={deliveryDate ? new Date(deliveryDate) : new Date()}
                                            onChange={(value) => {
                                                if (value) setDeliveryDate(value.toISOString());
                                            }}
                                            disabled={isFormDisabled}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <Label className="text-sm font-medium text-muted-foreground">
                                            Dummy Delivery
                                        </Label>
                                        <DatePicker
                                            placeholder="Pick a date"
                                            value={undefined}
                                            onChange={() => { }}
                                            disabled
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 border-2 border-primary/30 w-fit p-5 rounded-xl bg-linear-to-br from-primary/5 to-secondary/5 shadow-md">
                                <div className="flex items-center gap-2 mb-1">
                                    <Sparkles className="w-5 h-5 text-primary" />
                                    <Label className="text-lg font-bold text-primary">
                                        Campaign Offers
                                    </Label>
                                </div>
                                {activeCampaigns.length > 0 ? (
                                    <div className="space-y-2">
                                        {activeCampaigns.map((campaign) => (
                                            <label
                                                key={campaign.id}
                                                htmlFor={campaign.id.toString()}
                                                className={cn(
                                                    "flex items-center space-x-3 p-3 rounded-lg border-2 transition-all cursor-pointer",
                                                    selectedCampaigns.includes(campaign.id.toString())
                                                        ? "border-primary bg-primary/10 shadow-sm"
                                                        : "border-border/50 bg-background hover:border-primary/50 hover:bg-accent/20",
                                                )}
                                            >
                                                <Checkbox
                                                    id={campaign.id.toString()}
                                                    checked={selectedCampaigns.includes(campaign.id.toString())}
                                                    onCheckedChange={(checked) => {
                                                        const updatedCampaigns = checked
                                                            ? Array.from(
                                                                new Set([...selectedCampaigns, campaign.id.toString()]),
                                                            )
                                                            : selectedCampaigns.filter(
                                                                (id) => id !== campaign.id.toString(),
                                                            );

                                                        setSelectedCampaigns(updatedCampaigns);
                                                        onCampaignsChange(updatedCampaigns);
                                                    }}
                                                    disabled={isFormDisabled}
                                                />
                                                <span
                                                    className={cn(
                                                        "font-medium text-sm",
                                                        selectedCampaigns.includes(campaign.id.toString())
                                                            ? "text-primary"
                                                            : "text-foreground",
                                                    )}
                                                >
                                                    {campaign.name}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground italic">
                                        No active campaigns
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 border-2 border-primary/30 w-fit p-5 rounded-xl bg-linear-to-br from-primary/5 to-secondary/5 shadow-md">
                            <Label className="text-lg font-bold text-primary">
                                Measurement Helper
                            </Label>

                            {isLoadingMeasurements ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Loading measurements...</span>
                                </div>
                            ) : measurements.length === 0 ? (
                                <div className="text-sm text-muted-foreground italic">
                                    No measurements available. Please add measurements first.
                                </div>
                            ) : (
                                <>
                                    <Select
                                        onValueChange={setSelectedMeasurementId}
                                        value={selectedMeasurementId || ""}
                                    >
                                        <SelectTrigger className="w-50 bg-background border-border/60">
                                            <SelectValue placeholder="Select Measurement ID" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {measurements.map((m) => (
                                                <SelectItem key={m.id} value={m.id ?? ""}>
                                                    {m.measurement_id}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    {selectedMeasurementId ? (
                                        fabricMeter !== null ? (
                                            <div className="mt-2 p-3 bg-primary/10 rounded-lg border border-primary/30 space-y-1">
                                                <p className="text-sm">
                                                    <strong className="text-foreground">Fabric Meter:</strong>{" "}
                                                    <span className="text-primary font-semibold">{fabricMeter}m</span>
                                                </p>
                                                <p className="text-sm">
                                                    <strong className="text-foreground">Qallabi:</strong>{" "}
                                                    <span className="text-primary font-semibold">{qallabi}m</span>
                                                </p>
                                                <p className="text-sm">
                                                    <strong className="text-foreground">Cuffs:</strong>{" "}
                                                    <span className="text-primary font-semibold">{cuffs}m</span>
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="text-sm text-muted-foreground italic mt-2">
                                                Invalid values
                                            </div>
                                        )
                                    ) : (
                                        <div className="text-sm text-muted-foreground italic mt-2">
                                            Select a measurement to see fabric calculations
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex justify-between items-end">
                            <div className="space-y-1">
                                <h2 className="text-2xl font-bold text-foreground">
                                    Garment Selections
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                    Select fabric source, type, and measurements for each garment
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={copyGarmentToAll}
                                disabled={isFormDisabled || garmentFields.length < 2}
                                title="Copy first row's data to all other rows"
                            >
                                <Copy className="w-4 h-4 mr-2" />
                                Copy First Row
                            </Button>
                        </div>
                    </div>

                    <DataTable
                        columns={fabricSelectionColumns}
                        data={garmentFields}
                        removeRow={removeGarmentRow}
                        measurementOptions={measurementOptions}
                        updateData={(rowIndex, columnId, value) =>
                            form.setValue(
                                `garments.${rowIndex}.${columnId}` as any,
                                value,
                            )
                        }
                        isFormDisabled={isFormDisabled}
                        checkoutStatus={checkoutStatus}
                        fatoura={fatoura}
                        orderDate={orderDate}
                        orderID={orderId || undefined}
                        customerId={customerId || undefined}
                        customerName={customerName || undefined}
                        customerMobile={customerMobile || undefined}
                        tempStockUsage={tempStockUsage}
                    />

                    <div className="flex justify-end pt-4">
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={handlePrintAll}
                            disabled={garmentFields.length === 0}
                        >
                            <Printer className="w-4 h-4 mr-2" />
                            Print All Labels
                        </Button>
                    </div>

                    <div style={{ display: "none" }}>
                        <div ref={printAllRef}>
                            {garmentFields.map((_, index) => {
                                const currentRowData = form.getValues(
                                    `garments.${index}`,
                                ) as GarmentSchema;
                                const measurementDisplay =
                                    measurementOptions.find(
                                        (m) => m.id === currentRowData.measurement_id,
                                    )?.id || currentRowData.measurement_id;

                                const fabricData = {
                                    orderId: orderId || "N/A",
                                    customerId: customerId ?? "N/A",
                                    customerName: customerName ?? "N/A",
                                    customerMobile: customerMobile ?? "N/A",
                                    garmentId: currentRowData.garment_id ?? "",
                                    fabricSource: currentRowData.fabric_source ?? "",
                                    fabricId: currentRowData.fabric_id ?? "",
                                    fabricLength: currentRowData.fabric_length ?? 0,
                                    measurementId: measurementDisplay ?? "",
                                    brova: currentRowData.brova ?? false,
                                    express: currentRowData.express ?? false,
                                    deliveryDate: currentRowData.delivery_date ? new Date(currentRowData.delivery_date) : null,
                                };

                                return (
                                    <div
                                        key={index}
                                        className={
                                            index < garmentFields.length - 1
                                                ? "page-break"
                                                : ""
                                        }
                                    >
                                        <FabricLabel fabricData={fabricData} />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex justify-between items-end pt-4">
                        <div className="space-y-1">
                            <h2 className="text-2xl font-bold text-foreground">
                                Style Options
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                Customize collar, pockets, buttons, and other style details
                            </p>
                        </div>
                    </div>
                    <DataTable
                        columns={styleOptionsColumns}
                        measurementOptions={measurementOptions}
                        data={garmentFields}
                        removeRow={removeGarmentRow}
                        updateData={(rowIndex, columnId, value) =>
                            form.setValue(
                                `garments.${rowIndex}.${columnId}` as any,
                                value,
                            )
                        }
                        isFormDisabled={isFormDisabled}
                        styles={prices}
                        stitchingPrice={stitchingPrice}
                    />

                    <div className="space-y-2 pt-4">
                        <h3 className="text-lg font-semibold text-foreground">
                            Customer Signature
                            <span className="text-destructive"> *</span>
                        </h3>
                        <Controller
                            name="signature"
                            control={form.control}
                            render={({ field, fieldState }) => (
                                <div className="space-y-2">
                                    <div className="w-fit">
                                        {field.value ? (
                                            <div className="space-y-2">
                                                <div className="border rounded-lg bg-white/70">
                                                    <img
                                                        src={field.value}
                                                        alt="Customer signature"
                                                        style={{
                                                            width: "500px",
                                                            height: "200px",
                                                            display: "block",
                                                        }}
                                                    />
                                                </div>
                                                {!isFormDisabled && (
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => field.onChange("")}
                                                    >
                                                        <X className="w-4 h-4 mr-2" />
                                                        Clear Signature
                                                    </Button>
                                                )}
                                            </div>
                                        ) : !isFormDisabled ? (
                                            <SignaturePad
                                                onSave={(signature) => {
                                                    field.onChange(signature);
                                                    toast.success("Signature saved");
                                                }}
                                            />
                                        ) : (
                                            <div
                                                className="border rounded-lg bg-muted text-center text-muted-foreground"
                                                style={{
                                                    width: "500px",
                                                    height: "200px",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                }}
                                            >
                                                No signature provided
                                            </div>
                                        )}
                                    </div>
                                    {fieldState.error && (
                                        <p className="text-sm text-destructive">
                                            {fieldState.error.message}
                                        </p>
                                    )}
                                </div>
                            )}
                        />
                    </div>
                </div>

                <div className="flex gap-4 justify-end pt-4">
                    {isOrderClosed ? null : !isSaved || isEditing ? (
                        <>
                            {isEditing && isSaved && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        setIsEditing(false);
                                        setValidationErrors([]);
                                    }}
                                >
                                    <X className="w-4 h-4 mr-2" />
                                    Cancel
                                </Button>
                            )}
                            <Button
                                type="submit"
                                disabled={isSaving || !orderId}
                                title={
                                    !orderId
                                        ? "Please create an order first (Demographics step)"
                                        : ""
                                }
                            >
                                <Save className="w-4 h-4 mr-2" />
                                {isSaving
                                    ? "Saving..."
                                    : !orderId
                                        ? "Order Required"
                                        : "Save Selections"}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setTimeout(() => setIsEditing(true), 0);
                                }}
                            >
                                <Pencil className="w-4 h-4 mr-2" />
                                Edit Selections
                            </Button>
                            <Button
                                type="button"
                                onClick={onProceed}
                                disabled={isProceedDisabled}
                            >
                                Continue to Review & Payment
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </>
                    )}
                </div>
            </form>
        </FormProvider>
    );
}
