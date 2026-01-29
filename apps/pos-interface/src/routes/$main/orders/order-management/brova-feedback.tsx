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
    Hash,
    User,
    Clock,
    RefreshCw,
    MessageSquare
  } from "lucide-react";

// UI Components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  DialogTitle,
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
  "/$main/orders/order-management/brova-feedback"
)({
  component: BrovaFeedbackInterface,
  head: () => ({
    meta: [{ title: "Brova Feedback" }],
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

const SATISFACTION_LEVELS = [
  { value: "angry", label: "Angry", emoji: "😠", color: "hover:bg-red-50 peer-data-[state=checked]:bg-red-100 peer-data-[state=checked]:border-red-500 text-red-600" },
  { value: "sad", label: "Sad", emoji: "☹️", color: "hover:bg-orange-50 peer-data-[state=checked]:bg-orange-100 peer-data-[state=checked]:border-orange-500 text-orange-600" },
  { value: "neutral", label: "Neutral", emoji: "😐", color: "hover:bg-yellow-50 peer-data-[state=checked]:bg-yellow-100 peer-data-[state=checked]:border-yellow-500 text-yellow-600" },
  { value: "happy", label: "Happy", emoji: "🙂", color: "hover:bg-green-50 peer-data-[state=checked]:bg-green-100 peer-data-[state=checked]:border-green-500 text-green-600" },
  { value: "very_happy", label: "Very Happy", emoji: "😄", color: "hover:bg-emerald-50 peer-data-[state=checked]:bg-emerald-100 peer-data-[state=checked]:border-emerald-500 text-emerald-600" },
];

const BROVA_ACTION_OPTIONS = [
  { value: "accepted", label: "Accepted", color: "peer-data-[state=checked]:bg-emerald-50 peer-data-[state=checked]:text-emerald-700 peer-data-[state=checked]:border-emerald-500" },
  { value: "repair", label: "Repair", color: "peer-data-[state=checked]:bg-amber-50 peer-data-[state=checked]:text-amber-700 peer-data-[state=checked]:border-amber-500" },
  { value: "repair_production", label: "Repair + Production", color: "peer-data-[state=checked]:bg-orange-50 peer-data-[state=checked]:text-orange-700 peer-data-[state=checked]:border-orange-500" },
  { value: "redo", label: "Re-do", color: "peer-data-[state=checked]:bg-red-50 peer-data-[state=checked]:text-red-700 peer-data-[state=checked]:border-red-500" },
];

const ORDER_DISTRIBUTION_OPTIONS = [
  { value: "pickup", label: "Customer Pick up", icon: Package },
  { value: "workshop", label: "Send to Workshop", icon: RefreshCw },
  { value: "shop", label: "Brova at Shop", icon: Clock },
];

const DIFFERENCE_REASONS = [
  { label: "Customer Request", color: "text-emerald-600 bg-emerald-50" },
  { label: "Workshop Error", color: "text-red-600 bg-red-50" },
  { label: "Shop Error", color: "text-muted-foreground bg-muted/50" },
];

// --- Types ---

interface ShopMeasurements {
  [key: string]: number | "";
}

interface FeedbackMeasurements {
  [key: string]: number | "";
}

interface OrderWithDetails extends Order {
    customer?: Customer;
    garments?: Garment[];
}

// --- Main Component ---

function BrovaFeedbackInterface() {
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
  const [workshopMeasurements, setWorkshopMeasurements] = useState<ShopMeasurements>({});
  const [feedbackMeasurements, setFeedbackMeasurements] = useState<FeedbackMeasurements>({});
  const [differenceReasons, setDifferenceReasons] = useState<Record<string, string>>({});
  const [measurementNotes, setMeasurementNotes] = useState<Record<string, string>>({});
  const [optionNotes, setOptionNotes] = useState<Record<string, string>>({});
  const [satisfaction, setSatisfaction] = useState<string | null>(null);
  const [brovaAction, setBrovaAction] = useState<string | null>(null);
  const [distributionAction, setDistributionAction] = useState<string | null>(null);
  const [orderNotes, setOrderNotes] = useState("");
  const [optionChecks, setOptionChecks] = useState<Record<string, boolean>>({});
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [evidence, setEvidence] = useState<Record<string, { type: "photo" | "video", url: string } | null>>({});

  // Dialog State for Customer Orders
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [customerOrders, setCustomerOrders] = useState<OrderWithDetails[]>([]);

  // 1. Garment Selection Effect
  useEffect(() => {
    if (activeOrder?.garments?.length) {
      // Automatically select the first garment
      const firstGarment = activeOrder.garments[0];
      setSelectedGarmentId(firstGarment.id);
      
      // Reset feedback state for new order
      setWorkshopMeasurements({});
      setFeedbackMeasurements({});
      setDifferenceReasons({});
      setMeasurementNotes({});
      setOptionNotes({});
      setOptionChecks({});
      setEvidence({});
      setSatisfaction(null);
      setBrovaAction(null);
      setDistributionAction(null);
      setOrderNotes("");
    }
  }, [activeOrder]);

  useEffect(() => {
    if (brovaAction && brovaAction !== "accepted") {
      setDistributionAction("workshop");
    }
  }, [brovaAction]);

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

  const handleSelectOrder = (order: OrderWithDetails) => {
    setActiveOrder(order);
    setIsDialogOpen(false);
  };

  // --- Handlers ---

  const handleWorkshopMeasurementChange = (key: string, value: string) => {
    const numValue = value === "" ? "" : parseFloat(value);
    setWorkshopMeasurements(prev => ({
      ...prev,
      [key]: numValue
    }));
  };

  const handleFeedbackMeasurementChange = (key: string, value: string) => {
    const numValue = value === "" ? "" : parseFloat(value);
    setFeedbackMeasurements(prev => ({
      ...prev,
      [key]: numValue
    }));
  };

  const handleDifferenceReasonChange = (key: string, value: string) => {
    setDifferenceReasons(prev => ({
      ...prev,
      [key]: value
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
    if (!satisfaction || !brovaAction || !distributionAction) {
        toast.error("Please complete all feedback sections");
        return;
    }
    setIsConfirmDialogOpen(true);
  };

  const handleSave = async () => {
    setIsConfirmDialogOpen(false);
    setIsSubmitting(true);
    
    try {
        toast.success(`Order Feedback Logged`, {
            description: `Order #${activeOrder?.id} processed successfully`
        });
        setActiveOrder(null);
    } catch (err) {
        toast.error("Failed to save feedback results");
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
        className="container mx-auto p-4 md:p-6 max-w-7xl space-y-6 pb-24"
    >
      
      {/* 1. Header & Search */}
      <motion.div variants={itemVariants} className="space-y-4">
        <div className="flex flex-col gap-1 border-b border-border pb-4">
            <h1 className="text-3xl font-bold text-foreground">
                Brova <span className="text-primary">Feedback</span>
            </h1>
            <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">
                Log customer feedback and adjustments for brova garments
            </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
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
            className="space-y-6"
        >
          {/* 2. Compact Order Context Bar */}
          <Card className="border-2 border-primary/10 shadow-sm overflow-hidden bg-muted/20 py-0 gap-0">
            <CardContent className="p-3">
              <div className="flex flex-wrap items-center justify-between gap-y-3 gap-x-8">
                {/* Customer Info */}
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-primary/10 rounded-lg text-primary">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground leading-none mb-1">Customer</p>
                    <p className="font-bold text-sm leading-none">{activeOrder.customer?.name || "Guest"}</p>
                  </div>
                  <div className="ml-2 pl-3 border-l border-border py-1">
                    <p className="text-[10px] font-bold text-muted-foreground font-mono leading-none">{activeOrder.customer?.phone}</p>
                  </div>
                </div>

                <div className="hidden lg:block h-6 w-px bg-border/60" />

                {/* Order Details */}
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-primary/10 rounded-lg text-primary">
                      <Hash className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground leading-none mb-1">Order & Inv</p>
                      <div className="flex items-center gap-2 leading-none">
                        <span className="font-black text-sm">#{activeOrder.id}</span>
                        <span className="text-[10px] font-bold text-primary opacity-70">INV: {activeOrder.invoice_number || "—"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-primary/10 rounded-lg text-primary">
                      <Package className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground leading-none mb-1">Garments</p>
                      <p className="font-bold text-sm leading-none">{activeOrder.garments?.length || 0} Pieces</p>
                    </div>
                  </div>
                </div>

                <div className="hidden lg:block h-6 w-px bg-border/60" />

                {/* Delivery */}
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-primary/10 rounded-lg text-primary">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground leading-none mb-1">Delivery Date</p>
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
          <Tabs value={selectedGarmentId || ""} onValueChange={setSelectedGarmentId} className="w-full space-y-4">
            <div className="flex items-center justify-between overflow-x-auto pb-2 scrollbar-hide">
                <TabsList className="h-auto flex-nowrap justify-start gap-2 bg-transparent p-0">
                {activeOrder.garments?.map((garment) => (
                    <TabsTrigger 
                        key={garment.id} 
                        value={garment.id}
                        className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=active]:border-primary border-2 border-border/60 bg-card px-3 py-1.5 h-12 min-w-[120px] rounded-xl transition-all"
                    >
                        <div className="text-left w-full space-y-0.5">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[8px] font-black uppercase tracking-widest opacity-70">Item</span>
                                <Badge 
                                    className={cn(
                                        "h-3 px-1 text-[7px] font-black uppercase border-none",
                                        garment.brova 
                                            ? "bg-amber-100 text-amber-700 data-[state=active]:bg-amber-500 data-[state=active]:text-white" 
                                            : "bg-emerald-100 text-emerald-700 data-[state=active]:bg-emerald-500 data-[state=active]:text-white"
                                    )}
                                >
                                    {garment.brova ? "Brova" : "Final"}
                                </Badge>
                            </div>
                            <div className="font-black text-[11px] truncate uppercase tracking-tighter">{garment.garment_id}</div>
                        </div>
                    </TabsTrigger>
                ))}
                </TabsList>
            </div>

            <TabsContent value={selectedGarmentId || ""} className="mt-0 space-y-6 focus-visible:ring-0">
               
                 {/* MEASUREMENT feedback SECTION */}
                <Card className="border-2 border-border shadow-md overflow-hidden rounded-2xl py-0 gap-0">
                    <CardHeader className="bg-muted/30 border-b p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary text-primary-foreground rounded-lg shadow-sm">
                                    <Ruler className="w-4 h-4" />
                                </div>
                                <div>
                                    <CardTitle className="text-lg font-bold uppercase tracking-tight">Adjustment Log</CardTitle>
                                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Record required dimensional changes</p>
                                </div>
                            </div>
                            <Badge variant="outline" className="bg-background font-black text-[9px] h-6 px-2">
                                {isMeasurementLoading ? "REFRESHING SPECS..." : "SPECIFICATIONS SYNCED"}
                            </Badge>
                        </div>
                    </CardHeader>
                    
                    <div className="relative overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-muted/50 sticky top-0 z-10 border-b-2 border-border/60">
                                <TableRow className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                    <TableHead className="w-[12%] p-3">Dimension</TableHead>
                                    <TableHead className="text-center bg-muted/30 w-[10%] p-3">Order (cm)</TableHead>
                                    <TableHead className="text-center w-[10%] bg-muted/30 p-3">QC (cm)</TableHead>
                                    <TableHead className="text-center w-[12%] bg-primary/5 p-3">Brova (cm)</TableHead>
                                    <TableHead className="text-center w-[10%] p-3">Delta</TableHead>
                                    <TableHead className="text-center w-[15%] p-3">Reason</TableHead>
                                    <TableHead className="p-3">Adjustment Notes</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {MEASUREMENT_ROWS.map((row) => {
                                    const orderValue = measurement ? (measurement[row.key as keyof Measurement] as number | null) : undefined;
                                    const workshopValue = workshopMeasurements[row.key];
                                    const feedbackValue = feedbackMeasurements[row.key];
                                    const reasonValue = differenceReasons[row.key] || "";
                                    const noteValue = measurementNotes[row.key] || "";
                                    
                                    const diffOrder = getDifference(orderValue, feedbackValue);
                                    const statusOrder = getDiffStatus(diffOrder);
                                    const isMissing = orderValue === null || orderValue === undefined || orderValue === 0;

                                    if (isMissing) return null;

                                    const selectedReason = DIFFERENCE_REASONS.find(r => r.label === reasonValue);

                                    return (
                                        <TableRow key={row.key} className="hover:bg-muted/20 transition-colors group">
                                            <TableCell className="p-3">
                                                <div className="font-bold text-xs uppercase tracking-tight">{row.type}</div>
                                                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{row.subType}</div>
                                            </TableCell>
                                            <TableCell className="text-center font-black text-sm bg-muted/30">
                                                {orderValue || "-"}
                                            </TableCell>
                                            <TableCell className="p-1.5 bg-muted/30">
                                                <Input 
                                                    type="number" 
                                                    className="h-8 w-20 mx-auto text-center font-bold text-sm border-transparent bg-transparent hover:border-border focus:bg-background transition-all"
                                                    placeholder="0.0"
                                                    value={workshopValue ?? ""}
                                                    onChange={(e) => handleWorkshopMeasurementChange(row.key, e.target.value)}
                                                />
                                            </TableCell>
                                            <TableCell className="p-1.5 bg-primary/[0.02]">
                                                <Input 
                                                    type="number" 
                                                    className={cn(
                                                        "h-8 w-20 mx-auto text-center font-black text-sm border-2 transition-all",
                                                        statusOrder === 'error' && "border-destructive bg-destructive/5 text-destructive",
                                                        statusOrder === 'warning' && "border-amber-500 bg-amber-50 text-amber-700",
                                                        statusOrder === 'success' && "border-emerald-500 bg-emerald-50 text-emerald-700",
                                                        !feedbackValue && "border-border hover:border-primary/40"
                                                    )}
                                                    placeholder="0.0"
                                                    value={feedbackValue ?? ""}
                                                    onChange={(e) => handleFeedbackMeasurementChange(row.key, e.target.value)}
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
                                                                "font-black text-[10px] h-6 px-1.5 shadow-sm",
                                                                statusOrder === 'success' && "bg-emerald-100 text-emerald-800 border-emerald-200",
                                                                statusOrder === 'warning' && "bg-amber-100 text-amber-800 border-amber-200",
                                                                statusOrder === 'error' && "bg-red-100 text-red-800 border-red-200"
                                                            )}>
                                                                {diffOrder > 0 ? `+${diffOrder}` : diffOrder}
                                                            </Badge>
                                                        </motion.div>
                                                    ) : (
                                                        <span className="text-muted-foreground font-black text-[10px] opacity-20">—</span>
                                                    )}
                                                </AnimatePresence>
                                            </TableCell>
                                            <TableCell className="p-1.5">
                                                <Select value={reasonValue} onValueChange={(val) => handleDifferenceReasonChange(row.key, val)}>
                                                    <SelectTrigger className={cn(
                                                        "h-8 text-[10px] font-bold border-none shadow-none rounded-lg px-2 transition-colors",
                                                        selectedReason ? selectedReason.color : "bg-muted/20 hover:bg-muted/40"
                                                    )}>
                                                        <SelectValue placeholder="Reason..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {DIFFERENCE_REASONS.map(r => (
                                                            <SelectItem key={r.label} value={r.label} className={cn("text-[10px] font-bold uppercase py-2", r.color)}>
                                                                {r.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell className="p-1.5">
                                                <div className="flex items-center gap-2 bg-muted/10 rounded-lg px-2 group-focus-within:bg-background transition-colors border border-transparent group-focus-within:border-border">
                                                    <MessageSquare className="w-3.5 h-3.5 text-muted-foreground/40" />
                                                    <Input 
                                                        className="border-none shadow-none focus-visible:ring-0 bg-transparent text-[10px] font-bold h-8"
                                                        placeholder="Adjustment note..."
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
                <Card className="border-2 border-border shadow-md rounded-2xl overflow-hidden py-0 gap-0">
                    <CardHeader className="bg-muted/30 border-b p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary text-primary-foreground rounded-lg shadow-sm">
                                <Package className="w-4 h-4" />
                            </div>
                            <div>
                                <CardTitle className="text-lg font-bold uppercase tracking-tight">Style Feedback</CardTitle>
                                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Collect feedback on style configurations</p>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4">
                       <div className="space-y-3">
                            <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 bg-muted/50 rounded-xl text-[9px] font-black uppercase tracking-widest text-muted-foreground border border-border/40">
                                <div className="col-span-3">Configuration Item</div>
                                <div className="col-span-2 text-center">Reference</div>
                                <div className="col-span-3 text-center">Status</div>
                                <div className="col-span-2 text-center">Notes</div>
                                <div className="col-span-2 text-right">Evidence</div>
                            </div>

                            <AnimatePresence mode="popLayout">
                                {optionRows.map((opt) => (
                                    <motion.div 
                                        key={opt.id} 
                                        layout
                                        className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 rounded-2xl border-2 border-border/40 bg-card items-start md:items-center hover:border-primary/20 transition-all shadow-sm"
                                    >
                                        {/* Item Description */}
                                        <div className="col-span-3 space-y-1">
                                            <div className="font-black text-xs uppercase tracking-tight text-foreground">{opt.label}</div>
                                            <Badge variant="outline" className="font-black text-[8px] uppercase border-primary/20 bg-primary/5 text-primary h-4 px-1.5">
                                                {opt.mainValue}
                                            </Badge>
                                        </div>

                                        {/* Visual Reference */}
                                        <div className="col-span-2 flex justify-center">
                                            {opt.mainImage ? (
                                                <div className="h-12 w-12 bg-white rounded-lg border-2 border-border/60 p-1 shadow-inner">
                                                    <img 
                                                        src={opt.mainImage} 
                                                        alt={opt.label} 
                                                        className="w-full h-full object-contain" 
                                                    />
                                                </div>
                                            ) : (
                                                <div className="h-12 w-12 bg-muted/30 rounded-lg border-2 border-dashed border-border/60 flex items-center justify-center text-muted-foreground text-[8px] font-black uppercase text-center p-1 opacity-40 leading-tight">
                                                    NO REF
                                                </div>
                                            )}
                                        </div>

                                        {/* Checklist */}
                                        <div className="col-span-3 space-y-2">
                                            <div 
                                                className={cn(
                                                    "flex items-center space-x-2 p-1.5 rounded-lg border-2 transition-all cursor-pointer",
                                                    optionChecks[`${opt.id}-main`] ? "bg-emerald-50 border-emerald-500/30" : "bg-muted/5 border-transparent hover:border-border"
                                                )}
                                                onClick={() => handleCheck(`${opt.id}-main`, !optionChecks[`${opt.id}-main`])}
                                            >
                                                <Checkbox 
                                                    id={`check-${opt.id}-main`}
                                                    checked={optionChecks[`${opt.id}-main`] || false}
                                                    className="size-3.5 pointer-events-none"
                                                />
                                                <Label className="cursor-pointer text-[10px] font-black uppercase tracking-tight flex-1 pointer-events-none">
                                                    {opt.label} Confirmed
                                                </Label>
                                            </div>

                                            {opt.hashwaValue && (
                                                <div className="flex items-center gap-2 p-1.5 rounded-lg border-2 border-dashed bg-primary/5 border-primary/20">
                                                    <Checkbox 
                                                        id={`check-${opt.id}-hashwa`}
                                                        checked={optionChecks[`${opt.id}-hashwa`] || false}
                                                        onCheckedChange={(c) => handleCheck(`${opt.id}-hashwa`, c as boolean)}
                                                        className="size-3.5"
                                                    />
                                                    <div className="flex items-center gap-1.5 flex-1">
                                                        <Label htmlFor={`check-${opt.id}-hashwa`} className="cursor-pointer text-[9px] font-bold uppercase tracking-widest text-primary/80">
                                                            Hashwa:
                                                        </Label>
                                                        <span className="font-black text-[10px] text-primary">{opt.hashwaValue}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Local Notes for Style */}
                                        <div className="col-span-2">
                                            <div className="flex items-center gap-2 bg-muted/30 rounded-lg px-2 border border-transparent focus-within:border-border focus-within:bg-background transition-all">
                                                <MessageSquare className="size-3 text-muted-foreground/40" />
                                                <Input 
                                                    className="border-none shadow-none focus-visible:ring-0 bg-transparent text-[9px] font-bold h-8 p-0"
                                                    placeholder="Note..."
                                                    value={optionNotes[opt.id] || ""}
                                                    onChange={(e) => handleOptionNoteChange(opt.id, e.target.value)}
                                                />
                                            </div>
                                        </div>

                                        {/* Capture Actions */}
                                        <div className="col-span-2 flex justify-end gap-2">
                                            {evidence[opt.id] ? (
                                                <div className="relative group size-12 rounded-lg overflow-hidden border-2 border-primary/30 shadow-md">
                                                    {evidence[opt.id]?.type === 'photo' ? (
                                                        <img src={evidence[opt.id]?.url} alt="Captured" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <video src={evidence[opt.id]?.url} className="w-full h-full object-cover" />
                                                    )}
                                                    <button 
                                                        onClick={() => setEvidence(prev => { const n = {...prev}; delete n[opt.id]; return n; })}
                                                        className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <X className="w-4 h-4 text-white" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-1 w-full">
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        className="h-7 text-[8px] font-black uppercase tracking-widest border-2 w-full justify-start px-2"
                                                        onClick={() => document.getElementById(`file-photo-${opt.id}`)?.click()}
                                                    >
                                                        <Camera className="w-3 h-3 mr-1.5" />
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

            </TabsContent>
          </Tabs>

          {/* FINAL ACTIONS CONTROL PANEL - ORDER LEVEL */}
          <Card className="border-2 border-primary shadow-xl shadow-primary/5 rounded-3xl overflow-hidden py-0 gap-0">
              <CardHeader className="bg-primary/5 border-b-2 border-primary/10 p-6">
                  <div className="flex items-center gap-4">
                      <div className="p-2.5 bg-primary text-primary-foreground rounded-xl shadow-lg">
                          <Check className="w-5 h-5" />
                      </div>
                      <div>
                          <CardTitle className="text-xl font-black uppercase tracking-tight">Order Finalization</CardTitle>
                          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Record overall feedback and decide next steps for the order</p>
                      </div>
                  </div>
              </CardHeader>
              <CardContent className="p-6 space-y-8">
                  
                  {/* 1. Customer Satisfaction */}
                  <div className="space-y-4">
                      <div className="flex items-center gap-2">
                          <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground ml-1">Customer Satisfaction</Label>
                          <Separator className="flex-1" />
                      </div>
                      <RadioGroup 
                          value={satisfaction || ""} 
                          onValueChange={setSatisfaction}
                          className="flex flex-wrap gap-3 justify-between"
                      >
                          {SATISFACTION_LEVELS.map((level) => (
                              <div key={level.value} className="flex-1 min-w-[100px]">
                                  <RadioGroupItem value={level.value} id={`sat-${level.value}`} className="peer sr-only" />
                                  <Label
                                      htmlFor={`sat-${level.value}`}
                                      className={cn(
                                          "flex flex-col items-center justify-center gap-2 h-20 rounded-2xl border-2 border-border bg-card p-3 cursor-pointer transition-all shadow-sm",
                                          level.color
                                      )}
                                  >
                                      <span className="text-2xl">{level.emoji}</span>
                                      <span className="font-black uppercase tracking-widest text-[8px]">{level.label}</span>
                                  </Label>
                              </div>
                          ))}
                      </RadioGroup>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {/* 2. Brova Action */}
                      <div className="space-y-4">
                          <div className="flex items-center gap-2">
                              <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground ml-1">Brova Status</Label>
                              <Separator className="flex-1" />
                          </div>
                          <RadioGroup 
                              value={brovaAction || ""} 
                              onValueChange={setBrovaAction}
                              className="grid grid-cols-2 gap-3"
                          >
                              {BROVA_ACTION_OPTIONS.map((opt) => (
                                  <div key={opt.value}>
                                      <RadioGroupItem value={opt.value} id={`brova-${opt.value}`} className="peer sr-only" />
                                      <Label
                                          htmlFor={`brova-${opt.value}`}
                                          className={cn(
                                              "flex items-center justify-center h-12 rounded-xl border-2 border-border bg-card px-3 cursor-pointer transition-all shadow-sm font-black uppercase tracking-tight text-[10px] text-center",
                                              opt.color
                                          )}
                                      >
                                          {opt.label}
                                      </Label>
                                  </div>
                              ))}
                          </RadioGroup>
                          
                          <div className="pt-1">
                              <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground ml-1 block mb-1.5">Brova Notes*</Label>
                              <Textarea 
                                  placeholder="Add specific notes about the brova session..."
                                  className="min-h-[80px] rounded-xl border-2 resize-none font-bold text-sm"
                                  value={orderNotes}
                                  onChange={(e) => setOrderNotes(e.target.value)}
                              />
                          </div>
                      </div>

                      {/* 3. Order Distribution */}
                      <div className="space-y-4">
                          <div className="flex items-center gap-2">
                              <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground ml-1">Brova - Order Action</Label>
                              <Separator className="flex-1" />
                          </div>
                          <RadioGroup 
                              value={distributionAction || ""} 
                              onValueChange={setDistributionAction}
                              className="flex flex-col gap-3"
                          >
                              {ORDER_DISTRIBUTION_OPTIONS.map((opt) => {
                                  const isDisabled = !!(brovaAction && brovaAction !== "accepted" && opt.value !== "workshop");
                                  return (
                                      <div key={opt.value}>
                                          <RadioGroupItem 
                                              value={opt.value} 
                                              id={`dist-${opt.value}`} 
                                              className="peer sr-only" 
                                              disabled={isDisabled}
                                          />
                                          <Label
                                              htmlFor={`dist-${opt.value}`}
                                              className={cn(
                                                  "flex items-center gap-3 h-14 rounded-xl border-2 border-border bg-card px-4 cursor-pointer transition-all shadow-sm peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5",
                                                  isDisabled && "opacity-40 cursor-not-allowed grayscale"
                                              )}
                                          >
                                              <div className="p-1.5 bg-muted rounded-lg group-peer-data-[state=checked]:bg-primary/10">
                                                  <opt.icon className="w-4 h-4 text-muted-foreground" />
                                              </div>
                                              <span className="font-black uppercase tracking-widest text-[10px] flex-1">{opt.label}</span>
                                              {isDisabled && <Badge variant="secondary" className="text-[7px] font-black">UNAVAILABLE</Badge>}
                                          </Label>
                                      </div>
                                  );
                              })}
                          </RadioGroup>
                      </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="flex justify-end pt-1">
                      <Button 
                          onClick={onConfirmClick} 
                          disabled={!satisfaction || !brovaAction || !distributionAction || isSubmitting}
                          className="w-full md:w-auto h-14 min-w-[240px] font-black uppercase tracking-widest shadow-xl shadow-primary/20 text-base rounded-2xl"
                      >
                          {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                          Finalize Feedback
                      </Button>
                  </div>

              </CardContent>
          </Card>

          <ConfirmationDialog
              isOpen={isConfirmDialogOpen}
              onClose={() => setIsConfirmDialogOpen(false)}
              onConfirm={handleSave}
              title="Confirm Feedback Submission"
              description={`You are about to save the feedback for order #${activeOrder.id}. Action: ${ORDER_DISTRIBUTION_OPTIONS.find(o => o.value === distributionAction)?.label}`}
              confirmText="Submit Feedback"
              cancelText="Go Back"
          />

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
            <p className="text-muted-foreground font-medium uppercase tracking-widest text-[10px] mt-2">Enter an identifier or search for a customer to begin providing feedback</p>
        </motion.div>
      )}

      {/* Customer Selection Dialog */}
      <ErrorBoundary>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogContent className="!w-[95vw] sm:!w-[80vw] md:!w-[70vw] lg:!w-[55vw] !max-w-2xl max-h-[85vh] p-0 overflow-hidden border-none shadow-2xl rounded-3xl">
                    <div className="bg-primary p-6 text-primary-foreground relative">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-white/20 backdrop-blur-md rounded-2xl">
                          <RefreshCw className="w-7 h-7" />
                        </div>
                        <div>
                          <DialogTitle className="text-2xl font-black uppercase tracking-tight leading-none mb-1">
                            Select Order
                          </DialogTitle>
                          <p className="text-xs font-bold opacity-80 uppercase tracking-widest">
                            Choose an active order to begin feedback
                          </p>
                        </div>
                      </div>
                      <div className="absolute top-6 right-6 opacity-10">
                         <Package className="w-24 h-24" />
                      </div>
                    </div>
            
                    <div className="p-4 overflow-y-auto max-h-[60vh] bg-muted/30">
                      <div className="grid gap-3">
                        {customerOrders.map((order) => (
                          <button
                            key={order.id}
                            onClick={() => handleSelectOrder(order)}
                            className="group relative flex items-center justify-between gap-4 p-5 rounded-2xl border-2 border-transparent bg-card hover:bg-primary/5 hover:border-primary/30 transition-all duration-300 text-left shadow-sm hover:shadow-md"
                          >
                            <div className="flex items-center gap-6">
                              {/* ID Tag */}
                              <div className="flex flex-col items-center justify-center size-14 bg-primary/5 rounded-2xl group-hover:bg-primary group-hover:text-primary-foreground transition-colors border border-primary/10">
                                <span className="text-[10px] font-black uppercase leading-none mb-1 opacity-60 group-hover:opacity-80">Order</span>
                                <span className="text-lg font-black leading-none">{order.id}</span>
                              </div>
            
                              {/* Order Details */}
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center gap-2">
                                   <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-none">Invoice</span>
                                   <Badge variant="outline" className="h-5 px-2 text-[10px] font-black bg-background border-primary/20 text-primary">
                                      #{order.invoice_number ?? "N/A"}
                                   </Badge>
                                </div>
                                <div className="flex items-center gap-2">
                                   <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                      <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                      {order.production_stage?.replace(/_/g, " ") ?? "IN PRODUCTION"}
                                   </span>
                                </div>
                              </div>
                            </div>
            
                            {/* Meta Info */}
                            <div className="flex items-center gap-6">
                               <div className="hidden sm:flex flex-col items-end">
                                  <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest leading-none mb-1.5 opacity-60">Composition</span>
                                  <div className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded-lg border border-border/40">
                                     <Package className="w-3 h-3 text-muted-foreground" />
                                     <span className="text-[10px] font-black uppercase">{order.garments?.length || 0} Pieces</span>
                                  </div>
                               </div>
            
                               <div className="flex flex-col items-end">
                                  <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest leading-none mb-1.5 opacity-60">Delivery</span>
                                  <div className="flex items-center gap-2 text-primary font-black text-xs">
                                     <Clock className="w-3.5 h-3.5" />
                                     {order.delivery_date ? format(new Date(order.delivery_date), "MMM d") : "NOT SET"}
                                  </div>
                               </div>
            
                               <div className="p-2 rounded-full bg-muted group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                  <Save className="w-5 h-5 opacity-40 group-hover:opacity-100" />
                               </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
            
                    <div className="p-4 border-t border-border bg-background flex justify-between items-center">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                            {customerOrders.length} Available Orders for this customer
                        </p>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="font-black uppercase tracking-widest text-[10px] h-8 rounded-lg"
                            onClick={() => setIsDialogOpen(false)}
                        >
                            Cancel
                        </Button>
                    </div>
                  </DialogContent>
                </Dialog>
      </ErrorBoundary>
    </motion.div>
  );
}