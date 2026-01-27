"use client";

import { useState, useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import {
  Ruler,
  Camera,
  Package,
  Save,
  Check,
  X,
  ThumbsUp,
  ThumbsDown,
  Hash,
  User,

  Clock,
  RefreshCw,
  MessageSquare
} from "lucide-react";

// UI Components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DirectLookupCard } from "@/components/order-management/order-search-form";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SearchCustomer } from "@/components/forms/customer-demographics/search-customer";
import { ErrorBoundary } from "@/components/global/error-boundary";

// API and Types
import { getOrderById, getOrderByInvoice, getPendingOrdersByCustomer } from "@/api/orders";
import { getMeasurementById } from "@/api/measurements";
import type { Measurement, Order, Garment, Customer } from "@repo/database";

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
  "/$main/orders/order-management/final-feedback"
)({
  component: FinalFeedbackInterface,
  head: () => ({
    meta: [{ title: "Final Feedback" }],
  }),
});

// --- Constants & Config ---

const MEASUREMENT_ROWS = [
  { type: "Collar", subType: "Width", key: "collar_width" },
  { type: "Collar", subType: "Height", key: "collar_height" },
  { type: "Length", subType: "Front", key: "length_front" },
  { type: "Length", subType: "Back", key: "length_back" },
  { type: "Top Pocket", subType: "Length", key: "top_pocket_length" },
  { type: "Top Pocket", subType: "Width", key: "top_pocket_width" },
  { type: "Top Pocket", subType: "Distance", key: "top_pocket_distance" },
  { type: "Side Pocket", subType: "Length", key: "side_pocket_length" },
  { type: "Side Pocket", subType: "Width", key: "side_pocket_width" },
  { type: "Side Pocket", subType: "Distance", key: "side_pocket_distance" },
  { type: "Side Pocket", subType: "Opening", key: "side_pocket_opening" },
  { type: "Waist", subType: "Front", key: "waist_front" },
  { type: "Waist", subType: "Back", key: "waist_back" },
  { type: "Arm Hole", subType: "Arm Hole", key: "armhole" },
  { type: "Chest", subType: "Upper", key: "chest_upper" },
  { type: "Chest", subType: "Full", key: "chest_full" },
  { type: "Chest", subType: "Half", key: "chest_front" },
  { type: "Elbow", subType: "Elbow", key: "elbow" },
  { type: "Sleeves", subType: "Sleeves", key: "sleeve_length" },
  { type: "Bottom", subType: "Bottom", key: "bottom" },
] as const;

const FINAL_FEEDBACK_STATUS_OPTIONS = [
  { value: "satisfied", label: "Fully Satisfied", color: "text-green-600" },
  { value: "adjustment", label: "Post-Delivery Adjustment", color: "text-yellow-600" },
  { value: "repair", label: "Minor Repair Needed", color: "text-orange-600" },
  { value: "complaint", label: "Quality Complaint", color: "text-red-600" },
];

// --- Types ---

interface ShopMeasurements {
  [key: string]: number | "";
}

interface OrderWithDetails extends Order {
    customer: Customer;
    garments: Garment[];
}

// --- Main Component ---

