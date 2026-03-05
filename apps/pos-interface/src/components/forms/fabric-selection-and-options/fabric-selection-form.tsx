"use client";

import { getFabrics } from "@/api/fabrics";
import { getPrices } from "@/api/prices";
import { saveWorkOrderGarments, getOrderDetails } from "@/api/orders";
import { getMeasurementsByCustomerId } from "@/api/measurements";
import { getStyles } from "@/api/styles";
import { getCampaigns } from "@/api/campaigns";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { SignaturePad } from "@/components/forms/signature-pad";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
    Package,
    Sparkles,
    Plus,
    Copy,
    Save,
    Pencil,
    X,
    Printer,
    ArrowRight,
    Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getFabricValue } from "@/lib/utils/fabric-utils";
import { calculateGarmentStylePrice } from "@/lib/utils/style-utils";
import { DataTable } from "./data-table";
import { columns as fabricSelectionColumns } from "./fabric-selection/fabric-selection-columns";
import {
    type GarmentSchema,
    garmentDefaults,
} from "./fabric-selection/garment-form.schema";
import {
    mapFormValuesToGarment,
    mapGarmentToFormValues,
} from "./fabric-selection/garment-form.mapper";
import { columns as styleOptionsColumns } from "./style-options/style-options-columns";
import { FabricLabel } from "./fabric-selection/fabric-print-component";

