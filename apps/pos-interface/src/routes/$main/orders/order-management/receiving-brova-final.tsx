import { useState, useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Ruler,
  Camera,
  Video,
  Package,
  Save,
  Check,
  X,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";

// UI Components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { OrderSearchForm } from "@/components/order-management/order-search-form";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

// API and Types
import { getOrderDetails, getOrdersList } from "@/api/ordersApi";
import { searchCustomerByPhone } from "@/api/customers";
import { getMeasurementById } from "@/api/measurements";
import type { Measurement } from "@/types/measurement";
import type { OrderDetails } from "@/api/ordersApi";

// Assets & Constants
import {
  collarTypes,
  collarButtons,
  jabzourTypes,
  topPocketTypes,
  cuffTypes,
  type BaseOption
} from "@/components/forms/fabric-selection-and-options/constants";

// Route Definition
export const Route = createFileRoute(
  "/$main/orders/order-management/receiving-brova-final"
)({
  component: ReceivingInterface,
  head: () => ({
    meta: [{ title: "Workshop QC & Receive" }],
  }),
});

// --- Constants & Config ---

const MEASUREMENT_ROWS = [
  { type: "Collar", subType: "Width", key: "CollarWidth" },
  { type: "Collar", subType: "Height", key: "CollarHeight" },
  { type: "Length", subType: "Front", key: "LengthFront" },
  { type: "Length", subType: "Back", key: "LengthBack" },
  { type: "Top Pocket", subType: "Length", key: "TopPocketLength" },
  { type: "Top Pocket", subType: "Width", key: "TopPocketWidth" },
  { type: "Top Pocket", subType: "Distance", key: "TopPocketDistance" },
  { type: "Side Pocket", subType: "Length", key: "SidePocketLength" },
  { type: "Side Pocket", subType: "Width", key: "SidePocketWidth" },
  { type: "Side Pocket", subType: "Distance", key: "SidePocketDistance" },
  { type: "Side Pocket", subType: "Opening", key: "SidePocketOpening" },
  { type: "Waist", subType: "Front", key: "WaistFront" },
  { type: "Waist", subType: "Back", key: "WaistBack" },
  { type: "Arm Hole", subType: "Arm Hole", key: "Armhole" },
  { type: "Chest", subType: "Upper", key: "ChestUpper" },
  { type: "Chest", subType: "Full", key: "ChestFull" },
  { type: "Chest", subType: "Half", key: "ChestFront" },
  { type: "Elbow", subType: "Elbow", key: "Elbow" },
  { type: "Sleeves", subType: "Sleeves", key: "SleeveLength" },
  { type: "Bottom", subType: "Bottom", key: "Bottom" },
] as const;

const QC_STATUS_OPTIONS = [
  { value: "no-diff", label: "No Differences", color: "text-green-600" },
  { value: "minor-diff", label: "Minor Differences", color: "text-yellow-600" },
  { value: "major-diff", label: "Major Differences", color: "text-orange-600" },
  { value: "unacceptable", label: "Unacceptable", color: "text-red-600" },
];

// --- Types ---

interface ShopMeasurements {
  [key: string]: number | "";
}

// --- Main Component ---

function ReceivingInterface() {
  // Search State
  const [searchOrderId, setSearchOrderId] = useState<number | undefined>(undefined);
  const [searchFatoura, setSearchFatoura] = useState<number | undefined>(undefined);
  const [searchMobile, setSearchMobile] = useState<number | undefined>(undefined);
  const [isSearching, setIsSearching] = useState(false);

  // Active Data State
  const [activeOrderDetails, setActiveOrderDetails] = useState<OrderDetails | null>(null);
  const [selectedGarmentId, setSelectedGarmentId] = useState<string | null>(null);
  
  // QC State
  const [shopMeasurements, setShopMeasurements] = useState<ShopMeasurements>({});
  const [qcStatus, setQcStatus] = useState<string>("no-diff");
  const [optionChecks, setOptionChecks] = useState<Record<string, boolean>>({});
  const [receivingAction, setReceivingAction] = useState<"accept" | "reject" | "">("");
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [evidence, setEvidence] = useState<Record<string, { type: "photo" | "video", url: string } | null>>({});

  // 1. Garment Selection Effect
  useEffect(() => {
    if (activeOrderDetails?.garments?.length) {
      // Automatically select the first garment
      const firstGarment = activeOrderDetails.garments[0];
      setSelectedGarmentId(firstGarment.id);
      
      // Reset QC state for new order
      setShopMeasurements({});
      setOptionChecks({});
      setEvidence({});
      setQcStatus("no-diff");
      setReceivingAction("");
    }
  }, [activeOrderDetails]);

  const activeGarment = useMemo(() => 
    activeOrderDetails?.garments?.find(g => g.id === selectedGarmentId),
    [activeOrderDetails, selectedGarmentId]
  );

  // 2. Measurement Query
  const measurementId = activeGarment?.fields.MeasurementId?.[0];
  const { data: measurementData, isLoading: isMeasurementLoading } = useQuery({
    queryKey: ["measurement", measurementId],
    queryFn: () => getMeasurementById(measurementId!),
    enabled: !!measurementId,
  });

  const measurement = measurementData?.data;

  // --- Search Logic ---

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSearching(true);
    setActiveOrderDetails(null);

    try {
      let orderDetails: OrderDetails | null = null;

      if (searchOrderId) {
        // Search by Order ID (exact)
        // Note: The API for getOrderDetails expects string "A-1001" usually, 
        // but here input is number. Assuming standard format or passing as is if API handles it.
        // If OrderID is strictly formatted (e.g. "ORD-123"), we might need prefix.
        // Assuming direct number match for now or simple string conversion.
        const res = await getOrderDetails(searchOrderId.toString());
        if (res.data) orderDetails = res.data;
      } 
      else if (searchFatoura) {
        // Search by Fatoura (filter list)
        const res = await getOrdersList({ Fatoura: searchFatoura });
        if (res.data && res.data.length > 0) {
           orderDetails = res.data[0]; // Take first match
        }
      } 
      else if (searchMobile) {
        // Search by Mobile -> Get Customer -> Get Orders
        const customerRes = await searchCustomerByPhone(searchMobile.toString());
        if (customerRes.data && customerRes.data.length > 0) {
            const customer = customerRes.data[0];
            if (customer.fields.id) {
                // Fetch pending orders for this customer
                // Using generic search because we need linked orders
                // But getOrdersList doesn't filter by CustomerID directly exposed in types?
                // It does accept [key: string].
                const ordersRes = await getOrdersList({ CustomerID: customer.fields.id });
                if (ordersRes.data && ordersRes.data.length > 0) {
                    // Sort by date or pick most relevant. Taking first for now.
                    orderDetails = ordersRes.data[0];
                }
            }
        }
      }

      if (orderDetails) {
        setActiveOrderDetails(orderDetails);
        toast.success("Order Found", { description: `Loaded Order #${orderDetails.order.fields.Fatoura}` });
      } else {
        toast.error("Order Not Found", { description: "No active orders matching your criteria." });
      }
    } catch (error) {
      console.error(error);
      toast.error("Search Failed", { description: "An error occurred while searching." });
    } finally {
      setIsSearching(false);
    }
  };

  const handleClearSearch = () => {
    setSearchOrderId(undefined);
    setSearchFatoura(undefined);
    setSearchMobile(undefined);
    setActiveOrderDetails(null);
  };

  // --- Handlers ---

  const handleMeasurementChange = (key: string, value: string) => {
    const numValue = value === "" ? "" : parseFloat(value);
    setShopMeasurements(prev => ({
      ...prev,
      [key]: numValue
    }));
  };

  const handleCheck = (key: string, checked: boolean) => {
    setOptionChecks(prev => ({ ...prev, [key]: checked }));
  };

  const handleCapture = (optionId: string, type: "photo" | "video", file: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setEvidence(prev => ({ ...prev, [optionId]: { type, url } }));
    toast.success(`${type === 'photo' ? 'Photo' : 'Video'} captured`);
  };

  const onConfirmClick = () => {
    if (!receivingAction) {
        toast.error("Please select an action (Accept or Reject)");
        return;
    }
    setIsConfirmDialogOpen(true);
  };

  const handleSave = () => {
    setIsConfirmDialogOpen(false);
    toast.success(`Order ${receivingAction === 'accept' ? 'Accepted' : 'Rejected'}`, {
        description: `Garment ${activeGarment?.fields.GarmentId} processed with status: ${QC_STATUS_OPTIONS.find(o => o.value === qcStatus)?.label}`
    });
  };

  // --- Helpers ---

  const getDifference = (targetVal: number | undefined, shopVal: number | "" | undefined) => {
    if (targetVal === undefined || shopVal === "" || shopVal === undefined) return null;
    return Number((shopVal - targetVal).toFixed(2));
  };

  const getDiffStatus = (diff: number | null) => {
    if (diff === null) return "neutral";
    if (Math.abs(diff) === 0) return "success";
    if (Math.abs(diff) <= 0.5) return "warning";
    return "error";
  };

  // Option Helper
  const findOptionImage = (list: BaseOption[], val: string | undefined) => {
    if (!val) return null;
    return list.find(o => o.value === val || o.displayText === val)?.image;
  };

  // Build the specific rows for "Collar, Collar Button, Tabbagi, Jabzour, Front Pocket, Cuff"
  const optionRows = useMemo(() => {
    if (!activeGarment) return [];
    const f = activeGarment.fields;
    
    // Define the specific structure
    return [
      {
        id: "collar",
        label: "Collar",
        mainValue: f.CollarType,
        mainImage: findOptionImage(collarTypes, f.CollarType),
        hashwaLabel: null, // No hashwa for collar mentioned in prompt context or type?
        hashwaValue: null
      },
      {
        id: "collarBtn",
        label: "Collar Button",
        mainValue: f.CollarButton,
        mainImage: findOptionImage(collarButtons, f.CollarButton),
        hashwaLabel: null,
        hashwaValue: null,
        extraCheckLabel: f.SmallTabaggi ? "Small Tabbagi" : null,
        extraCheckValue: f.SmallTabaggi
      },
      {
        id: "jabzour1",
        label: "Jabzour 1",
        mainValue: f.Jabzour1,
        mainImage: findOptionImage(jabzourTypes, f.Jabzour1),
        hashwaLabel: "Hashwa",
        hashwaValue: f.JabzourThickness // Shared thickness
      },
      {
        id: "jabzour2",
        label: "Jabzour 2",
        mainValue: f.Jabzour2,
        mainImage: findOptionImage(jabzourTypes, f.Jabzour2),
        hashwaLabel: "Hashwa",
        hashwaValue: f.JabzourThickness // Shared thickness
      },
      {
        id: "frontPocket",
        label: "Front Pocket",
        mainValue: f.FrontPocketType,
        mainImage: findOptionImage(topPocketTypes, f.FrontPocketType),
        hashwaLabel: "Hashwa",
        hashwaValue: f.FrontPocketThickness
      },
      {
        id: "cuff",
        label: "Cuff",
        mainValue: f.CuffsType,
        mainImage: findOptionImage(cuffTypes, f.CuffsType),
        hashwaLabel: "Hashwa",
        hashwaValue: f.CuffsThickness
      }
    ].filter(r => r.mainValue && r.mainValue !== "None"); // Only show active options
  }, [activeGarment]);


  return (
    <div className="container mx-auto p-6 max-w-[1600px] space-y-6 pb-24">
      
      {/* 1. Header & Search */}
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Workshop Receiving & QC</h1>
            <p className="text-muted-foreground">Receive finished garments, verify measurements, and check style options.</p>
        </div>

        <OrderSearchForm 
            orderId={searchOrderId}
            fatoura={searchFatoura}
            customerMobile={searchMobile}
            onOrderIdChange={setSearchOrderId}
            onFatouraChange={setSearchFatoura}
            onCustomerMobileChange={setSearchMobile}
            onSubmit={handleSearch}
            onClear={handleClearSearch}
            isLoading={isSearching}
        />
      </div>

      {activeOrderDetails && (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
        >
          {/* 2. Order Context Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
             <Card className="md:col-span-1 bg-muted/40 border-muted">
                <CardHeader className="pb-2 pt-4 px-4">
                    <CardDescription className="text-xs uppercase tracking-wider font-semibold">Customer</CardDescription>
                    <CardTitle className="text-lg">{activeOrderDetails.customer?.fields.Name || "Guest"}</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                    <div className="text-sm text-muted-foreground font-mono">{activeOrderDetails.customer?.fields.Phone}</div>
                </CardContent>
             </Card>
             <Card className="md:col-span-3 border-muted">
                <CardContent className="p-4 flex flex-wrap items-center gap-8 h-full">
                    <div>
                        <div className="text-xs text-muted-foreground uppercase font-bold tracking-wide">Order ID</div>
                        <div className="text-2xl font-mono font-bold text-primary">#{activeOrderDetails.order.fields.Fatoura}</div>
                    </div>
                    <Separator orientation="vertical" className="h-10 hidden md:block" />
                    <div>
                        <div className="text-xs text-muted-foreground uppercase font-bold tracking-wide">Total Items</div>
                        <div className="text-xl font-semibold">{activeOrderDetails.garments.length} Garments</div>
                    </div>
                    <Separator orientation="vertical" className="h-10 hidden md:block" />
                    <div>
                        <div className="text-xs text-muted-foreground uppercase font-bold tracking-wide">Delivery Date</div>
                        <div className="text-xl font-semibold">{activeOrderDetails.order.fields.DeliveryDate}</div>
                    </div>
                </CardContent>
             </Card>
          </div>

          {/* 3. Garment Tabs */}
          <Tabs value={selectedGarmentId || ""} onValueChange={setSelectedGarmentId} className="w-full">
            <div className="flex items-center justify-between mb-4 overflow-x-auto pb-2">
                <TabsList className="h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
                {activeOrderDetails.garments.map((garment) => (
                    <TabsTrigger 
                        key={garment.id} 
                        value={garment.id}
                        className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground border border-input bg-background px-4 py-2 h-14 min-w-[120px]"
                    >
                        <div className="text-left w-full">
                            <div className="text-xs opacity-70">Garment</div>
                            <div className="font-mono font-bold truncate">{garment.fields.GarmentId}</div>
                        </div>
                    </TabsTrigger>
                ))}
                </TabsList>
            </div>

            <TabsContent value={selectedGarmentId || ""} className="mt-0 space-y-8">
               
                 {/* 1. MEASUREMENTS TABLE */}
                <Card className="border-border shadow-sm overflow-hidden">
                    <CardHeader className="bg-muted/30 border-b pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Ruler className="w-5 h-5 text-primary" />
                                Measurement QC
                            </CardTitle>
                            <Badge variant="outline" className="bg-background">
                                {isMeasurementLoading ? "Loading Specs..." : "Specs Loaded"}
                            </Badge>
                        </div>
                    </CardHeader>
                    
                    <div className="relative overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-muted/50 sticky top-0 z-10">
                                <TableRow>
                                    <TableHead className="w-[12%]">Type</TableHead>
                                    <TableHead className="w-[12%]">Sub Type</TableHead>
                                    <TableHead className="text-center bg-muted/30 w-[12%]">Order (cm)</TableHead>
                                    <TableHead className="text-center bg-muted/30 w-[12%]">WS QC (cm)</TableHead>
                                    <TableHead className="text-center w-[15%] bg-blue-50/20 dark:bg-blue-900/20">Shop (cm)</TableHead>
                                    <TableHead className="text-center w-[15%]">Diff w/ Order</TableHead>
                                    <TableHead className="text-center w-[15%]">Diff w/ WS QC</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {MEASUREMENT_ROWS.map((row) => {
                                    // Dynamic key access for measurement
                                    const orderValue = measurement?.fields[row.key as keyof Measurement["fields"]] as number | undefined;
                                    const shopValue = shopMeasurements[row.key];
                                    
                                    // Diff Calcs
                                    const diffOrder = getDifference(orderValue, shopValue);
                                    const statusOrder = getDiffStatus(diffOrder);
                                    
                                    const isMissing = orderValue === undefined || orderValue === 0;

                                    if (isMissing) return null; // Skip empty rows

                                    return (
                                        <TableRow key={row.key} className="hover:bg-muted/30">
                                            <TableCell className="font-medium">{row.type}</TableCell>
                                            <TableCell className="text-muted-foreground">{row.subType}</TableCell>
                                            <TableCell className="text-center font-mono font-medium bg-muted/30">
                                                {orderValue || "-"}
                                            </TableCell>
                                            <TableCell className="text-center font-mono text-muted-foreground bg-muted/30">
                                                -
                                            </TableCell>
                                            <TableCell className="p-1 bg-blue-50/10 dark:bg-blue-900/10">
                                                <Input 
                                                    type="number" 
                                                    className={cn(
                                                        "h-9 w-24 mx-auto text-center font-mono",
                                                        statusOrder === 'error' && "border-red-300 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800",
                                                        statusOrder === 'warning' && "border-yellow-300 bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800",
                                                        statusOrder === 'success' && "border-green-300 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
                                                    )}
                                                    placeholder="0"
                                                    value={shopValue ?? ""}
                                                    onChange={(e) => handleMeasurementChange(row.key, e.target.value)}
                                                />
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {diffOrder !== null ? (
                                                    <Badge variant="secondary" className={cn(
                                                        statusOrder === 'success' && "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
                                                        statusOrder === 'warning' && "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
                                                        statusOrder === 'error' && "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                                    )}>
                                                        {diffOrder > 0 ? `+${diffOrder}` : diffOrder} cm
                                                        {statusOrder === 'success' && <Check className="w-3 h-3 ml-1" />}
                                                        {statusOrder === 'error' && <X className="w-3 h-3 ml-1" />}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-muted-foreground">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <span className="text-muted-foreground">-</span>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </Card>

                {/* 2. VISUAL OPTIONS & HASHWA */}
                <Card className="border-border">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Package className="w-4 h-4" />
                            Style & Hashwa Verification
                        </CardTitle>
                        <CardDescription>Verify style options, thickness (hashwa), and capture evidence.</CardDescription>
                    </CardHeader>
                    <CardContent>
                       <div className="space-y-4">
                            {/* Header Row for Desktop */}
                            <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 bg-muted/50 rounded-md text-xs font-semibold uppercase text-muted-foreground">
                                <div className="col-span-3">Option</div>
                                <div className="col-span-3">Visual Reference</div>
                                <div className="col-span-3">Verification</div>
                                <div className="col-span-3">Evidence</div>
                            </div>

                            {optionRows.map((opt) => (
                                <div key={opt.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 rounded-lg border bg-card items-start md:items-center">
                                    
                                    {/* 1. Option Name */}
                                    <div className="col-span-3">
                                        <div className="font-semibold text-lg md:text-base">{opt.label}</div>
                                        <div className="text-sm text-muted-foreground font-medium">{opt.mainValue}</div>
                                    </div>

                                    {/* 2. Visual */}
                                    <div className="col-span-3">
                                        {opt.mainImage ? (
                                            <div className="h-16 w-16 bg-white rounded-md border p-1 shadow-sm">
                                                <img 
                                                    src={opt.mainImage} 
                                                    alt={opt.label} 
                                                    className="w-full h-full object-contain" 
                                                />
                                            </div>
                                        ) : (
                                            <div className="h-16 w-16 bg-muted/20 rounded-md border border-dashed flex items-center justify-center text-muted-foreground text-xs">
                                                No Image
                                            </div>
                                        )}
                                    </div>

                                    {/* 3. Verification Checkboxes */}
                                    <div className="col-span-3 space-y-3">
                                        {/* Main Option Check */}
                                        <div className="flex items-center space-x-2">
                                            <Checkbox 
                                                id={`check-${opt.id}-main`}
                                                checked={optionChecks[`${opt.id}-main`] || false}
                                                onCheckedChange={(c) => handleCheck(`${opt.id}-main`, c as boolean)}
                                            />
                                            <Label htmlFor={`check-${opt.id}-main`} className="cursor-pointer">
                                                Check {opt.label}
                                            </Label>
                                        </div>

                                        {/* Extra Check (e.g. Tabbagi for Collar Button) */}
                                        {/* @ts-ignore - extraCheckValue might not be in all objects in the mapped array type yet, ignoring strict TS for quick fix or need interface update */}
                                        {opt.extraCheckValue && (
                                            <div className="flex items-center space-x-2 pl-4 border-l-2 border-muted">
                                                <Checkbox 
                                                    id={`check-${opt.id}-extra`}
                                                    checked={optionChecks[`${opt.id}-extra`] || false}
                                                    onCheckedChange={(c) => handleCheck(`${opt.id}-extra`, c as boolean)}
                                                />
                                                <div className="flex flex-col">
                                                    <Label htmlFor={`check-${opt.id}-extra`} className="cursor-pointer">
                                                        Check {opt.extraCheckLabel}
                                                    </Label>
                                                </div>
                                            </div>
                                        )}

                                        {/* Hashwa Check (if exists) */}
                                        {opt.hashwaValue && (
                                            <div className="flex items-center gap-3 p-2 rounded-md border border-dashed bg-muted/20">
                                                <Checkbox 
                                                    id={`check-${opt.id}-hashwa`}
                                                    checked={optionChecks[`${opt.id}-hashwa`] || false}
                                                    onCheckedChange={(c) => handleCheck(`${opt.id}-hashwa`, c as boolean)}
                                                />
                                                <div className="flex items-center gap-2">
                                                    <Label htmlFor={`check-${opt.id}-hashwa`} className="cursor-pointer text-sm font-medium">
                                                        Hashwa:
                                                    </Label>
                                                    <Badge 
                                                        variant="outline" 
                                                        className={cn(
                                                            "font-mono text-xs",
                                                            opt.hashwaValue === "NO HASHWA" 
                                                                ? "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
                                                                : "bg-background"
                                                        )}
                                                    >
                                                        {opt.hashwaValue}
                                                    </Badge>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* 4. Attachments */}
                                    <div className="col-span-3 flex md:flex-col gap-2">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            id={`file-photo-${opt.id}`}
                                            onChange={(e) => handleCapture(opt.id, 'photo', e.target.files?.[0] || null)}
                                        />
                                        <input
                                            type="file"
                                            accept="video/*"
                                            className="hidden"
                                            id={`file-video-${opt.id}`}
                                            onChange={(e) => handleCapture(opt.id, 'video', e.target.files?.[0] || null)}
                                        />
                                        
                                        {evidence[opt.id] ? (
                                            <div className="relative group w-full h-20 rounded-md overflow-hidden border">
                                                {evidence[opt.id]?.type === 'photo' ? (
                                                    <img src={evidence[opt.id]?.url} alt="Captured" className="w-full h-full object-cover" />
                                                ) : (
                                                    <video src={evidence[opt.id]?.url} className="w-full h-full object-cover" />
                                                )}
                                                <button 
                                                    onClick={() => setEvidence(prev => { const n = {...prev}; delete n[opt.id]; return n; })}
                                                    className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    className="w-full justify-start text-xs h-8"
                                                    onClick={() => document.getElementById(`file-photo-${opt.id}`)?.click()}
                                                >
                                                    <Camera className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                                                    Photo
                                                </Button>
                                                <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    className="w-full justify-start text-xs h-8"
                                                    onClick={() => document.getElementById(`file-video-${opt.id}`)?.click()}
                                                >
                                                    <Video className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                                                    Video
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                       </div>
                    </CardContent>
                </Card>

                {/* 3. FINAL ACTIONS */}
                <Card className="border-border shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-xl">Finalize QC & Receiving</CardTitle>
                        <CardDescription>Review final status and submit</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* QC Classification */}
                            <div className="space-y-3">
                                <Label>QC Status Classification</Label>
                                <Select value={qcStatus} onValueChange={setQcStatus}>
                                    <SelectTrigger className="h-12 text-base">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {QC_STATUS_OPTIONS.map(opt => (
                                            <SelectItem key={opt.value} value={opt.value} className="cursor-pointer py-2">
                                                <span className={cn("font-medium", opt.color)}>{opt.label}</span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Receiving Action */}
                            <div className="space-y-3">
                                <Label>Receiving Decision</Label>
                                <RadioGroup 
                                    value={receivingAction} 
                                    onValueChange={(val) => setReceivingAction(val as "accept" | "reject")}
                                    className="grid grid-cols-2 gap-4"
                                >
                                    <div>
                                        <RadioGroupItem value="accept" id="action-accept" className="peer sr-only" />
                                        <Label
                                            htmlFor="action-accept"
                                            className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer transition-all"
                                        >
                                            <ThumbsUp className="mb-2 h-6 w-6 text-muted-foreground peer-data-[state=checked]:text-primary" />
                                            Accept
                                        </Label>
                                    </div>
                                    <div>
                                        <RadioGroupItem value="reject" id="action-reject" className="peer sr-only" />
                                        <Label
                                            htmlFor="action-reject"
                                            className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-destructive peer-data-[state=checked]:bg-destructive/5 cursor-pointer transition-all"
                                        >
                                            <ThumbsDown className="mb-2 h-6 w-6 text-muted-foreground peer-data-[state=checked]:text-destructive" />
                                            Reject
                                        </Label>
                                    </div>
                                </RadioGroup>
                            </div>
                        </div>
                        
                        <Separator />
                        
                        <div className="flex justify-end pt-2">
                            <Button 
                                onClick={onConfirmClick} 
                                disabled={!receivingAction}
                                className="w-full md:w-auto min-w-[150px]"
                            >
                                <Save className="w-4 h-4 mr-2" />
                                Confirm
                            </Button>
                        </div>

                    </CardContent>
                </Card>

                <ConfirmationDialog
                    isOpen={isConfirmDialogOpen}
                    onClose={() => setIsConfirmDialogOpen(false)}
                    onConfirm={handleSave}
                    title={receivingAction === 'accept' ? "Confirm Acceptance" : "Confirm Rejection"}
                    description={`Are you sure you want to ${receivingAction} this order? This action will update the system status.`}
                    confirmText={receivingAction === 'accept' ? "Yes, Accept" : "Yes, Reject"}
                    cancelText="Cancel"
                />

            </TabsContent>
          </Tabs>

        </motion.div>
      )}

      {/* Empty State */}
      {!activeOrderDetails && !isSearching && (
        <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
            <Package className="w-16 h-16 mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold text-foreground">Ready to Receive</h3>
            <p className="text-muted-foreground">Search for an order using ID, Fatoura, or Customer Mobile to begin.</p>
        </div>
      )}
    </div>
  );
}