function FinalFeedbackInterface() {
  // Search State
  const [orderIdSearch, setOrderIdSearch] = useState<number | undefined>(undefined);
  const [fatouraSearch, setFatouraSearch] = useState<number | undefined>(undefined);
  const [isSearchingId, setIsSearchingId] = useState(false);
  const [isSearchingFatoura, setIsSearchingFatoura] = useState(false);
  const [, setIsSearchingCustomer] = useState(false);
  const [idError, setIdError] = useState<string | undefined>();
  const [fatouraError, setFatouraError] = useState<string | undefined>();

  // Active Data State
  const [activeOrder, setActiveOrder] = useState<OrderWithDetails | null>(null);
  const [selectedGarmentId, setSelectedGarmentId] = useState<string | null>(null);
  
  // feedback State
  const [shopMeasurements, setShopMeasurements] = useState<ShopMeasurements>({});
  const [measurementNotes, setMeasurementNotes] = useState<Record<string, string>>({});
  const [optionNotes, setOptionNotes] = useState<Record<string, string>>({});
  const [feedbackStatus, setFeedbackStatus] = useState<string>("satisfied");
  const [optionChecks, setOptionChecks] = useState<Record<string, boolean>>({});
  const [receivingAction, setReceivingAction] = useState<"accept" | "reject" | "">("");
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [evidence, setEvidence] = useState<Record<string, { type: "photo" | "video", url: string } | null>>({});

  // Dialog State for Customer Orders
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [customerOrders, setCustomerOrders] = useState<OrderWithDetails[]>([]);
  const [selectedDialogOrderId, setSelectedDialogOrderId] = useState<number | null>(null);

  // 1. Garment Selection Effect
  useEffect(() => {
    if (activeOrder?.garments?.length) {
      // Automatically select the first garment
      const firstGarment = activeOrder.garments[0];
      setSelectedGarmentId(firstGarment.id);
      
      // Reset feedback state for new order
      setShopMeasurements({});
      setMeasurementNotes({});
      setOptionNotes({});
      setOptionChecks({});
      setEvidence({});
      setFeedbackStatus("satisfied");
      setReceivingAction("");
    }
  }, [activeOrder]);

  const activeGarment = useMemo(() => 
    activeOrder?.garments?.find(g => g.id === selectedGarmentId),
    [activeOrder, selectedGarmentId]
  );

  // 2. Measurement Query
  const measurementId = activeGarment?.measurement_id;
  const { data: measurementData, isLoading: isMeasurementLoading } = useQuery({
    queryKey: ["measurement", measurementId],
    queryFn: () => getMeasurementById(measurementId!),
    enabled: !!measurementId,
  });

  const measurement = measurementData?.data;

  // --- Search Logic ---

  const handleIdSearch = async () => {
    if (!orderIdSearch) return;
    setIdError(undefined);
    setIsSearchingId(true);
    try {
        const res = await getOrderById(orderIdSearch, true);
        if (res.status === "error" || !res.data) {
            setIdError("Order not found");
            toast.error("Order ID not found");
        } else {
            setActiveOrder(res.data);
            setOrderIdSearch(undefined);
        }
    } catch (err) {
        toast.error("Search failed");
    } finally {
        setIsSearchingId(false);
    }
  };

  const handleFatouraSearch = async () => {
    if (!fatouraSearch) return;
    setFatouraError(undefined);
    setIsSearchingFatoura(true);
    try {
        const res = await getOrderByInvoice(fatouraSearch, true);
        if (res.status === "error" || !res.data) {
            setFatouraError("Invoice not found");
            toast.error("Invoice Number not found");
        } else {
            setActiveOrder(res.data);
            setFatouraSearch(undefined);
        }
    } catch (err) {
        toast.error("Search failed");
    } finally {
        setIsSearchingFatoura(false);
    }
  };

  const handleCustomerFound = async (customer: Customer) => {
    setIsSearchingCustomer(true);
    try {
      const ordersResponse = await getPendingOrdersByCustomer(
        customer.id,
        20,
        "confirmed",
        true // Include relations
      );

      if (ordersResponse.data && ordersResponse.data.length > 0) {
        setCustomerOrders(ordersResponse.data as OrderWithDetails[]);
        setSelectedDialogOrderId(null);
        setIsDialogOpen(true);
      } else {
        toast.info(`No confirmed orders found for ${customer.name}.`);
      }
    } catch (error) {
      console.error("Failed to fetch customer orders", error);
      toast.error("Failed to fetch customer orders.");
    } finally {
      setIsSearchingCustomer(false);
    }
  };

  const handleDialogConfirm = () => {
    if (!selectedDialogOrderId) return;
    const order = customerOrders.find(o => o.id === selectedDialogOrderId);
    if (order) {
        setActiveOrder(order);
        setIsDialogOpen(false);
    }
  };

  // --- Handlers ---

  const handleMeasurementChange = (key: string, value: string) => {
    const numValue = value === "" ? "" : parseFloat(value);
    setShopMeasurements(prev => ({
      ...prev,
      [key]: numValue
    }));
  };

  const handleMeasurementNoteChange = (key: string, value: string) => {
    setMeasurementNotes(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleOptionNoteChange = (key: string, value: string) => {
    setOptionNotes(prev => ({
      ...prev,
      [key]: value
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
        toast.error("Please select an action (Close Order or Re-open)");
        return;
    }
    setIsConfirmDialogOpen(true);
  };

  const handleSave = async () => {
    setIsConfirmDialogOpen(false);
    setIsSubmitting(true);
    
    try {
        toast.success(`Final Feedback Logged`, {
            description: `Order ${activeOrder?.id} completed with status: ${FINAL_FEEDBACK_STATUS_OPTIONS.find(o => o.value === feedbackStatus)?.label}`
        });
        setActiveOrder(null);
    } catch (err) {
        toast.error("Failed to save final feedback");
    } finally {
        setIsSubmitting(false);
    }
  };

  // --- Helpers ---

  const getDifference = (targetVal: number | undefined | null, shopVal: number | "" | undefined) => {
    if (targetVal === null || targetVal === undefined || shopVal === "" || shopVal === undefined) return null;
    return Number((shopVal - targetVal).toFixed(2));
  };

  const getDiffStatus = (diff: number | null) => {
    if (diff === null) return "neutral";
    if (Math.abs(diff) === 0) return "success";
    if (Math.abs(diff) <= 0.5) return "warning";
    return "error";
  };

  // Option Helper
  const findOptionImage = (list: BaseOption[], val: string | undefined | null) => {
    if (!val) return null;
    return list.find(o => o.value === val || o.displayText === val)?.image;
  };

  // Build the specific rows for "Collar, Collar Button, Tabbagi, Jabzour, Front Pocket, Cuff"
  const optionRows = useMemo(() => {
    if (!activeGarment) return [];
    const g = activeGarment;
    
    // Define the specific structure based on schema
    return [
      {
        id: "collar",
        label: "Collar",
        mainValue: g.collar_type,
        mainImage: findOptionImage(collarTypes, g.collar_type),
        hashwaLabel: null,
        hashwaValue: null
      },
      {
        id: "collarBtn",
        label: "Collar Button",
        mainValue: g.collar_button,
        mainImage: findOptionImage(collarButtons, g.collar_button),
        hashwaLabel: null,
        hashwaValue: null,
        extraCheckLabel: g.small_tabaggi ? "Small Tabbagi" : null,
        extraCheckValue: g.small_tabaggi
      },
      {
        id: "jabzour1",
        label: "Jabzour 1",
        mainValue: g.jabzour_1,
        mainImage: findOptionImage(jabzourTypes, g.jabzour_1),
        hashwaLabel: "Hashwa",
        hashwaValue: g.jabzour_thickness
      },
      {
        id: "jabzour2",
        label: "Jabzour 2",
        mainValue: g.jabzour_2,
        mainImage: findOptionImage(jabzourTypes, g.jabzour_2),
        hashwaLabel: "Hashwa",
        hashwaValue: g.jabzour_thickness
      },
      {
        id: "frontPocket",
        label: "Front Pocket",
        mainValue: g.front_pocket_type,
        mainImage: findOptionImage(topPocketTypes, g.front_pocket_type),
        hashwaLabel: "Hashwa",
        hashwaValue: g.front_pocket_thickness
      },
      {
        id: "cuff",
        label: "Cuff",
        mainValue: g.cuffs_type,
        mainImage: findOptionImage(cuffTypes, g.cuffs_type),
        hashwaLabel: "Hashwa",
        hashwaValue: g.cuffs_thickness
      }
    ].filter(r => r.mainValue && r.mainValue !== "None");
  }, [activeGarment]);

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 },
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  return (
    <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="container mx-auto p-6 md:p-10 max-w-7xl space-y-8 pb-24"
    >
      
      {/* 1. Header & Search */}
      <motion.div variants={itemVariants} className="space-y-6">
        <div className="flex flex-col gap-1 border-b border-border pb-6">
            <h1 className="text-3xl font-bold text-foreground">
                Final <span className="text-primary">Feedback</span>
            </h1>
            <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">
                Record customer satisfaction and final adjustments after delivery
            </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="lg:col-span-7">
                <SearchCustomer 
                    onCustomerFound={handleCustomerFound}
                    onHandleClear={() => {}}
                />
            </div>
            <div className="lg:col-span-5">
                <DirectLookupCard 
                    orderId={orderIdSearch}
                    fatoura={fatouraSearch}
                    onOrderIdChange={(val) => { setOrderIdSearch(val); setIdError(undefined); }}
                    onFatouraChange={(val) => { setFatouraSearch(val); setFatouraError(undefined); }}
                    onOrderIdSubmit={handleIdSearch}
                    onFatouraSubmit={handleFatouraSearch}
                    isSearchingId={isSearchingId}
                    isSearchingFatoura={isSearchingFatoura}
                    idError={idError}
                    fatouraError={fatouraError}
                />
            </div>
        </div>
      </motion.div>

      {activeOrder ? (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
        >
          {/* 2. Compact Order Context Bar */}
          <Card className="border-2 border-primary/10 shadow-sm overflow-hidden bg-muted/20">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-y-4 gap-x-8">
                {/* Customer Info */}
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg text-primary">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground leading-none mb-1">Customer</p>
                    <p className="font-bold text-sm leading-none">{activeOrder.customer?.name || "Guest"}</p>
                  </div>
                  <div className="ml-2 pl-3 border-l border-border py-1">
                    <p className="text-[10px] font-bold text-muted-foreground font-mono leading-none">{activeOrder.customer?.phone}</p>
                  </div>
                </div>

                <div className="hidden lg:block h-8 w-px bg-border/60" />

                {/* Order Details */}
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                      <Hash className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground leading-none mb-1">Order & Inv</p>
                      <div className="flex items-center gap-2 leading-none">
                        <span className="font-black text-sm">#{activeOrder.id}</span>
                        <span className="text-[10px] font-bold text-primary opacity-70">INV: {activeOrder.invoice_number || "—"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                      <Package className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground leading-none mb-1">Garments</p>
                      <p className="font-bold text-sm leading-none">{activeOrder.garments?.length || 0} Pieces</p>
                    </div>
                  </div>
                </div>

                <div className="hidden lg:block h-8 w-px bg-border/60" />

                {/* Delivery */}
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg text-primary">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground leading-none mb-1">Delivered On</p>
                    <p className="font-bold text-sm leading-none">
                      {activeOrder.delivery_date ? format(new Date(activeOrder.delivery_date), "PP") : "Not Set"}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Separator className="opacity-50" />

          {/* 3. Garment Selection Tabs */}
          <Tabs value={selectedGarmentId || ""} onValueChange={setSelectedGarmentId} className="w-full space-y-6">
            <div className="flex items-center justify-between overflow-x-auto pb-2 scrollbar-hide">
                <TabsList className="h-auto flex-nowrap justify-start gap-3 bg-transparent p-0">
                {activeOrder.garments?.map((garment) => (
                    <TabsTrigger 
                        key={garment.id} 
                        value={garment.id}
                        className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=active]:border-primary border-2 border-border/60 bg-card px-4 py-2 h-14 min-w-[140px] rounded-xl transition-all"
                    >
                        <div className="text-left w-full space-y-1">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[9px] font-black uppercase tracking-widest opacity-70">Item</span>
                                <Badge 
                                    className={cn(
                                        "h-3.5 px-1 text-[8px] font-black uppercase border-none",
                                        garment.brova 
                                            ? "bg-amber-100 text-amber-700 data-[state=active]:bg-amber-500 data-[state=active]:text-white" 
                                            : "bg-emerald-100 text-emerald-700 data-[state=active]:bg-emerald-500 data-[state=active]:text-white"
                                    )}
                                >
                                    {garment.brova ? "Brova" : "Final"}
                                </Badge>
                            </div>
                            <div className="font-black text-xs truncate uppercase tracking-tighter">{garment.garment_id}</div>
                        </div>
                    </TabsTrigger>
                ))}
                </TabsList>
            </div>

            <TabsContent value={selectedGarmentId || ""} className="mt-0 space-y-8 focus-visible:ring-0">
               
                 {/* MEASUREMENT feedback SECTION */}
                <Card className="border-2 border-border shadow-md overflow-hidden rounded-2xl">
                    <CardHeader className="bg-muted/30 border-b p-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-primary text-primary-foreground rounded-xl shadow-sm">
                                    <Ruler className="w-5 h-5" />
                                </div>
                                <div>
                                    <CardTitle className="text-xl font-bold uppercase tracking-tight">Final Measurement Check</CardTitle>
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Verify final dimensions and note any deviations</p>
                                </div>
                            </div>
                            <Badge variant="outline" className="bg-background font-black text-[10px] h-7 px-3">
                                {isMeasurementLoading ? "SYNCING SPECS..." : "FINAL SPECS LOADED"}
                            </Badge>
                        </div>
                    </CardHeader>
                    
                    <div className="relative overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-muted/50 sticky top-0 z-10 border-b-2 border-border/60">
                                <TableRow className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                    <TableHead className="w-[15%] p-4">Dimension</TableHead>
                                    <TableHead className="text-center bg-muted/30 w-[12%]">Target (cm)</TableHead>
                                    <TableHead className="text-center w-[15%] bg-primary/5">Final (cm)</TableHead>
                                    <TableHead className="text-center w-[12%]">Delta</TableHead>
                                    <TableHead className="p-4">Observation Notes</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {MEASUREMENT_ROWS.map((row) => {
                                    const orderValue = measurement ? (measurement[row.key as keyof Measurement] as number | null) : undefined;
                                    const shopValue = shopMeasurements[row.key];
                                    const noteValue = measurementNotes[row.key] || "";
                                    
                                    const diffOrder = getDifference(orderValue, shopValue);
                                    const statusOrder = getDiffStatus(diffOrder);
                                    const isMissing = orderValue === null || orderValue === undefined || orderValue === 0;

                                    if (isMissing) return null;

                                    return (
                                        <TableRow key={row.key} className="hover:bg-muted/20 transition-colors group">
                                            <TableCell className="p-4">
                                                <div className="font-bold text-xs uppercase tracking-tight">{row.type}</div>
                                                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{row.subType}</div>
                                            </TableCell>
                                            <TableCell className="text-center font-black text-sm bg-muted/30">
                                                {orderValue || "-"}
                                            </TableCell>
                                            <TableCell className="p-2 bg-primary/[0.02]">
                                                <Input 
                                                    type="number" 
                                                    className={cn(
                                                        "h-10 w-28 mx-auto text-center font-black text-sm border-2 transition-all",
                                                        statusOrder === 'error' && "border-destructive bg-destructive/5 text-destructive",
                                                        statusOrder === 'warning' && "border-amber-500 bg-amber-50 text-amber-700",
                                                        statusOrder === 'success' && "border-emerald-500 bg-emerald-50 text-emerald-700",
                                                        !shopValue && "border-border hover:border-primary/40"
                                                    )}
                                                    placeholder="0.0"
                                                    value={shopValue ?? ""}
                                                    onChange={(e) => handleMeasurementChange(row.key, e.target.value)}
                                                />
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <AnimatePresence mode="wait">
                                                    {diffOrder !== null ? (
                                                        <motion.div
                                                            initial={{ opacity: 0, scale: 0.8 }}
                                                            animate={{ opacity: 1, scale: 1 }}
                                                            exit={{ opacity: 0, scale: 0.8 }}
                                                        >
                                                            <Badge variant="secondary" className={cn(
                                                                "font-black text-[10px] h-6 px-2 shadow-sm",
                                                                statusOrder === 'success' && "bg-emerald-100 text-emerald-800 border-emerald-200",
                                                                statusOrder === 'warning' && "bg-amber-100 text-amber-800 border-amber-200",
                                                                statusOrder === 'error' && "bg-red-100 text-red-800 border-red-200"
                                                            )}>
                                                                {diffOrder > 0 ? `+${diffOrder}` : diffOrder} cm
                                                                {statusOrder === 'success' && <Check className="w-3 h-3 ml-1" />}
                                                                {statusOrder === 'error' && <X className="w-3 h-3 ml-1" />}
                                                            </Badge>
                                                        </motion.div>
                                                    ) : (
                                                        <span className="text-muted-foreground font-black text-[10px] opacity-20">—</span>
                                                    )}
                                                </AnimatePresence>
                                            </TableCell>
                                            <TableCell className="p-2">
                                                <div className="flex items-center gap-2 bg-muted/10 rounded-lg px-3 group-focus-within:bg-background transition-colors border border-transparent group-focus-within:border-border">
                                                    <MessageSquare className="w-3.5 h-3.5 text-muted-foreground/40" />
                                                    <Input 
                                                        className="border-none shadow-none focus-visible:ring-0 bg-transparent text-[11px] font-bold h-9"
                                                        placeholder="Post-delivery note..."
                                                        value={noteValue}
                                                        onChange={(e) => handleMeasurementNoteChange(row.key, e.target.value)}
                                                    />
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </Card>

                {/* STYLE feedback SECTION */}
                <Card className="border-2 border-border shadow-md rounded-2xl overflow-hidden">
                    <CardHeader className="bg-muted/30 border-b p-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-primary text-primary-foreground rounded-xl shadow-sm">
                                <Package className="w-5 h-5" />
                            </div>
                            <div>
                                <CardTitle className="text-xl font-bold uppercase tracking-tight">Post-Delivery Style Audit</CardTitle>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Collect feedback on final style configurations</p>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6">
                       <div className="space-y-4">
                            <div className="hidden md:grid grid-cols-12 gap-6 px-4 py-3 bg-muted/50 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground border border-border/40">
                                <div className="col-span-3">Configuration Item</div>
                                <div className="col-span-2">Reference</div>
                                <div className="col-span-3">Status</div>
                                <div className="col-span-2">Notes</div>
                                <div className="col-span-2 text-right">Evidence</div>
                            </div>

                            <AnimatePresence mode="popLayout">
                                {optionRows.map((opt) => (
                                    <motion.div 
                                        key={opt.id} 
                                        layout
                                        className="grid grid-cols-1 md:grid-cols-12 gap-6 p-6 rounded-2xl border-2 border-border/40 bg-card items-start md:items-center hover:border-primary/20 transition-all shadow-sm"
                                    >
                                        {/* Item Description */}
                                        <div className="col-span-3 space-y-1">
                                            <div className="font-black text-sm uppercase tracking-tight text-foreground">{opt.label}</div>
                                            <Badge variant="outline" className="font-black text-[9px] uppercase border-primary/20 bg-primary/5 text-primary h-5">
                                                {opt.mainValue}
                                            </Badge>
                                        </div>

                                        {/* Visual Reference */}
                                        <div className="col-span-2">
                                            {opt.mainImage ? (
                                                <div className="h-16 w-16 bg-white rounded-xl border-2 border-border/60 p-1.5 shadow-inner">
                                                    <img 
                                                        src={opt.mainImage} 
                                                        alt={opt.label} 
                                                        className="w-full h-full object-contain" 
                                                    />
                                                </div>
                                            ) : (
                                                <div className="h-16 w-16 bg-muted/30 rounded-xl border-2 border-dashed border-border/60 flex items-center justify-center text-muted-foreground text-[10px] font-black uppercase text-center p-2 opacity-40">
                                                    NO REF
                                                </div>
                                            )}
                                        </div>

                                        {/* Checklist */}
                                        <div className="col-span-3 space-y-3">
                                            <div 
                                                className={cn(
                                                    "flex items-center space-x-3 p-2.5 rounded-xl border-2 transition-all cursor-pointer",
                                                    optionChecks[`${opt.id}-main`] ? "bg-emerald-50 border-emerald-500/30" : "bg-muted/10 border-transparent hover:border-border"
                                                )}
                                                onClick={() => handleCheck(`${opt.id}-main`, !optionChecks[`${opt.id}-main`])}
                                            >
                                                <Checkbox 
                                                    id={`check-${opt.id}-main`}
                                                    checked={optionChecks[`${opt.id}-main`] || false}
                                                    className="size-4 pointer-events-none"
                                                />
                                                <Label className="cursor-pointer text-[11px] font-black uppercase tracking-tight flex-1 pointer-events-none">
                                                    {opt.label} Verified
                                                </Label>
                                            </div>

                                            {opt.hashwaValue && (
                                                <div className="flex items-center gap-3 p-2.5 rounded-xl border-2 border-dashed bg-primary/5 border-primary/20">
                                                    <Checkbox 
                                                        id={`check-${opt.id}-hashwa`}
                                                        checked={optionChecks[`${opt.id}-hashwa`] || false}
                                                        onCheckedChange={(c) => handleCheck(`${opt.id}-hashwa`, c as boolean)}
                                                        className="size-4"
                                                    />
                                                    <div className="flex items-center gap-2 flex-1">
                                                        <Label htmlFor={`check-${opt.id}-hashwa`} className="cursor-pointer text-[10px] font-bold uppercase tracking-widest text-primary/80">
                                                            Hashwa:
                                                        </Label>
                                                        <span className="font-black text-xs text-primary">{opt.hashwaValue}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Local Notes for Style */}
                                        <div className="col-span-2">
                                            <div className="flex items-center gap-2 bg-muted/30 rounded-xl px-3 border-2 border-transparent focus-within:border-border focus-within:bg-background transition-all">
                                                <MessageSquare className="size-3 text-muted-foreground/40" />
                                                <Input 
                                                    className="border-none shadow-none focus-visible:ring-0 bg-transparent text-[10px] font-bold h-10 p-0"
                                                    placeholder="Final note..."
                                                    value={optionNotes[opt.id] || ""}
                                                    onChange={(e) => handleOptionNoteChange(opt.id, e.target.value)}
                                                />
                                            </div>
                                        </div>

                                        {/* Capture Actions */}
                                        <div className="col-span-2 flex justify-end gap-2">
                                            {evidence[opt.id] ? (
                                                <div className="relative group size-16 rounded-xl overflow-hidden border-2 border-primary/30 shadow-lg">
                                                    {evidence[opt.id]?.type === 'photo' ? (
                                                        <img src={evidence[opt.id]?.url} alt="Captured" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <video src={evidence[opt.id]?.url} className="w-full h-full object-cover" />
                                                    )}
                                                    <button 
                                                        onClick={() => setEvidence(prev => { const n = {...prev}; delete n[opt.id]; return n; })}
                                                        className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <X className="w-5 h-5 text-white" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-1.5 w-full">
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        className="h-8 text-[9px] font-black uppercase tracking-widest border-2 w-full justify-start"
                                                        onClick={() => document.getElementById(`file-photo-${opt.id}`)?.click()}
                                                    >
                                                        <Camera className="w-3.5 h-3.5 mr-2" />
                                                        Photo
                                                    </Button>
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        className="hidden"
                                                        id={`file-photo-${opt.id}`}
                                                        onChange={(e) => handleCapture(opt.id, 'photo', e.target.files?.[0] || null)}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                       </div>
                    </CardContent>
                </Card>

                {/* FINAL ACTIONS CONTROL PANEL */}
                <Card className="border-2 border-primary shadow-xl shadow-primary/5 rounded-3xl overflow-hidden">
                    <CardHeader className="bg-primary/5 border-b-2 border-primary/10 p-8">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-primary text-primary-foreground rounded-2xl shadow-lg">
                                <Check className="w-6 h-6" />
                            </div>
                            <div>
                                <CardTitle className="text-2xl font-black uppercase tracking-tight">Final feedback Decision</CardTitle>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mt-1">Submit post-delivery audit results</p>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-8 space-y-8">
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                            {/* feedback Classification */}
                            <div className="space-y-4">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Overall Satisfaction</Label>
                                <Select value={feedbackStatus} onValueChange={setFeedbackStatus}>
                                    <SelectTrigger className="h-14 text-base font-bold border-2 rounded-2xl shadow-sm">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl border-2">
                                        {FINAL_FEEDBACK_STATUS_OPTIONS.map(opt => (
                                            <SelectItem key={opt.value} value={opt.value} className="cursor-pointer py-3 rounded-lg mx-1">
                                                <span className={cn("font-black uppercase tracking-tight text-sm", opt.color)}>{opt.label}</span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Receiving Action */}
                            <div className="space-y-4">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Lifecycle Decision</Label>
                                <RadioGroup 
                                    value={receivingAction} 
                                    onValueChange={(val) => setReceivingAction(val as "accept" | "reject")}
                                    className="grid grid-cols-2 gap-4"
                                >
                                    <div>
                                        <RadioGroupItem value="accept" id="action-accept" className="peer sr-only" />
                                        <Label
                                            htmlFor="action-accept"
                                            className="flex flex-col items-center justify-center h-24 rounded-2xl border-2 border-border bg-card p-4 hover:bg-emerald-50 hover:border-emerald-200 peer-data-[state=checked]:border-emerald-500 peer-data-[state=checked]:bg-emerald-50 peer-data-[state=checked]:text-emerald-700 cursor-pointer transition-all shadow-sm"
                                        >
                                            <ThumbsUp className="mb-2 h-6 w-6" />
                                            <span className="font-black uppercase tracking-widest text-[10px]">Close Order</span>
                                        </Label>
                                    </div>
                                    <div>
                                        <RadioGroupItem value="reject" id="action-reject" className="peer sr-only" />
                                        <Label
                                            htmlFor="action-reject"
                                            className="flex flex-col items-center justify-center h-24 rounded-2xl border-2 border-border bg-card p-4 hover:bg-red-50 hover:border-red-200 peer-data-[state=checked]:border-destructive peer-data-[state=checked]:bg-red-50 peer-data-[state=checked]:text-destructive cursor-pointer transition-all shadow-sm"
                                        >
                                            <ThumbsDown className="mb-2 h-6 w-6" />
                                            <span className="font-black uppercase tracking-widest text-[10px]">Open Alteration</span>
                                        </Label>
                                    </div>
                                </RadioGroup>
                            </div>
                        </div>
                        
                        <Separator />
                        
                        <div className="flex justify-end pt-2">
                            <Button 
                                onClick={onConfirmClick} 
                                disabled={!receivingAction || isSubmitting}
                                className="w-full md:w-auto h-14 min-w-[240px] font-black uppercase tracking-widest shadow-xl shadow-primary/20 text-base"
                            >
                                {isSubmitting ? <RefreshCw className="w-5 h-5 animate-spin mr-2" /> : <Save className="w-5 h-5 mr-2" />}
                                Finalize feedback
                            </Button>
                        </div>

                    </CardContent>
                </Card>

                <ConfirmationDialog
                    isOpen={isConfirmDialogOpen}
                    onClose={() => setIsConfirmDialogOpen(false)}
                    onConfirm={handleSave}
                    title={receivingAction === 'accept' ? "Confirm Order Closure" : "Confirm Alteration Re-entry"}
                    description={receivingAction === 'accept' 
                        ? `You are marking order #${activeOrder.id} as completely fulfilled. This will close the production lifecycle.` 
                        : `You are opening a post-delivery alteration for order #${activeOrder.id}. This will return the item to production.`
                    }
                    confirmText={receivingAction === 'accept' ? "Yes, Close Order" : "Yes, Open Alteration"}
                    cancelText="Go Back"
                />

            </TabsContent>
          </Tabs>

        </motion.div>
      ) : (
        /* Empty State */
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-32 text-center"
        >
            <div className="size-24 bg-muted/30 rounded-full flex items-center justify-center mb-8 border-2 border-dashed border-border shadow-inner">
                <Package className="w-10 h-10 text-muted-foreground/40" />
            </div>
            <h3 className="text-2xl font-black text-foreground uppercase tracking-tight">System Ready</h3>
            <p className="text-muted-foreground font-medium uppercase tracking-widest text-[10px] mt-2">Enter an identifier or search for a customer to begin final audit</p>
        </motion.div>
      )}

      {/* Customer Selection Dialog */}
      <ErrorBoundary>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="!w-[95vw] sm:!w-[90vw] md:!w-[85vw] lg:!w-[80vw] !max-w-5xl max-h-[85vh]">
            <DialogHeader className="border-b border-border pb-4 px-2">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
                  <RefreshCw className="w-6 h-6" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-black uppercase tracking-tight">
                    Select Order for Feedback
                  </DialogTitle>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-1">
                    Delivered or collected orders for this customer
                  </p>
                </div>
              </div>
            </DialogHeader>

            <RadioGroup
              value={selectedDialogOrderId?.toString()}
              onValueChange={(val) => setSelectedDialogOrderId(parseInt(val))}
              className="overflow-y-auto max-h-[50vh] px-1"
            >
              <div className="border rounded-xl bg-muted/5 overflow-hidden">
                <table className="w-full text-sm min-w-[700px]">
                  <thead className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 border-b-2 border-border/60">
                    <tr className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      <th className="p-4 w-12 text-center">Select</th>
                      <th className="p-4 text-left">Identity</th>
                      <th className="p-4 text-left">Production Stage</th>
                      <th className="p-4 text-left">Delivery Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {customerOrders.map((order) => (
                        <tr
                          key={order.id}
                          className={cn(
                            "transition-colors group cursor-pointer",
                            selectedDialogOrderId === order.id
                                ? "bg-primary/5 hover:bg-primary/10"
                                : "hover:bg-muted/20",
                          )}
                          onClick={() => setSelectedDialogOrderId(order.id)}
                        >
                          <td className="p-4">
                            <div className="flex items-center justify-center">
                                <RadioGroupItem
                                    value={order.id.toString()}
                                    id={`dialog-order-${order.id}`}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="space-y-1">
                              <h4 className="font-black text-xs uppercase">
                                  #{order.id}
                              </h4>
                              <p className="text-[10px] font-bold text-muted-foreground uppercase">
                                Inv: {order.invoice_number ?? "—"}
                              </p>
                            </div>
                          </td>
                          <td className="p-4">
                            <Badge variant="outline" className="text-[9px] font-black uppercase tracking-wider h-5 px-2">
                              {order.production_stage?.replace(/_/g, " ") ?? "N/A"}
                            </Badge>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                                <Clock className="w-3 h-3 text-muted-foreground" />
                                <span className="text-xs font-bold whitespace-nowrap">
                                    {order.delivery_date ? format(new Date(order.delivery_date), "PP") : "Not Set"}
                                </span>
                            </div>
                          </td>
                        </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </RadioGroup>

            <DialogFooter className="border-t border-border pt-6 px-2">
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4 w-full">
                <div className="flex items-center gap-2">
                   <div className={cn("h-2 w-2 rounded-full bg-primary", selectedDialogOrderId && "animate-pulse")} />
                   <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    {selectedDialogOrderId ? `Order #${selectedDialogOrderId} Selected` : "Select an order"}
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="ghost"
                    className="font-black uppercase tracking-widest text-[10px]"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleDialogConfirm}
                    disabled={!selectedDialogOrderId}
                    className="font-black uppercase tracking-widest h-10 px-6 shadow-lg shadow-primary/20"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Start Feedback
                  </Button>
                </div>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </ErrorBoundary>
    </motion.div>
  );
}