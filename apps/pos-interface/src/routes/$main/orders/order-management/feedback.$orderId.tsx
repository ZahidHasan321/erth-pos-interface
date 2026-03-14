"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
  MessageSquare,
  PenTool,
  AlertCircle,
  CreditCard,
  Banknote,
  ArrowLeft,
  ArrowUp,
  Loader2,
  Mic,
  MicOff,
  ChevronDown,
  History,
  Home,
  MapPin,
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SignaturePad } from "@/components/forms/signature-pad";

// API and Types
import { getOrderById, updateOrder } from "@/api/orders";
import { getMeasurementById } from "@/api/measurements";
import { updateGarment } from "@/api/garments";
import { createFeedback, getFeedbackByGarmentId } from "@/api/feedback";
import type { Measurement, Order, Garment, Customer, GarmentFeedback } from "@repo/database";
import { evaluateBrovaFeedback } from "@repo/database";

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
  "/$main/orders/order-management/feedback/$orderId"
)({
  component: UnifiedFeedbackInterface,
  validateSearch: (search: Record<string, unknown>): { garmentId?: string } => ({
    garmentId: typeof search.garmentId === "string" ? search.garmentId : undefined,
  }),
  head: () => ({
    meta: [{ title: "Order Feedback" }],
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
  { value: "angry", label: "Angry", emoji: "\u{1F621}", numericValue: 1, color: "hover:bg-red-50 peer-data-[state=checked]:bg-red-100 peer-data-[state=checked]:border-red-500 text-red-600" },
  { value: "sad", label: "Unhappy", emoji: "\u{1F61E}", numericValue: 2, color: "hover:bg-orange-50 peer-data-[state=checked]:bg-orange-100 peer-data-[state=checked]:border-orange-500 text-orange-600" },
  { value: "neutral", label: "Okay", emoji: "\u{1F636}", numericValue: 3, color: "hover:bg-yellow-50 peer-data-[state=checked]:bg-yellow-100 peer-data-[state=checked]:border-yellow-500 text-yellow-600" },
  { value: "happy", label: "Happy", emoji: "\u{1F60A}", numericValue: 4, color: "hover:bg-green-50 peer-data-[state=checked]:bg-green-100 peer-data-[state=checked]:border-green-500 text-green-600" },
  { value: "very_happy", label: "Love It", emoji: "\u{1F929}", numericValue: 5, color: "hover:bg-emerald-50 peer-data-[state=checked]:bg-emerald-100 peer-data-[state=checked]:border-emerald-500 text-emerald-600" },
];

const BROVA_FEEDBACK_OPTIONS = [
  { value: "accepted", label: "Accept", color: "peer-data-[state=checked]:bg-emerald-50 peer-data-[state=checked]:text-emerald-700 peer-data-[state=checked]:border-emerald-500" },
  { value: "needs_repair_accepted", label: "Accept with Fix", color: "peer-data-[state=checked]:bg-yellow-50 peer-data-[state=checked]:text-yellow-700 peer-data-[state=checked]:border-yellow-500" },
  { value: "needs_repair_rejected", label: "Reject - Repair", color: "peer-data-[state=checked]:bg-amber-50 peer-data-[state=checked]:text-amber-700 peer-data-[state=checked]:border-amber-500" },
  { value: "needs_redo", label: "Reject - Redo", color: "peer-data-[state=checked]:bg-red-50 peer-data-[state=checked]:text-red-700 peer-data-[state=checked]:border-red-500" },
];

const FINAL_FEEDBACK_OPTIONS = [
  { value: "accepted", label: "Accepted", color: "peer-data-[state=checked]:bg-emerald-50 peer-data-[state=checked]:text-emerald-700 peer-data-[state=checked]:border-emerald-500" },
  { value: "needs_repair", label: "Needs Repair", color: "peer-data-[state=checked]:bg-amber-50 peer-data-[state=checked]:text-amber-700 peer-data-[state=checked]:border-amber-500" },
  { value: "needs_redo", label: "Needs Redo", color: "peer-data-[state=checked]:bg-red-50 peer-data-[state=checked]:text-red-700 peer-data-[state=checked]:border-red-500" },
];

const DIFFERENCE_REASONS = [
  { label: "Customer Request", color: "text-emerald-600 bg-emerald-50" },
  { label: "Workshop Error", color: "text-red-600 bg-red-50" },
  { label: "Shop Error", color: "text-muted-foreground bg-muted/50" },
];

// --- Types ---

interface GarmentFeedbackState {
  workshopMeasurements: Record<string, number | "">;
  feedbackMeasurements: Record<string, number | "">;
  differenceReasons: Record<string, string>;
  measurementNotes: Record<string, string>;
  optionNotes: Record<string, string>;
  optionChecks: Record<string, boolean>;
  evidence: Record<string, { type: "photo" | "video"; url: string } | null>;
  voiceNotes: Record<string, string | null>;
  satisfaction: string | null;
  feedbackAction: string | null;
  distributionAction: string | null;
  isInvestigationNeeded: boolean;
  customerSignature: string | null;
  notes: string;
  submitted: boolean;
}

const createEmptyGarmentState = (): GarmentFeedbackState => ({
  workshopMeasurements: {},
  feedbackMeasurements: {},
  differenceReasons: {},
  measurementNotes: {},
  optionNotes: {},
  optionChecks: {},
  evidence: {},
  voiceNotes: {},
  satisfaction: null,
  feedbackAction: null,
  distributionAction: null,
  isInvestigationNeeded: false,
  customerSignature: null,
  notes: "",
  submitted: false,
});

interface OrderWithDetails extends Order {
    customer?: Customer;
    garments?: Garment[];
}

// --- Main Component ---

function UnifiedFeedbackInterface() {
  const { orderId: rawOrderId } = Route.useParams();
  const { garmentId: deepLinkGarmentId } = Route.useSearch();
  const paramOrderId = Number(rawOrderId);
  const router = useRouter();

  // Active Data State
  const [activeOrder, setActiveOrder] = useState<OrderWithDetails | null>(null);
  const [isLoadingOrder, setIsLoadingOrder] = useState(false);
  const [selectedGarmentId, setSelectedGarmentId] = useState<string | null>(null);

  // Per-garment feedback state
  const [garmentStates, setGarmentStates] = useState<Record<string, GarmentFeedbackState>>({});

  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [isProductionConfirmOpen, setIsProductionConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStartingProduction, setIsStartingProduction] = useState(false);

  // Voice recording state
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recordingOptionId, setRecordingOptionId] = useState<string | null>(null);

  // Previous feedback history
  const [historyOpen, setHistoryOpen] = useState(false);

  // Helpers for per-garment state
  const getGarmentState = useCallback((id: string | null): GarmentFeedbackState => {
    if (!id) return createEmptyGarmentState();
    return garmentStates[id] || createEmptyGarmentState();
  }, [garmentStates]);

  const updateGarmentState = useCallback((id: string | null, partial: Partial<GarmentFeedbackState>) => {
    if (!id) return;
    setGarmentStates(prev => ({
      ...prev,
      [id]: { ...(prev[id] || createEmptyGarmentState()), ...partial },
    }));
  }, []);

  // Current garment state shortcuts
  const currentState = getGarmentState(selectedGarmentId);

  const activeGarment = useMemo(() =>
    activeOrder?.garments?.find(g => g.id === selectedGarmentId),
    [activeOrder, selectedGarmentId]
  );

  // Derive activeTab from garment type
  const activeTab = activeGarment?.garment_type === "brova" ? "brova" : "final";

  // 1. Garment Selection Effect
  useEffect(() => {
    if (activeOrder?.garments?.length) {
      // Honour deep-link garmentId if provided and garment is at shop
      if (deepLinkGarmentId) {
        const linked = activeOrder.garments.find(g => g.id === deepLinkGarmentId);
        if (linked) {
          setSelectedGarmentId(linked.id);
          return;
        }
      }

      const shopGarments = activeOrder.garments.filter(g =>
        g.location === 'shop' && g.piece_stage !== 'completed'
      );

      if (shopGarments.length > 0) {
          setSelectedGarmentId(shopGarments[0].id);
      } else {
          setSelectedGarmentId(activeOrder.garments[0]?.id || null);
      }
    }
  }, [activeOrder, deepLinkGarmentId]);

  // Auto-set distribution when feedbackAction changes
  useEffect(() => {
    if (!currentState.feedbackAction) return;
    const isPositive = currentState.feedbackAction === "accepted";
    if (!isPositive) {
      // Repair/redo → must go to workshop
      updateGarmentState(selectedGarmentId, { distributionAction: "workshop" });
    }
  }, [currentState.feedbackAction, selectedGarmentId, updateGarmentState]);

  // 2. Measurement Query
  const measurementId = activeGarment?.measurement_id;
  const { data: measurementData, isLoading: isMeasurementLoading } = useQuery({
    queryKey: ["measurement", measurementId],
    queryFn: () => getMeasurementById(measurementId!),
    enabled: !!measurementId,
  });

  const measurement = measurementData?.data;

  // 3. Previous feedback history query
  const { data: feedbackHistoryData } = useQuery({
    queryKey: ["garment-feedback", selectedGarmentId],
    queryFn: () => getFeedbackByGarmentId(selectedGarmentId!),
    enabled: !!selectedGarmentId,
  });
  const feedbackHistory = feedbackHistoryData?.data || [];

  // Auto-load order from URL params
  useEffect(() => {
    if (paramOrderId && !activeOrder) {
      setIsLoadingOrder(true);
      getOrderById(paramOrderId, true)
        .then((res) => {
          if (res.status === "error" || !res.data) {
            toast.error("Order not found");
          } else {
            setActiveOrder(res.data);
          }
        })
        .catch(() => toast.error("Failed to load order"))
        .finally(() => setIsLoadingOrder(false));
    }
  }, [paramOrderId]);

  // --- Handlers ---

  const handleWorkshopMeasurementChange = (key: string, value: string) => {
    const numValue = value === "" ? "" : parseFloat(value);
    updateGarmentState(selectedGarmentId, {
      workshopMeasurements: { ...currentState.workshopMeasurements, [key]: numValue },
    });
  };

  const handleFeedbackMeasurementChange = (key: string, value: string) => {
    const numValue = value === "" ? "" : parseFloat(value);
    updateGarmentState(selectedGarmentId, {
      feedbackMeasurements: { ...currentState.feedbackMeasurements, [key]: numValue },
    });
  };

  const handleDifferenceReasonChange = (key: string, value: string) => {
    updateGarmentState(selectedGarmentId, {
      differenceReasons: { ...currentState.differenceReasons, [key]: value },
    });
  };

  const handleMeasurementNoteChange = (key: string, value: string) => {
    updateGarmentState(selectedGarmentId, {
      measurementNotes: { ...currentState.measurementNotes, [key]: value },
    });
  };

  const handleOptionNoteChange = (key: string, value: string) => {
    updateGarmentState(selectedGarmentId, {
      optionNotes: { ...currentState.optionNotes, [key]: value },
    });
  };

  const handleCheck = (key: string, checked: boolean) => {
    updateGarmentState(selectedGarmentId, {
      optionChecks: { ...currentState.optionChecks, [key]: checked },
    });
  };

  const handleCapture = (optionId: string, type: "photo" | "video", file: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    updateGarmentState(selectedGarmentId, {
      evidence: { ...currentState.evidence, [optionId]: { type, url } },
    });
    toast.success(`${type === 'photo' ? 'Photo' : 'Video'} captured`);
  };

  // Voice recording handlers
  const startRecording = async (optionId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        updateGarmentState(selectedGarmentId, {
          voiceNotes: { ...currentState.voiceNotes, [optionId]: url },
        });
        stream.getTracks().forEach(t => t.stop());
        setRecordingOptionId(null);
        toast.success("Voice note recorded");
      };

      mediaRecorder.start();
      setRecordingOptionId(optionId);
    } catch {
      toast.error("Could not access microphone");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const removeVoiceNote = (optionId: string) => {
    updateGarmentState(selectedGarmentId, {
      voiceNotes: { ...currentState.voiceNotes, [optionId]: null },
    });
  };

  const handleStartProduction = async () => {
    if (!activeOrder) return;
    const finalsToRelease = activeOrder.garments?.filter(
      g => g.garment_type === "final" && g.piece_stage === "waiting_for_acceptance"
    ) || [];
    if (finalsToRelease.length === 0) return;

    setIsStartingProduction(true);
    try {
      for (const final of finalsToRelease) {
        await updateGarment(final.id, { piece_stage: "waiting_cut" });
      }
      toast.success(`${finalsToRelease.length} final(s) released to production!`);
      setActiveOrder(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          garments: prev.garments?.map(g =>
            g.garment_type === "final" && g.piece_stage === "waiting_for_acceptance"
              ? { ...g, piece_stage: "waiting_cut" as any }
              : g
          ),
        };
      });
    } catch {
      toast.error("Failed to release finals to production");
    } finally {
      setIsStartingProduction(false);
    }
  };

  const onConfirmClick = () => {
    if (!currentState.satisfaction || !currentState.feedbackAction || !currentState.distributionAction) {
        toast.error("Please complete all feedback sections");
        return;
    }
    if (activeTab === "brova" && !currentState.customerSignature) {
        toast.error("Customer signature is required for Brova feedback");
        return;
    }
    setIsConfirmDialogOpen(true);
  };

  const handleSave = async () => {
    if (!activeOrder || !selectedGarmentId || !activeGarment || !currentState.feedbackAction) return;

    setIsConfirmDialogOpen(false);
    setIsSubmitting(true);

    try {
        const state = currentState;

        if (activeGarment.garment_type === "brova") {
            const allBrovas = activeOrder.garments?.filter(g => g.garment_type === "brova") || [];
            const result = evaluateBrovaFeedback(
                state.feedbackAction as any,
                allBrovas.map(b => ({ id: b.id, piece_stage: b.piece_stage as any, acceptance_status: (b as any).acceptance_status })),
                activeGarment.id
            );

            const updatePayload: any = {
                piece_stage: result.newStage,
                acceptance_status: result.acceptanceStatus,
            };

            if (state.distributionAction === "workshop") {
                updatePayload.location = "transit_to_workshop";
                updatePayload.trip_number = (activeGarment.trip_number || 1) + 1;
            } else {
                updatePayload.location = "shop";
            }

            await updateGarment(activeGarment.id, updatePayload);

            if (result.message) {
                toast.info(result.message);
            }
        } else {
            const updatePayload: any = {};

            if (state.feedbackAction === "accepted") {
                // Final accepted — mark completed, fulfillment from order-level delivery type
                const isHomeDelivery = (activeOrder as any).home_delivery;
                updatePayload.piece_stage = "completed";
                updatePayload.fulfillment_type = isHomeDelivery ? "delivered" : "collected";
                updatePayload.acceptance_status = true;
            } else {
                updatePayload.piece_stage = state.feedbackAction;
                updatePayload.acceptance_status = false;
            }

            if (state.distributionAction === "workshop") {
                updatePayload.location = "transit_to_workshop";
                updatePayload.trip_number = (activeGarment.trip_number || 1) + 1;
            } else {
                updatePayload.location = "shop";
            }

            await updateGarment(activeGarment.id, updatePayload);
        }

        // Build measurement diffs JSON
        const measurementDiffs = MEASUREMENT_ROWS
          .filter(row => {
            const orderVal = measurement ? (measurement[row.key as keyof Measurement] as number | null) : null;
            const fbVal = state.feedbackMeasurements[row.key];
            return orderVal != null && fbVal !== "" && fbVal !== undefined;
          })
          .map(row => ({
            field: row.key,
            original_value: measurement ? (measurement[row.key as keyof Measurement] as number | null) : null,
            actual_value: state.feedbackMeasurements[row.key],
            difference: getDifference(
              measurement ? (measurement[row.key as keyof Measurement] as number | null) : null,
              state.feedbackMeasurements[row.key]
            ),
            reason: state.differenceReasons[row.key] || null,
          }));

        // Build options checklist JSON
        const optionsChecklist = optionRows.map(opt => ({
          option_name: opt.id,
          expected_value: opt.mainValue,
          actual_correct: state.optionChecks[`${opt.id}-main`] || false,
          notes: state.optionNotes[opt.id] || null,
        }));

        // Get satisfaction numeric value
        const satLevel = SATISFACTION_LEVELS.find(s => s.value === state.satisfaction);

        // Determine feedback type
        const feedbackType = activeGarment.garment_type === "brova" ? "brova_trial" : "final_collection";

        // Save feedback record to DB
        await createFeedback({
          garment_id: activeGarment.id,
          order_id: activeOrder.id,
          feedback_type: feedbackType,
          trip_number: activeGarment.trip_number || 1,
          action: state.feedbackAction ?? undefined,
          previous_stage: (activeGarment.piece_stage ?? undefined) as string | undefined,
          satisfaction_level: satLevel?.numericValue || null,
          measurement_diffs: measurementDiffs.length > 0 ? JSON.stringify(measurementDiffs) : null,
          options_checklist: optionsChecklist.length > 0 ? JSON.stringify(optionsChecklist) : null,
          customer_signature: state.customerSignature || null,
          photo_urls: Object.values(state.evidence).filter(Boolean).length > 0
            ? JSON.stringify(Object.values(state.evidence).filter(Boolean).map(e => e!.url))
            : null,
          voice_note_urls: Object.keys(state.voiceNotes).length > 0 ? JSON.stringify(state.voiceNotes) : null,
          notes: state.notes || null,
          difference_reasons: Object.keys(state.differenceReasons).length > 0
            ? JSON.stringify(state.differenceReasons)
            : null,
        });

        // Mark garment as submitted in local state
        updateGarmentState(selectedGarmentId, { submitted: true });

        toast.success(`Feedback Logged`, {
            description: `Garment ${activeGarment.garment_id || activeGarment.id} submitted`
        });

        // Balance check for final collection
        const balance = (Number(activeOrder?.order_total) || 0) - (Number(activeOrder?.paid) || 0);

        if (state.feedbackAction === "accepted" && activeGarment.garment_type === "final") {
             if (balance > 0) {
                 toast.info("Order has pending balance. Please collect payment.");
             }
        }

        // Stay on page - don't navigate away. User can submit other garments.
    } catch (err) {
        console.error(err);
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

  const findOptionImage = (list: BaseOption[], val: string | undefined | null) => {
    if (!val) return null;
    return list.find(o => o.value === val || o.displayText === val)?.image;
  };

  const optionRows = useMemo(() => {
    if (!activeGarment) return [];
    const g = activeGarment;

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

  if (isLoadingOrder) {
    return (
      <div className="container mx-auto p-4 md:p-6 max-w-7xl flex flex-col items-center justify-center py-32 gap-4">
        <Loader2 className="size-8 text-primary/40 animate-spin" />
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Loading order...</p>
      </div>
    );
  }

  if (!activeOrder) {
    return (
      <div className="container mx-auto p-4 md:p-6 max-w-7xl flex flex-col items-center justify-center py-32 text-center">
        <div className="size-24 bg-muted/30 rounded-full flex items-center justify-center mb-8 border-2 border-dashed border-border shadow-inner">
          <Package className="w-10 h-10 text-muted-foreground/40" />
        </div>
        <h3 className="text-2xl font-black text-foreground uppercase tracking-tight">Order Not Found</h3>
        <p className="text-muted-foreground font-medium uppercase tracking-widest text-[10px] mt-2">This order could not be loaded</p>
        <Button variant="outline" className="mt-6 font-bold" onClick={() => router.history.back()}>
          <ArrowLeft className="size-3.5 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-3 md:p-5 max-w-5xl space-y-4 pb-20">

      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border pb-3">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => router.history.back()}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-foreground">
            Order <span className="text-primary">Feedback</span>
          </h1>
          <span className="text-sm text-muted-foreground font-medium">
            #{activeOrder.id} &bull; {activeOrder.customer?.name || "Guest"}
          </span>
          {activeTab === "brova" && (
            <Badge variant="outline" className="text-[9px] font-black uppercase bg-amber-50 text-amber-700 border-amber-200">Brova Trial</Badge>
          )}
          {activeTab === "final" && (
            <Badge variant="outline" className="text-[9px] font-black uppercase bg-emerald-50 text-emerald-700 border-emerald-200">Final / Pickup</Badge>
          )}
        </div>
      </div>

      <div className="space-y-4">
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

                {/* Financial Status */}
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg">
                            <Banknote className="w-3.5 h-3.5" />
                        </div>
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground leading-none mb-1">Total Paid</p>
                            <p className="font-black text-sm leading-none text-emerald-700">{activeOrder.paid || 0} KWD</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "p-1.5 rounded-lg",
                            (activeOrder.order_total || 0) - (activeOrder.paid || 0) > 0 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                        )}>
                            <CreditCard className="w-3.5 h-3.5" />
                        </div>
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground leading-none mb-1">Balance</p>
                            <p className={cn(
                                "font-black text-sm leading-none",
                                (activeOrder.order_total || 0) - (activeOrder.paid || 0) > 0 ? "text-red-700" : "text-emerald-700"
                            )}>
                                {((activeOrder.order_total || 0) - (activeOrder.paid || 0)).toFixed(3)} KWD
                            </p>
                        </div>
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
                        <span className="text-[10px] font-bold text-primary opacity-70">INV: {activeOrder.invoice_number || "\u2014"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="hidden lg:block h-6 w-px bg-border/60" />

                {/* Delivery Type */}
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-1.5 rounded-lg",
                    (activeOrder as any).home_delivery ? "bg-indigo-100 text-indigo-700" : "bg-muted text-muted-foreground"
                  )}>
                    {(activeOrder as any).home_delivery ? <Home className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />}
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground leading-none mb-1">Delivery</p>
                    <p className={cn(
                      "font-black text-sm leading-none",
                      (activeOrder as any).home_delivery ? "text-indigo-700" : "text-foreground"
                    )}>
                      {(activeOrder as any).home_delivery ? "Home Delivery" : "Pickup"}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ═══ ORDER-LEVEL ACTIONS ═══ */}
          {/* ORDER-LEVEL: START PRODUCTION */}
          {(() => {
            const blockedFinals = activeOrder.garments?.filter(
              g => g.garment_type === "final" && g.piece_stage === "waiting_for_acceptance"
            ) || [];
            const anyBrovaAccepted = activeOrder.garments?.some(
              g => g.garment_type === "brova" && (g.acceptance_status === true || g.piece_stage === "accepted")
            );
            if (blockedFinals.length === 0) return null;
            return (
              <Card className="border border-primary/20 bg-primary/5 rounded-xl overflow-hidden">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="p-1.5 bg-primary/10 text-primary rounded-lg shrink-0">
                    <Package className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-xs uppercase tracking-tight leading-none">Start Final Production</p>
                    <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">
                      {blockedFinals.length} final(s) waiting &bull; {anyBrovaAccepted ? "Ready" : "Awaiting brova"}
                    </p>
                  </div>
                  <Button
                    disabled={!anyBrovaAccepted || isStartingProduction}
                    onClick={() => setIsProductionConfirmOpen(true)}
                    className="font-bold uppercase tracking-widest shrink-0 h-9 text-xs"
                    size="sm"
                  >
                    {isStartingProduction ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                    Release
                  </Button>
                </CardContent>
              </Card>
            );
          })()}

          {/* ORDER-LEVEL: DELIVERY TYPE */}
          <Card className="border border-indigo-200 bg-indigo-50/30 rounded-xl overflow-hidden">
            <CardContent className="p-3 flex items-center gap-3">
              <div className={cn(
                "p-1.5 rounded-lg shrink-0",
                (activeOrder as any).home_delivery ? "bg-indigo-100 text-indigo-700" : "bg-muted text-muted-foreground"
              )}>
                {(activeOrder as any).home_delivery ? <Home className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-xs uppercase tracking-tight leading-none">Delivery Type</p>
                <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">Order level</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={async () => {
                    if ((activeOrder as any).home_delivery) {
                      await updateOrder({ home_delivery: false } as any, activeOrder.id);
                      setActiveOrder(prev => prev ? { ...prev, home_delivery: false } as any : prev);
                      toast.success("Switched to Customer Pickup");
                    }
                  }}
                  className={cn(
                    "flex items-center gap-1.5 h-9 px-3 rounded-lg border font-bold uppercase tracking-tight text-[10px] transition-all",
                    !(activeOrder as any).home_delivery
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/30"
                  )}
                >
                  <MapPin className="w-3 h-3" />
                  Pickup
                </button>
                <button
                  onClick={async () => {
                    if (!(activeOrder as any).home_delivery) {
                      await updateOrder({ home_delivery: true } as any, activeOrder.id);
                      setActiveOrder(prev => prev ? { ...prev, home_delivery: true } as any : prev);
                      toast.success("Switched to Home Delivery. Delivery charge will be added.");
                    }
                  }}
                  className={cn(
                    "flex items-center gap-1.5 h-9 px-3 rounded-lg border font-bold uppercase tracking-tight text-[10px] transition-all",
                    (activeOrder as any).home_delivery
                      ? "border-indigo-500 bg-indigo-100 text-indigo-700"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/30"
                  )}
                >
                  <Home className="w-3 h-3" />
                  Delivery
                </button>
              </div>
            </CardContent>
          </Card>

          <Separator className="opacity-50" />

          {/* ═══ GARMENT-LEVEL FEEDBACK ═══ */}
          {/* 3. Garment Selection Tabs */}
          <Tabs value={selectedGarmentId || ""} onValueChange={setSelectedGarmentId} className="w-full space-y-4">
            <div className="flex items-center justify-between overflow-x-auto pb-2 scrollbar-hide">
                <TabsList className="h-auto flex-nowrap justify-start gap-2 bg-transparent p-0">
                {activeOrder.garments?.filter(g =>
                    g.location === 'shop' && g.piece_stage !== 'completed'
                ).map((garment) => {
                    const gState = garmentStates[garment.id];
                    const isSubmitted = gState?.submitted;
                    return (
                    <TabsTrigger
                        key={garment.id}
                        value={garment.id}
                        className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=active]:border-primary border-2 border-border/60 bg-card px-3 py-1.5 h-12 min-w-[120px] rounded-xl transition-all"
                    >
                        <div className="text-left w-full space-y-0.5">
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-black text-[11px] truncate uppercase tracking-tighter">{garment.garment_id}</span>
                                <div className="flex items-center gap-1">
                                    {isSubmitted && (
                                        <div className="size-3.5 rounded-full bg-emerald-500 flex items-center justify-center">
                                            <Check className="size-2 text-white" />
                                        </div>
                                    )}
                                    <Badge
                                        className={cn(
                                            "h-3 px-1 text-[7px] font-black uppercase border-none",
                                            garment.garment_type === 'brova' && (garment.trip_number || 1) >= 3
                                                ? "bg-blue-100 text-blue-700 data-[state=active]:bg-blue-500 data-[state=active]:text-white"
                                                : garment.garment_type === 'brova'
                                                    ? "bg-amber-100 text-amber-700 data-[state=active]:bg-amber-500 data-[state=active]:text-white"
                                                    : "bg-emerald-100 text-emerald-700 data-[state=active]:bg-emerald-500 data-[state=active]:text-white"
                                        )}
                                    >
                                        {garment.garment_type === 'brova' && (garment.trip_number || 1) >= 3
                                            ? `Alt #${(garment.trip_number || 1) - 2}`
                                            : garment.garment_type === 'brova' ? "Brova" : "Final"}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    </TabsTrigger>
                    );
                })}
                </TabsList>
            </div>

            <TabsContent value={selectedGarmentId || ""} className="mt-0 space-y-4 focus-visible:ring-0">

                 {/* MEASUREMENT feedback SECTION */}
                <Card className="border border-border shadow-sm overflow-hidden rounded-xl py-0 gap-0">
                    <CardHeader className="bg-muted/30 border-b px-4 py-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="p-1.5 bg-primary text-primary-foreground rounded-lg">
                                    <Ruler className="w-4 h-4" />
                                </div>
                                <CardTitle className="text-base font-bold uppercase tracking-tight">Adjustment Log</CardTitle>
                            </div>
                            <Badge variant="outline" className="bg-background font-black text-[9px] h-6 px-2">
                                {isMeasurementLoading ? "SYNCING..." : "SYNCED"}
                            </Badge>
                        </div>
                    </CardHeader>

                    <div className="relative overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-muted/50 sticky top-0 z-10 border-b-2 border-border/60">
                                <TableRow className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                    <TableHead className="w-[12%] p-3">Dimension</TableHead>
                                    <TableHead className="text-center bg-muted/30 w-[10%] p-3">Order (in)</TableHead>
                                    <TableHead className="text-center w-[10%] bg-muted/30 p-3">QC (in)</TableHead>
                                    <TableHead className="text-center w-[12%] bg-primary/5 p-3">{activeTab === 'brova' ? 'Brova' : 'Final'} (in)</TableHead>
                                    <TableHead className="text-center w-[10%] p-3">Delta</TableHead>
                                    <TableHead className="text-center w-[15%] p-3">Reason</TableHead>
                                    <TableHead className="p-3">Adjustment Notes</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {MEASUREMENT_ROWS.map((row) => {
                                    const orderValue = measurement ? (measurement[row.key as keyof Measurement] as number | null) : undefined;
                                    const workshopValue = currentState.workshopMeasurements[row.key];
                                    const feedbackValue = currentState.feedbackMeasurements[row.key];
                                    const reasonValue = currentState.differenceReasons[row.key] || "";
                                    const noteValue = currentState.measurementNotes[row.key] || "";

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
                                                    {diffOrder !== null ? (
                                                            <Badge variant="secondary" className={cn(
                                                                "font-black text-[10px] h-6 px-1.5 shadow-sm",
                                                                statusOrder === 'success' && "bg-emerald-100 text-emerald-800 border-emerald-200",
                                                                statusOrder === 'warning' && "bg-amber-100 text-amber-800 border-amber-200",
                                                                statusOrder === 'error' && "bg-red-100 text-red-800 border-red-200"
                                                            )}>
                                                                {diffOrder > 0 ? `+${diffOrder}` : diffOrder}
                                                            </Badge>
                                                    ) : (
                                                        <span className="text-muted-foreground font-black text-[10px] opacity-20">{"\u2014"}</span>
                                                    )}
                                            </TableCell>
                                            <TableCell className="p-1.5">
                                                <Select value={reasonValue} onValueChange={(val) => handleDifferenceReasonChange(row.key, val)}>
                                                    <SelectTrigger className={cn(
                                                        "h-8 text-[10px] font-bold border-none shadow-none rounded-lg px-2 transition-colors",
                                                        selectedReason ? selectedReason.color : "bg-muted/20 hover:bg-muted/40"
                                                    )}>
                                                        <SelectValue placeholder="Select" />
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
                <Card className="border border-border shadow-sm rounded-xl overflow-hidden py-0 gap-0">
                    <CardHeader className="bg-muted/30 border-b px-4 py-3">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 bg-primary text-primary-foreground rounded-lg">
                                <Package className="w-4 h-4" />
                            </div>
                            <CardTitle className="text-base font-bold uppercase tracking-tight">Style Feedback</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="p-3">
                       <div className="space-y-3">
                            <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 bg-muted/50 rounded-xl text-[9px] font-black uppercase tracking-widest text-muted-foreground border border-border/40">
                                <div className="col-span-3">Configuration Item</div>
                                <div className="col-span-2 text-center">Reference</div>
                                <div className="col-span-3 text-center">Status</div>
                                <div className="col-span-2 text-center">Notes</div>
                                <div className="col-span-2 text-right">Evidence</div>
                            </div>

                                {optionRows.map((opt) => (
                                    <div
                                        key={opt.id}
                                        className="grid grid-cols-1 md:grid-cols-12 gap-3 p-3 rounded-xl border border-border/40 bg-card items-start md:items-center hover:border-primary/20 transition-all"
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
                                                    currentState.optionChecks[`${opt.id}-main`] ? "bg-emerald-50 border-emerald-500/30" : "bg-muted/5 border-transparent hover:border-border"
                                                )}
                                                onClick={() => handleCheck(`${opt.id}-main`, !currentState.optionChecks[`${opt.id}-main`])}
                                            >
                                                <Checkbox
                                                    id={`check-${opt.id}-main`}
                                                    checked={currentState.optionChecks[`${opt.id}-main`] || false}
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
                                                        checked={currentState.optionChecks[`${opt.id}-hashwa`] || false}
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
                                                    value={currentState.optionNotes[opt.id] || ""}
                                                    onChange={(e) => handleOptionNoteChange(opt.id, e.target.value)}
                                                />
                                            </div>
                                        </div>

                                        {/* Capture Actions (Photo + Voice) */}
                                        <div className="col-span-2 space-y-2">
                                            <div className="flex justify-end gap-2">
                                                {currentState.evidence[opt.id] ? (
                                                    <div className="relative group size-12 rounded-lg overflow-hidden border-2 border-primary/30 shadow-md">
                                                        {currentState.evidence[opt.id]?.type === 'photo' ? (
                                                            <img src={currentState.evidence[opt.id]?.url} alt="Captured" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <video src={currentState.evidence[opt.id]?.url} className="w-full h-full object-cover" />
                                                        )}
                                                        <button
                                                            onClick={() => updateGarmentState(selectedGarmentId, {
                                                                evidence: { ...currentState.evidence, [opt.id]: null },
                                                            })}
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
                                                        <Button
                                                            variant={recordingOptionId === opt.id ? "destructive" : "outline"}
                                                            size="sm"
                                                            className="h-7 text-[8px] font-black uppercase tracking-widest border-2 w-full justify-start px-2"
                                                            onClick={recordingOptionId === opt.id ? stopRecording : () => startRecording(opt.id)}
                                                        >
                                                            {recordingOptionId === opt.id ? (
                                                                <>
                                                                    <MicOff className="w-3 h-3 mr-1.5" />
                                                                    Stop
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Mic className="w-3 h-3 mr-1.5" />
                                                                    Voice
                                                                </>
                                                            )}
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
                                            {/* Per-option voice note playback */}
                                            {recordingOptionId === opt.id && (
                                                <div className="flex items-center gap-2 p-1.5 bg-red-50 rounded-lg border border-red-200">
                                                    <div className="size-2 rounded-full bg-red-500 animate-pulse" />
                                                    <span className="text-[8px] font-black uppercase tracking-widest text-red-700">Recording...</span>
                                                </div>
                                            )}
                                            {currentState.voiceNotes[opt.id] && (
                                                <div className="flex items-center gap-1">
                                                    <audio src={currentState.voiceNotes[opt.id]!} controls className="flex-1 h-6" />
                                                    <button
                                                        onClick={() => removeVoiceNote(opt.id)}
                                                        className="text-muted-foreground hover:text-destructive p-0.5"
                                                    >
                                                        <X className="size-3" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}

                       </div>
                    </CardContent>
                </Card>

                {/* PREVIOUS FEEDBACK HISTORY */}
                {feedbackHistory.length > 0 && (
                    <Card className="border border-border shadow-sm rounded-xl overflow-hidden py-0 gap-0">
                        <CardHeader
                            className="bg-muted/30 border-b px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                            onClick={() => setHistoryOpen(!historyOpen)}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-1.5 bg-primary/10 text-primary rounded-lg">
                                        <History className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-base font-bold uppercase tracking-tight">Previous Feedback</CardTitle>
                                        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
                                            {feedbackHistory.length} previous trip{feedbackHistory.length > 1 ? "s" : ""}
                                        </p>
                                    </div>
                                </div>
                                <ChevronDown className={cn("size-5 text-muted-foreground transition-transform", historyOpen && "rotate-180")} />
                            </div>
                        </CardHeader>
                        {historyOpen && (
                            <CardContent className="p-4 space-y-3">
                                {feedbackHistory.map((fb: GarmentFeedback, i: number) => (
                                    <div key={fb.id} className="p-3 rounded-xl border border-border/60 bg-muted/10 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="font-black text-[8px] uppercase">
                                                    Trip {fb.trip_number || i + 1}
                                                </Badge>
                                                <Badge
                                                    className={cn(
                                                        "font-black text-[8px] uppercase border-none",
                                                        fb.action === "accepted" && "bg-emerald-100 text-emerald-700",
                                                        fb.action === "needs_repair_accepted" && "bg-yellow-100 text-yellow-700",
                                                        fb.action === "needs_repair_rejected" && "bg-amber-100 text-amber-700",
                                                        fb.action === "needs_redo" && "bg-red-100 text-red-700",
                                                        fb.action === "collected" && "bg-emerald-100 text-emerald-700",
                                                        fb.action === "delivered" && "bg-blue-100 text-blue-700",
                                                    )}
                                                >
                                                    {fb.action?.replace(/_/g, " ")}
                                                </Badge>
                                            </div>
                                            <span className="text-[10px] font-bold text-muted-foreground">
                                                {fb.created_at ? new Date(fb.created_at).toLocaleDateString() : ""}
                                            </span>
                                        </div>
                                        {fb.satisfaction_level && (
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Satisfaction:</span>
                                                <span className="text-sm">
                                                    {SATISFACTION_LEVELS.find(s => s.numericValue === fb.satisfaction_level)?.emoji || ""}{" "}
                                                    {SATISFACTION_LEVELS.find(s => s.numericValue === fb.satisfaction_level)?.label || `${fb.satisfaction_level}/5`}
                                                </span>
                                            </div>
                                        )}
                                        {fb.notes && (
                                            <p className="text-xs text-muted-foreground">{fb.notes}</p>
                                        )}
                                    </div>
                                ))}
                            </CardContent>
                        )}
                    </Card>
                )}

            </TabsContent>
          </Tabs>

          {/* FINAL ACTIONS CONTROL PANEL */}
          {/* CUSTOMER SENTIMENTS */}
          <Card className="border border-border shadow-sm rounded-xl overflow-hidden">
              <CardHeader className="bg-muted/30 border-b px-4 py-3">
                  <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-primary/10 text-primary rounded-lg">
                          <MessageSquare className="w-4 h-4" />
                      </div>
                      <CardTitle className="text-base font-black uppercase tracking-tight">Customer Sentiments</CardTitle>
                  </div>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                  <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Overall Satisfaction</Label>
                      <RadioGroup
                          value={currentState.satisfaction || ""}
                          onValueChange={(val) => updateGarmentState(selectedGarmentId, { satisfaction: val })}
                          className="flex gap-2"
                      >
                          {SATISFACTION_LEVELS.map((level) => (
                              <div key={level.value} className="flex-1">
                                  <RadioGroupItem value={level.value} id={`sat-${level.value}`} className="peer sr-only" />
                                  <Label
                                      htmlFor={`sat-${level.value}`}
                                      className={cn(
                                          "flex flex-col items-center justify-center gap-1 h-16 rounded-xl border-2 border-border bg-card p-2 cursor-pointer transition-all",
                                          level.color
                                      )}
                                  >
                                      <span className="text-2xl">{level.emoji}</span>
                                      <span className="font-bold uppercase tracking-wider text-[9px]">{level.label}</span>
                                  </Label>
                              </div>
                          ))}
                      </RadioGroup>
                  </div>

                  {/* Signature (Brova only) */}
                  {activeTab === "brova" && (
                      <div className="flex items-center gap-3 pt-3 border-t border-border/60">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground shrink-0">Signature*</Label>
                              {currentState.customerSignature && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-black text-[8px]">SIGNED</Badge>}
                          </div>
                          <Dialog>
                              <DialogTrigger asChild>
                                  <Button
                                      variant="outline"
                                      size="sm"
                                      className={cn(
                                          "h-9 border-2 border-dashed gap-2",
                                          currentState.customerSignature ? "border-emerald-500/50 bg-emerald-50/30" : "hover:border-primary/50"
                                      )}
                                  >
                                      {currentState.customerSignature ? (
                                          <img src={currentState.customerSignature} alt="Signature" className="h-7 object-contain" />
                                      ) : (
                                          <>
                                              <PenTool className="w-3.5 h-3.5 text-muted-foreground/40" />
                                              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tap to Sign</span>
                                          </>
                                      )}
                                  </Button>
                              </DialogTrigger>
                              <DialogContent className="sm:max-w-[550px]">
                                  <DialogHeader>
                                      <DialogTitle className="text-xl font-black uppercase tracking-tight">Customer Signature</DialogTitle>
                                  </DialogHeader>
                                  <div className="flex flex-col items-center justify-center p-4">
                                      <SignaturePad
                                        onSave={(sig) => {
                                            updateGarmentState(selectedGarmentId, { customerSignature: sig });
                                            toast.success("Signature saved successfully");
                                        }}
                                      />
                                  </div>
                              </DialogContent>
                          </Dialog>
                      </div>
                  )}
              </CardContent>
          </Card>

          {/* GARMENT ACTION */}
          <Card className="border border-primary/20 shadow-sm rounded-xl overflow-hidden">
              <CardHeader className="bg-primary/5 border-b px-4 py-3">
                  <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-primary text-primary-foreground rounded-lg">
                          <Check className="w-4 h-4" />
                      </div>
                      <CardTitle className="text-base font-black uppercase tracking-tight">Garment Action</CardTitle>
                  </div>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                  {/* Status */}
                  <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Status</Label>
                      <RadioGroup
                          value={currentState.feedbackAction || ""}
                          onValueChange={(val) => updateGarmentState(selectedGarmentId, { feedbackAction: val })}
                          className="grid grid-cols-2 md:grid-cols-4 gap-2"
                      >
                          {(activeTab === "brova" ? BROVA_FEEDBACK_OPTIONS : FINAL_FEEDBACK_OPTIONS).map((opt) => (
                              <div key={opt.value}>
                                  <RadioGroupItem value={opt.value} id={`action-${opt.value}`} className="peer sr-only" />
                                  <Label
                                      htmlFor={`action-${opt.value}`}
                                      className={cn(
                                          "flex items-center justify-center h-10 rounded-lg border-2 border-border bg-card px-2 cursor-pointer transition-all font-black uppercase tracking-tight text-[10px] text-center",
                                          opt.color
                                      )}
                                  >
                                      {opt.label}
                                  </Label>
                              </div>
                          ))}
                      </RadioGroup>
                  </div>

                  {/* Investigation (Brova + Redo only) */}
                  {activeTab === "brova" && currentState.feedbackAction === "needs_redo" && (
                      <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                          <div className="flex items-center gap-3">
                              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                              <p className="text-xs font-black text-red-700 uppercase tracking-tight flex-1">Investigation Required?</p>
                              <Checkbox
                                  id="investigation"
                                  checked={currentState.isInvestigationNeeded}
                                  onCheckedChange={(c) => updateGarmentState(selectedGarmentId, { isInvestigationNeeded: c as boolean })}
                                  className="size-5 border-red-300 data-[state=checked]:bg-red-600"
                              />
                          </div>
                      </div>
                  )}

                  {/* Distribution */}
                  <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Distribution</Label>
                      <RadioGroup
                          value={currentState.distributionAction || ""}
                          onValueChange={(val) => updateGarmentState(selectedGarmentId, { distributionAction: val })}
                          className="grid grid-cols-3 gap-2"
                      >
                          {[
                            { value: "pickup", label: "Customer Pickup", icon: Package },
                            { value: "workshop", label: "To Workshop", icon: RefreshCw },
                            { value: "shop", label: "Stay at Shop", icon: Clock },
                          ].map((opt) => {
                              const isDisabled = !!(currentState.feedbackAction && currentState.feedbackAction !== "accepted" && opt.value !== "workshop");
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
                                              "flex items-center justify-center gap-2 h-10 rounded-lg border-2 border-border bg-card px-2 cursor-pointer transition-all peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5",
                                              isDisabled && "opacity-40 cursor-not-allowed grayscale"
                                          )}
                                      >
                                          <opt.icon className="w-3.5 h-3.5 text-muted-foreground" />
                                          <span className="font-bold uppercase tracking-wide text-[10px]">{opt.label}</span>
                                      </Label>
                                  </div>
                              );
                          })}
                      </RadioGroup>
                  </div>

                  {/* Notes + Submit */}
                  <div className="space-y-3">
                      <Textarea
                          placeholder="Finalization notes..."
                          className="min-h-[50px] rounded-lg border resize-none font-bold text-sm"
                          value={currentState.notes}
                          onChange={(e) => updateGarmentState(selectedGarmentId, { notes: e.target.value })}
                      />
                      <Button
                          onClick={onConfirmClick}
                          disabled={!currentState.satisfaction || !currentState.feedbackAction || !currentState.distributionAction || isSubmitting || currentState.submitted}
                          className="w-full h-11 font-black uppercase tracking-widest shadow-md text-sm rounded-xl"
                      >
                          {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : currentState.submitted ? <Check className="w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                          {currentState.submitted ? "Submitted" : "Submit Feedback"}
                      </Button>
                  </div>
              </CardContent>
          </Card>

          <ConfirmationDialog
              isOpen={isConfirmDialogOpen}
              onClose={() => setIsConfirmDialogOpen(false)}
              onConfirm={handleSave}
              title="Confirm Garment Feedback"
              description={`You are about to submit feedback for garment ${activeGarment?.garment_id || activeGarment?.id || ""}. This will update its status and save the feedback record.`}
              confirmText="Submit Feedback"
              cancelText="Go Back"
          />

          <ConfirmationDialog
              isOpen={isProductionConfirmOpen}
              onClose={() => setIsProductionConfirmOpen(false)}
              onConfirm={() => { setIsProductionConfirmOpen(false); handleStartProduction(); }}
              title="Start Final Production"
              description={`This will release all waiting finals to production. They will move from "Waiting for Acceptance" to "Waiting Cut" and become available for scheduling at the workshop.`}
              confirmText="Release Finals"
              cancelText="Cancel"
          />

      </div>

      {/* Scroll to top button */}
      <Button
        variant="outline"
        size="icon"
        className="fixed bottom-6 right-6 z-50 h-10 w-10 rounded-full shadow-lg"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      >
        <ArrowUp className="size-4" />
      </Button>
    </div>
  );
}
