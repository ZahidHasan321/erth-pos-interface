"use client";

import { getFabrics } from "@/api/fabrics";
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
    stitchingAdult: number;
    stitchingChild: number;
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
    stitchingAdult,
    stitchingChild,
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

    const { data: stylesResponse } = useQuery({
        queryKey: ["styles"],
        queryFn: getStyles,
        staleTime: Infinity,
        gcTime: Infinity,
    });

    const styles = stylesResponse?.data || [];

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
        const garments = form.getValues("garments");

        garments.forEach((_, index) => {
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

            const hasBrova = data.garments.some(g => g.garment_type === 'brova');

            const garmentsToSave = data.garments.map((garment) => {
                const stitchingSnapshot = stitchingPrice;
                const styleSnapshot = calculateGarmentStylePrice(garment, styles || []);
                const fabricSnapshot = garment.fabric_amount || 0;

                totalFabricCharge += fabricSnapshot;
                totalStitchingCharge += stitchingSnapshot;
                totalStyleCharge += styleSnapshot;

                // Determine initial piece stage if not already set or if it's a new garment
                let pieceStage = garment.piece_stage;
                let location = garment.location;
                let tripNumber = garment.trip_number;

                if (!garment.id) {
                    location = "shop";
                    tripNumber = 1;
                    if (garment.garment_type === "brova") {
                        pieceStage = "waiting_cut";
                    } else {
                        pieceStage = hasBrova ? "waiting_for_acceptance" : "waiting_cut";
                    }
                }

                return mapFormValuesToGarment({
                    ...garment,
                    piece_stage: pieceStage,
                    location: location as any,
                    trip_number: tripNumber
                }, orderId, {
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
            delivery_date: deliveryDate || garmentDefaults.delivery_date,
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
                // Only copy style options from first row
                style_id: firstRow.style_id,
                style: firstRow.style,
                collar_type: firstRow.collar_type,
                collar_button: firstRow.collar_button,
                cuffs_type: firstRow.cuffs_type,
                cuffs_thickness: firstRow.cuffs_thickness,
                front_pocket_type: firstRow.front_pocket_type,
                front_pocket_thickness: firstRow.front_pocket_thickness,
                wallet_pocket: firstRow.wallet_pocket,
                pen_holder: firstRow.pen_holder,
                small_tabaggi: firstRow.small_tabaggi,
                jabzour_1: firstRow.jabzour_1,
                jabzour_2: firstRow.jabzour_2,
                jabzour_thickness: firstRow.jabzour_thickness,
                lines: firstRow.lines,
            };
        });

        form.setValue("garments", updatedGarments);
        form.trigger("garments");
        toast.success("Copied first row's style options to all rows");
    };

    return (
        <FormProvider {...form}>
            <form
                onSubmit={form.handleSubmit(handleSaveSelections)}
                className="w-full space-y-4"
            >
                <div className="flex justify-between items-start mb-2">
                    <div className="space-y-1">
                        <h1 className="text-lg font-bold text-foreground">
                            Fabric Selection & Style Options
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Choose fabrics and customize style options for garments
                        </p>
                    </div>
                </div>

                {!orderId && !isOrderClosed && (
                    <Alert variant="destructive" className="mb-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Order Required</AlertTitle>
                        <AlertDescription>
                            Please complete the Demographics step and create an order before
                            saving fabric selections.
                        </AlertDescription>
                    </Alert>
                )}

                <div className="p-0 border border-border rounded-2xl bg-card w-full overflow-hidden shadow-sm space-y-0">
                    {/* COMMAND BAR HEADER */}
                    <div className="bg-muted/30 border-b px-3 sm:px-4 py-3 space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 items-end">
                            {/* 1. PIECE MANAGEMENT */}
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground ml-0.5">Pieces</label>
                                <div className="flex items-center gap-1.5 bg-background border border-border/60 rounded-lg p-1 shadow-xs">
                                    <Input
                                        type="number"
                                        placeholder="Qty"
                                        onChange={(e) => setNumRowsToAdd(parseInt(e.target.value, 10))}
                                        className="w-14 h-8 font-bold text-center text-sm bg-transparent border-none shadow-none focus-visible:ring-0"
                                        disabled={isFormDisabled}
                                    />
                                    <Button
                                        type="button"
                                        onClick={() => numRowsToAdd > 0 && syncRows(numRowsToAdd, garmentFields, { addRow: addGarmentRow, removeRow: removeGarmentRow })}
                                        disabled={isFormDisabled}
                                        size="sm"
                                        className="h-8 px-3 font-bold uppercase tracking-wide text-xs gap-1.5 rounded-md"
                                    >
                                        <Plus className="size-3" /> Sync
                                    </Button>
                                </div>
                            </div>

                            {/* 2. STITCHING PRICE */}
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground ml-0.5">Stitching</label>
                                <Tabs
                                    value={stitchingPrice.toString()}
                                    onValueChange={(val) => setStitchingPrice(parseFloat(val))}
                                    className="w-fit"
                                >
                                    <TabsList className="h-8 bg-background border border-border/60 p-0.5 rounded-lg shadow-xs">
                                        <TabsTrigger value={stitchingChild.toString()} disabled={isFormDisabled} className="h-7 px-3 font-bold text-xs rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Child</TabsTrigger>
                                        <TabsTrigger value={stitchingAdult.toString()} disabled={isFormDisabled} className="h-7 px-3 font-bold text-xs rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Adult</TabsTrigger>
                                    </TabsList>
                                </Tabs>
                            </div>

                            {/* 3. DELIVERY DATE */}
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground ml-0.5">Delivery</label>
                                <DatePicker
                                    placeholder={new Date().toISOString()}
                                    value={deliveryDate ? new Date(deliveryDate) : new Date()}
                                    onChange={(value) => value && setDeliveryDate(value.toISOString())}
                                    disabled={isFormDisabled}
                                    className="h-8 bg-background border-border/60 rounded-lg shadow-xs font-bold text-xs"
                                />
                            </div>

                            {/* 4. MEASUREMENT HELPER */}
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground ml-0.5">Measurement</label>
                                <div className="flex gap-2 h-8 items-center bg-background border border-border/60 rounded-lg px-2 shadow-xs">
                                    <Select onValueChange={setSelectedMeasurementId} value={selectedMeasurementId || ""}>
                                        <SelectTrigger className="w-24 sm:w-32 border-none shadow-none font-bold h-7 text-xs bg-muted/40 hover:bg-muted/60 transition-colors rounded-md px-2">
                                            <SelectValue placeholder="Select" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {measurements.map((m) => (
                                                <SelectItem key={m.id} value={m.id ?? ""} className="text-xs">{m.measurement_id}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {selectedMeasurementId && fabricMeter !== null ? (
                                        <div className="flex items-center gap-2 text-xs animate-in fade-in duration-200">
                                            <span className="font-bold text-primary tabular-nums">{fabricMeter}m</span>
                                            <span className="text-muted-foreground/40">/</span>
                                            <span className="font-bold text-primary tabular-nums">{qallabi}m</span>
                                        </div>
                                    ) : (
                                        <span className="text-[10px] font-bold text-muted-foreground/40 italic hidden sm:inline">No calc</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* CAMPAIGN OFFERS */}
                        <div className="flex items-center gap-3 bg-primary/5 rounded-lg p-2 border border-primary/10">
                            <div className="flex items-center gap-1.5 px-1.5 border-r border-primary/20 shrink-0">
                                <Sparkles className="size-3 text-primary" />
                                <span className="text-[10px] font-bold uppercase tracking-wide text-primary">Offers</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {activeCampaigns.length > 0 ? (
                                    activeCampaigns.map((campaign) => {
                                        const isSelected = selectedCampaigns.includes(campaign.id.toString());
                                        return (
                                            <Badge
                                                key={campaign.id}
                                                variant={isSelected ? "default" : "outline"}
                                                className={cn(
                                                    "cursor-pointer px-2 py-0.5 text-[11px] font-bold transition-all",
                                                    isSelected ? "bg-primary shadow-sm shadow-primary/20" : "bg-white hover:bg-primary/5 hover:border-primary/30"
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
                                                {isSelected && <Check className="size-2.5 ml-1" />}
                                            </Badge>
                                        );
                                    })
                                ) : (
                                    <span className="text-[10px] font-bold text-muted-foreground italic">No active campaigns</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="p-4 space-y-3">
                        <div className="space-y-3">
                            <div className="flex justify-between items-end">
                                <div className="space-y-1">
                                    <h2 className="text-base font-semibold text-foreground flex items-center gap-2.5">
                                        <div className="p-1.5 bg-primary/10 text-primary rounded-lg">
                                            <Package className="size-4" />
                                        </div>
                                        Garment <span className="text-primary">Selections</span>
                                    </h2>
                                    <p className="text-xs font-medium text-muted-foreground ml-9">
                                        Select fabric source, type, and measurements
                                    </p>
                                </div>
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

                        <div className="flex justify-end pt-3">
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
                                        customerId: customerId || "N/A",
                                        customerName: customerName || "N/A",
                                        customerMobile: customerMobile || "N/A",
                                        garmentId: currentRowData.garment_id || "N/A",
                                        fabricSource: currentRowData.fabric_source || "",
                                        fabricId: currentRowData.fabric_id ?? "",
                                        fabricLength: currentRowData.fabric_length ?? 0,
                                        measurementId: measurementDisplay || "N/A",
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

                        <div className="flex justify-between items-end pt-3">
                            <div className="space-y-1">
                                <h2 className="text-base font-semibold text-foreground flex items-center gap-2.5">
                                    <div className="p-1.5 bg-primary/10 text-primary rounded-lg">
                                        <Pencil className="size-4" />
                                    </div>
                                    Style <span className="text-primary">Options</span>
                                </h2>
                                <p className="text-xs font-medium text-muted-foreground ml-9">
                                    Customize collar, pockets, buttons, and other style details
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={copyGarmentToAll}
                                disabled={isFormDisabled || garmentFields.length < 2}
                                className="h-9 px-4 font-semibold uppercase tracking-wide text-xs gap-2 border-primary/20 text-primary hover:bg-primary hover:text-white transition-all shadow-sm"
                            >
                                <Copy className="size-3.5" />
                                Copy First Row
                            </Button>
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
                            styles={styles}
                            stitchingPrice={stitchingPrice}
                        />

                        <div className="flex items-end justify-between gap-4 pt-3">
                            <div className="space-y-2">
                                <h3 className="text-base font-semibold text-foreground">
                                    Customer Signature
                                    <span className="text-destructive"> *</span>
                                </h3>
                                <Controller
                                    name="signature"
                                    control={form.control}
                                    render={({ field, fieldState }) => (
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-3">
                                                {field.value ? (
                                                    <>
                                                        <div className="border rounded-lg bg-white/70 p-1">
                                                            <img
                                                                src={field.value}
                                                                alt="Customer signature"
                                                                className="h-10 w-auto object-contain"
                                                            />
                                                        </div>
                                                        {!isFormDisabled && (
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => field.onChange("")}
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </Button>
                                                        )}
                                                    </>
                                                ) : !isFormDisabled ? (
                                                    <SignaturePad
                                                        onSave={(signature) => {
                                                            field.onChange(signature);
                                                            toast.success("Signature saved");
                                                        }}
                                                    />
                                                ) : (
                                                    <span className="text-sm text-muted-foreground">No signature</span>
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

                            <div className="flex gap-4 shrink-0">
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
                        </div>
                    </div>
                </div>
            </form>
        </FormProvider>
    );
}