type FabricFormValues = {
    garments: GarmentSchema[];
    signature: string;
    delivery_date?: string;
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
    homeDelivery?: boolean;
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
    homeDelivery,
    stitchingPrice,
    setStitchingPrice,
    initialCampaigns = [],
}: FabricSelectionFormProps) {
    const queryClient = useQueryClient();
    const [numRowsToAdd, setNumRowsToAdd] = React.useState(0);
    const [selectedCampaigns, setSelectedCampaigns] = React.useState<string[]>(
        [],
    );
    const [isEditing, setIsEditing] = React.useState(true);
    const [isSaved, setIsSaved] = React.useState(false);
    const [selectedMeasurementId, setSelectedMeasurementId] = React.useState<
        string | null
    >(null);
    const [fabricMeter, setFabricMeter] = React.useState<number | null>(null);
    const [qallabi, setQallabi] = React.useState<number | null>(null);

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

    React.useEffect(() => {
        if (!deliveryDate && !isOrderClosed && !isProceedDisabled) {
            const today = new Date();
            setDeliveryDate(today.toISOString());
        }
    }, [deliveryDate, isOrderClosed, isProceedDisabled, setDeliveryDate]);

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

    const { data: _stylesResponse } = useQuery({
        queryKey: ["styles"],
        queryFn: getStyles,
        staleTime: Infinity,
        gcTime: Infinity,
    });

    const {
        fields: garmentFields,
        append: appendGarment,
        remove: removeGarment,
    } = useFieldArray({
        control: form.control,
        name: "garments",
    });

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

        const date = new Date(deliveryDate);
        if (isNaN(date.getTime())) {
            console.error("Invalid delivery date:", deliveryDate);
            return;
        }

        const isoDate = date.toISOString();

        garmentFields.forEach((_, index) => {
            form.setValue(
                `garments.${index}.delivery_date`,
                isoDate,
                {
                    shouldDirty: true,
                    shouldTouch: false,
                    shouldValidate: false,
                },
            );
        });
    }, [deliveryDate, garmentFields.length, form]);

    const { mutate: saveGarmentsMutation, isPending: isSaving } = useMutation({
        mutationFn: async (data: {
            garments: GarmentSchema[];
        }) => {
            if (!orderId) {
                throw new Error(
                    "Please create an order first before saving fabric selections",
                );
            }

            let totalFabricCharge = 0;
            let totalStitchingCharge = 0;
            let totalStyleCharge = 0;

            const garmentsToSave = data.garments.map((garment) => {
                const stitchingSnapshot = garment.style === "design" ? 9 : stitchingPrice;
                const styleSnapshot = calculateGarmentStylePrice(garment, prices || []);
                const fabricSnapshot = garment.fabric_amount || 0;

                totalFabricCharge += fabricSnapshot;
                totalStitchingCharge += stitchingSnapshot;
                totalStyleCharge += styleSnapshot;

                return mapFormValuesToGarment(garment, orderId, {
                    stitching_price_snapshot: stitchingSnapshot,
                    style_price_snapshot: styleSnapshot,
                    fabric_price_snapshot: fabricSnapshot,
                });
            });

            return saveWorkOrderGarments(orderId, garmentsToSave, {
                num_of_fabrics: data.garments.length,
                fabric_charge: totalFabricCharge,
                stitching_charge: totalStitchingCharge,
                style_charge: totalStyleCharge,
                stitching_price: stitchingPrice,
                delivery_date: deliveryDate,
                home_delivery: homeDelivery,
            });
        },
        onSuccess: async (response) => {
            if (response.status === "error") {
                toast.error(`Failed to save garments: ${response.message || "Unknown error"}`);
                return;
            }

            toast.success(`Garments saved successfully!`);

            // Fetch the updated order details to get the new garment IDs
            if (orderId) {
                const detailsRes = await getOrderDetails(orderId, true);
                if (detailsRes.status === "success" && detailsRes.data?.garments) {
                    const updatedGarments = detailsRes.data.garments.map((g: any) => mapGarmentToFormValues(g));
                    form.setValue("garments", updatedGarments);
                }
            }

            setIsSaved(true);
            setIsEditing(false);
            
            // Sync lists
            queryClient.invalidateQueries({ queryKey: ["orders"] });
            queryClient.invalidateQueries({ queryKey: ["dispatchOrders"] });
            if (customerId) {
                queryClient.invalidateQueries({ queryKey: ["customer-orders", customerId] });
            }

            onSubmit?.({
                garments: form.getValues("garments"),
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

    const handleSaveSelections = (data: FabricFormValues) => {
        if (!deliveryDate) {
            toast.error("Please select a delivery date before saving");
            return;
        }

        // Aggregate stock validation before saving
        const usage = new Map<number, number>();
        let stockErrorFound = false;

        data.garments.forEach((g) => {
            if (g.fabric_source === 'IN' && g.fabric_id) {
                usage.set(g.fabric_id, (usage.get(g.fabric_id) || 0) + (g.fabric_length || 0));
            }
        });

        usage.forEach((totalUsed, fabricId) => {
            const fabric = fabrics.find(f => f.id === fabricId);
            if (fabric) {
                const available = parseFloat(fabric.real_stock?.toString() || "0");
                if (totalUsed > available) {
                    stockErrorFound = true;
                    toast.error(`Insufficient stock for ${fabric.name}. Total requested: ${totalUsed.toFixed(2)}m, Available: ${available.toFixed(2)}m`);
                }
            }
        });

        if (stockErrorFound) return;

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

    const { data: measurementQuery } = useQuery({
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
                    const meter = getFabricValue(Number(length), Number(bottom)); 
                    if (meter) {
                        setFabricMeter(meter);
                        setQallabi(meter + 0.25);
                    } else {
                        setFabricMeter(null);
                        setQallabi(null);
                    }
                } else {
                    setFabricMeter(null);
                    setQallabi(null);
                }
            }
        } else {
            setFabricMeter(null);
            setQallabi(null);
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
            measurement_id: latestMeasurement?.id ?? null as any,
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
                id: garment.id, 
                garment_id: garment.garment_id, 
            };
        });

        form.setValue("garments", updatedGarments);
        toast.success("Copied first row's data to all rows");
    };

    // Unified Error Summary Logic
    const errorEntries = Object.entries(form.formState.errors.garments || {}).filter(
        ([key, value]) => /^\d+$/.test(key) && value != null && typeof value === 'object'
    );
    const hasErrors = errorEntries.length > 0 || form.formState.errors.signature;

    return (
        <FormProvider {...form}>
            <form
                onSubmit={form.handleSubmit(handleSaveSelections)}
                className="w-full space-y-6"
            >
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

                <div className="p-0 border border-border rounded-2xl bg-card w-full overflow-hidden shadow-sm space-y-0">
                    {/* NEW COMMAND BAR HEADER */}
                    <div className="bg-muted/30 border-b p-5 space-y-6">
                        <div className="flex flex-wrap items-end gap-6">
                            {/* 1. PIECE MANAGEMENT */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Pieces Count</label>
                                <div className="flex items-center gap-2 bg-background border border-border/60 rounded-xl p-1.5 shadow-xs">
                                    <Input
                                        type="number"
                                        placeholder="Qty"
                                        onChange={(e) => setNumRowsToAdd(parseInt(e.target.value, 10))}
                                        className="w-20 h-9 font-black text-center bg-transparent border-none shadow-none focus-visible:ring-0"
                                        disabled={isFormDisabled}
                                    />
                                    <Button
                                        type="button"
                                        onClick={() => numRowsToAdd > 0 && syncRows(numRowsToAdd, garmentFields, { addRow: addGarmentRow, removeRow: removeGarmentRow })}
                                        disabled={isFormDisabled}
                                        size="sm"
                                        className="h-9 px-4 font-black uppercase tracking-widest text-[9px] gap-2 rounded-lg"
                                    >
                                        <Plus className="size-3.5" /> Sync
                                    </Button>
                                </div>
                            </div>

                            {/* 2. STITCHING PRICE */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Stitching Price</label>
                                <Tabs 
                                    value={stitchingPrice.toString()} 
                                    onValueChange={(val) => setStitchingPrice(parseInt(val))}
                                    className="w-fit"
                                >
                                    <TabsList className="h-12 bg-background border border-border/60 p-1 rounded-xl shadow-xs">
                                        <TabsTrigger value="7" disabled={isFormDisabled} className="h-9 px-5 font-black text-xs rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">7 KWD</TabsTrigger>
                                        <TabsTrigger value="9" disabled={isFormDisabled} className="h-9 px-5 font-black text-xs rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">9 KWD</TabsTrigger>
                                    </TabsList>
                                </Tabs>
                            </div>

                            {/* 3. DELIVERY DATE */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Delivery Date</label>
                                <div className="h-12 w-48 bg-background border border-border/60 rounded-xl shadow-xs overflow-hidden flex flex-col justify-center">
                                    <DatePicker
                                        placeholder={new Date().toISOString()}
                                        value={deliveryDate ? new Date(deliveryDate) : new Date()}
                                        onChange={(value) => value && setDeliveryDate(value.toISOString())}
                                        disabled={isFormDisabled}
                                        className="border-none shadow-none w-full h-full font-bold focus:ring-0 px-4 flex items-center bg-transparent"
                                    />
                                </div>
                            </div>

                            {/* SPACER to push measurement to right */}
                            <div className="flex-1" />

                            {/* 4. MEASUREMENT HELPER (Far Right) */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Measurement Assistant</label>
                                <div className="flex gap-4 h-12 items-center bg-background border border-border/60 rounded-xl px-4 shadow-xs">
                                    <Select onValueChange={setSelectedMeasurementId} value={selectedMeasurementId || ""}>
                                        <SelectTrigger className="w-40 border-none shadow-none font-bold h-9 bg-muted/40 hover:bg-muted/60 transition-colors">
                                            <SelectValue placeholder="Select ID" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {measurements.map((m) => (
                                                <SelectItem key={m.id} value={m.id ?? ""}>{m.measurement_id}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    
                                    <div className="h-6 w-px bg-border/60" />

                                    {selectedMeasurementId && fabricMeter !== null ? (
                                        <div className="flex items-center gap-5 animate-in fade-in slide-in-from-right-2 duration-300">
                                            <div className="flex flex-col">
                                                <span className="text-[8px] font-black text-muted-foreground uppercase leading-none mb-1">Meter</span>
                                                <span className="text-sm font-black text-primary leading-none">{fabricMeter}m</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[8px] font-black text-muted-foreground uppercase leading-none mb-1">Qallabi</span>
                                                <span className="text-sm font-black text-primary leading-none">{qallabi}m</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-tight italic">No calculation</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* CAMPAIGN OFFERS (CHIPS STYLE) */}
                        <div className="flex items-center gap-4 bg-primary/5 rounded-xl p-3 border border-primary/10">
                            <div className="flex items-center gap-2 px-2 border-r border-primary/20 shrink-0">
                                <Sparkles className="size-3.5 text-primary" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-primary">Offers</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {activeCampaigns.length > 0 ? (
                                    activeCampaigns.map((campaign) => {
                                        const isSelected = selectedCampaigns.includes(campaign.id.toString());
                                        return (
                                            <Badge
                                                key={campaign.id}
                                                variant={isSelected ? "default" : "outline"}
                                                className={cn(
                                                    "cursor-pointer px-3 py-1 text-[10px] font-black uppercase tracking-tighter transition-all",
                                                    isSelected ? "bg-primary shadow-md shadow-primary/20" : "bg-white hover:bg-primary/5 hover:border-primary/30"
                                                )}
                                                onClick={() => {
                                                    if (isFormDisabled) return;
                                                    const updated = isSelected 
                                                        ? selectedCampaigns.filter(id => id !== campaign.id.toString())
                                                        : Array.from(new Set([...selectedCampaigns, campaign.id.toString()]));
                                                    setSelectedCampaigns(updated);
                                                    onCampaignsChange(updated);
                                                }}
                                            >
                                                {campaign.name}
                                                {isSelected && <Check className="size-2.5 ml-1.5" />}
                                            </Badge>
                                        );
                                    })
                                ) : (
                                    <span className="text-[10px] font-bold text-muted-foreground italic">No active campaigns available</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="p-6 space-y-6">
                        {/* Unified Error Alert */}
                        {hasErrors && form.formState.isSubmitted && (
                            <Alert
                                id="validation-errors"
                                variant="destructive"
                                className="mb-4 border-2 border-red-500 rounded-2xl bg-red-50"
                            >
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle className="font-black uppercase tracking-widest text-xs">Form Validation Errors</AlertTitle>
                                <AlertDescription>
                                    <ul className="list-disc pl-5 mt-2 space-y-1">
                                        {form.formState.errors.signature && (
                                            <li className="text-sm font-semibold">Signature: {form.formState.errors.signature.message}</li>
                                        )}
                                        {errorEntries.map(([index, error]: [string, any]) => {
                                            const rowNum = parseInt(index) + 1;
                                            const messages = Object.values(error).map((e: any) => e.message).filter(Boolean);
                                            return messages.map((msg, i) => (
                                                <li key={`${index}-${i}`} className="text-sm">Row {rowNum}: {msg}</li>
                                            ));
                                        })}
                                    </ul>
                                </AlertDescription>
                            </Alert>
                        )}

                        <div className="space-y-3">
                            <div className="flex justify-between items-end">
                                <div className="space-y-1">
                                    <h2 className="text-2xl font-black uppercase tracking-tight text-foreground flex items-center gap-2.5">
                                        <div className="p-1.5 bg-primary/10 text-primary rounded-lg">
                                            <Package className="size-4" />
                                        </div>
                                        Garment <span className="text-primary">Selections</span>
                                    </h2>
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-70 ml-9">
                                        Select fabric source, type, and measurements
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={copyGarmentToAll}
                                    disabled={isFormDisabled || garmentFields.length < 2}
                                    className="h-9 px-4 font-black uppercase tracking-widest text-[9px] gap-2 border-primary/20 text-primary hover:bg-primary hover:text-white transition-all shadow-sm"
                                >
                                    <Copy className="size-3.5" />
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
                                    garment_type: currentRowData.garment_type ?? 'final',
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
                            <h2 className="text-2xl font-black uppercase tracking-tight text-foreground flex items-center gap-2.5">
                                <div className="p-1.5 bg-primary/10 text-primary rounded-lg">
                                    <Pencil className="size-4" />
                                </div>
                                Style <span className="text-primary">Options</span>
                            </h2>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-70 ml-9">
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
