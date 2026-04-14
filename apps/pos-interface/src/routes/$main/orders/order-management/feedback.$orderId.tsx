"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Mic,
  MicOff,
  Play,
  Pause,
  ChevronDown,
  History,
  Home,
  MapPin,
} from "lucide-react";

// UI Components
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Textarea } from "@repo/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import { Badge } from "@repo/ui/badge";
import { Skeleton } from "@repo/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@repo/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/select";
import { Label } from "@repo/ui/label";
import { Checkbox } from "@repo/ui/checkbox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ConfirmationDialog } from "@repo/ui/confirmation-dialog";
import { RadioGroup, RadioGroupItem } from "@repo/ui/radio-group";
import { SignaturePad } from "@/components/forms/signature-pad";

// API and Types
import { getOrderById } from "@/api/orders";
import { getMeasurementById, createMeasurement } from "@/api/measurements";
import { updateGarment, bulkRepointMeasurement, bulkUpdateStyleFields } from "@/api/garments";
import { createFeedback, updateFeedback, getFeedbackByGarmentId, getFeedbackByGarmentAndTrip } from "@/api/feedback";
// Storage helpers ready but not active — enable when Supabase Storage bucket is set up
// import { uploadFeedbackPhoto, uploadFeedbackVoiceNote, uploadFeedbackSignature } from "@/lib/storage";
import type { Measurement, Order, Garment, Customer, GarmentFeedback } from "@repo/database";
import { evaluateBrovaFeedback } from "@repo/database";

// Assets & Constants
import {
  collarTypes,
  collarButtons,
  jabzourTypes,
  topPocketTypes,
  cuffTypes,
  walletIcon,
  penIcon,
  smallTabaggiImage,
  thicknessOptions,
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

type MeasurementRow = (typeof MEASUREMENT_ROWS)[number];

const MEASUREMENT_GROUPS: Array<{ title: string; rows: readonly MeasurementRow[] }> = [
  {
    title: "Collar, Length & Chest",
    rows: MEASUREMENT_ROWS.filter(r =>
      ["collar_width", "collar_height", "length_front", "length_back", "chest_upper", "chest_full", "chest_front"].includes(r.key)
    ),
  },
  {
    title: "Pockets",
    rows: MEASUREMENT_ROWS.filter(r =>
      ["top_pocket_length", "top_pocket_width", "top_pocket_distance", "side_pocket_length", "side_pocket_width", "side_pocket_distance", "side_pocket_opening"].includes(r.key)
    ),
  },
  {
    title: "Waist, Arms & Bottom",
    rows: MEASUREMENT_ROWS.filter(r =>
      ["waist_front", "waist_back", "armhole", "elbow", "sleeve_length", "bottom"].includes(r.key)
    ),
  },
];

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

// Maps optionRows id → picker option list for style rejection replacement
const STYLE_OPTION_LISTS: Record<string, BaseOption[] | undefined> = {
  collar: collarTypes,
  collarBtn: collarButtons,
  frontPocket: topPocketTypes,
  cuff: cuffTypes,
  jabzour: jabzourTypes,
};

// --- Types ---

interface GarmentFeedbackState {
  feedbackMeasurements: Record<string, number | "">;
  differenceReasons: Record<string, string>;
  measurementNotes: Record<string, string>;
  optionNotes: Record<string, string>;
  optionChecks: Record<string, boolean>;
  styleChanges: Record<string, string>;
  hashwaChanges: Record<string, string>;
  sharedPhotos: Array<{ type: "photo" | "video"; url: string }>;
  sharedVoiceNotes: string[];
  satisfaction: string | null;
  feedbackAction: string | null;
  distributionAction: string | null;
  isInvestigationNeeded: boolean;
  customerSignature: string | null;
  notes: string;
  submitted: boolean;
  existingFeedbackId: string | null;
  isEditing: boolean;
}

const createEmptyGarmentState = (): GarmentFeedbackState => ({
  feedbackMeasurements: {},
  differenceReasons: {},
  measurementNotes: {},
  optionNotes: {},
  optionChecks: {},
  styleChanges: {},
  hashwaChanges: {},
  sharedPhotos: [],
  sharedVoiceNotes: [],
  satisfaction: null,
  feedbackAction: null,
  distributionAction: null,
  isInvestigationNeeded: false,
  customerSignature: null,
  notes: "",
  submitted: false,
  existingFeedbackId: null,
  isEditing: false,
});

interface OrderWithDetails extends Order {
    customer?: Customer;
    garments?: Garment[];
}

// --- Voice Note Player ---

function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Module-level registry so only one voice note plays at a time
let currentlyPlayingAudio: HTMLAudioElement | null = null;

function VoiceNotePlayer({ url, label, onRemove }: { url: string; label: string; onRemove: () => void }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const durationFixedRef = useRef(false);
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    // MediaRecorder webm blobs report duration: Infinity on Chromium until
    // seeked past the end. Workaround: seek to a huge value on first metadata,
    // read the real duration from the durationchange, then reset to 0.
    const onLoaded = () => {
      if (!durationFixedRef.current && a.duration === Infinity) {
        durationFixedRef.current = true;
        const prevMuted = a.muted;
        a.muted = true;
        const restore = () => {
          a.removeEventListener("durationchange", restore);
          if (isFinite(a.duration)) {
            setDuration(a.duration);
            a.currentTime = 0;
          }
          a.muted = prevMuted;
        };
        a.addEventListener("durationchange", restore);
        try { a.currentTime = 1e101; } catch { /* ignore */ }
        return;
      }
      if (isFinite(a.duration)) setDuration(a.duration);
    };
    const onTime = () => setCurrentTime(a.currentTime);
    const onPlay = () => {
      if (currentlyPlayingAudio && currentlyPlayingAudio !== a) {
        currentlyPlayingAudio.pause();
      }
      currentlyPlayingAudio = a;
      setPlaying(true);
    };
    const onPause = () => {
      if (currentlyPlayingAudio === a) currentlyPlayingAudio = null;
      setPlaying(false);
    };
    const onEnd = () => {
      if (currentlyPlayingAudio === a) currentlyPlayingAudio = null;
      setPlaying(false);
      setCurrentTime(0);
    };

    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("durationchange", onLoaded);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnd);
    return () => {
      if (currentlyPlayingAudio === a) {
        a.pause();
        currentlyPlayingAudio = null;
      }
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("durationchange", onLoaded);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => { /* ignored */ });
    else a.pause();
  };

  const seekToClientX = (clientX: number) => {
    const track = trackRef.current;
    const a = audioRef.current;
    if (!track || !a || !isFinite(duration) || duration <= 0) return;
    const rect = track.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    a.currentTime = pct * duration;
    setCurrentTime(a.currentTime);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    seekToClientX(e.clientX);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    seekToClientX(e.clientX);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const playLabel = `${playing ? "Pause" : "Play"} ${label}`;

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-muted/20">
      <audio ref={audioRef} src={url} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={toggle}
        aria-label={playLabel}
        title={playLabel}
        className="shrink-0 size-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm hover:bg-primary/90 active:scale-95 transition-all"
      >
        {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current ml-0.5" />}
      </button>
      <div className="flex flex-col flex-1 min-w-0 gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground truncate">
            {label}
          </span>
          <span className="text-[11px] font-bold tabular-nums text-muted-foreground shrink-0">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
        <div
          ref={trackRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          role="slider"
          aria-label={`${label} progress`}
          aria-valuemin={0}
          aria-valuemax={Math.max(0, Math.floor(duration))}
          aria-valuenow={Math.floor(currentTime)}
          aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
          className="relative h-1.5 w-full bg-muted rounded-full cursor-pointer group touch-none select-none"
        >
          <div
            className="absolute inset-y-0 left-0 bg-primary rounded-full transition-[width] duration-75 group-hover:bg-primary/90"
            style={{ width: `${progressPct}%` }}
          />
          <div
            className="absolute top-1/2 size-3 rounded-full bg-primary border-2 border-background shadow-sm opacity-0 group-hover:opacity-100 transition-opacity -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: `${progressPct}%` }}
            aria-hidden="true"
          />
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        title={`Remove ${label}`}
        className="shrink-0 text-muted-foreground hover:text-destructive p-1"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

// --- Main Component ---

function UnifiedFeedbackInterface() {
  const { orderId: rawOrderId } = Route.useParams();
  const { garmentId: deepLinkGarmentId } = Route.useSearch();
  const paramOrderId = Number(rawOrderId);
  const router = useRouter();
  const queryClient = useQueryClient();

  // Active Data State
  const [activeOrder, setActiveOrder] = useState<OrderWithDetails | null>(null);
  const [isLoadingOrder, setIsLoadingOrder] = useState(false);
  const [selectedGarmentId, setSelectedGarmentId] = useState<string | null>(null);

  // Per-garment feedback state
  const [garmentStates, setGarmentStates] = useState<Record<string, GarmentFeedbackState>>({});

  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // Eligible garments: at shop and in a stage that expects feedback
  const eligibleGarments = useMemo(() => {
    if (!activeOrder?.garments) return [];
    return activeOrder.garments.filter(g =>
      g.location === 'shop' &&
      g.piece_stage !== 'waiting_for_acceptance' &&
      g.piece_stage !== 'completed'
    );
  }, [activeOrder?.garments]);

  // 1. Garment Selection Effect — auto-select first eligible garment
  useEffect(() => {
    if (eligibleGarments.length > 0) {
      // Honour deep-link garmentId if provided and eligible
      if (deepLinkGarmentId) {
        const linked = eligibleGarments.find(g => g.id === deepLinkGarmentId);
        if (linked) {
          setSelectedGarmentId(linked.id);
          return;
        }
      }
      setSelectedGarmentId(eligibleGarments[0].id);
    } else {
      setSelectedGarmentId(null);
    }
  }, [eligibleGarments, deepLinkGarmentId]);

  // Pre-populate form when selecting a garment with existing feedback for current trip
  useEffect(() => {
    if (!selectedGarmentId || !activeGarment) return;
    // Don't re-populate if we already have state for this garment
    if (garmentStates[selectedGarmentId]) return;

    const tripNumber = activeGarment.trip_number || 1;
    getFeedbackByGarmentAndTrip(selectedGarmentId, tripNumber).then(res => {
      if (res.status === 'success' && res.data) {
        const fb = res.data;
        const satLevel = SATISFACTION_LEVELS.find(s => s.numericValue === fb.satisfaction_level);
        updateGarmentState(selectedGarmentId, {
          feedbackAction: fb.action || null,
          satisfaction: satLevel?.value || null,
          notes: fb.notes || "",
          customerSignature: fb.customer_signature || null,
          existingFeedbackId: fb.id,
          isEditing: true,
          submitted: true,
        });
      }
    });
  }, [selectedGarmentId, activeGarment]);

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
        .catch((err) => toast.error(`Could not load order: ${err instanceof Error ? err.message : String(err)}`))
        .finally(() => setIsLoadingOrder(false));
    }
  }, [paramOrderId]);

  // --- Handlers ---

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

  const handleStyleChange = (optionId: string, value: string) => {
    updateGarmentState(selectedGarmentId, {
      styleChanges: { ...currentState.styleChanges, [optionId]: value },
    });
  };

  const handleHashwaChange = (optionId: string, value: string) => {
    updateGarmentState(selectedGarmentId, {
      hashwaChanges: { ...currentState.hashwaChanges, [optionId]: value },
    });
  };

  // TODO: When storage is set up, replace blob URLs with real uploads via storage.ts
  const handleAddPhoto = (file: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    updateGarmentState(selectedGarmentId, {
      sharedPhotos: [...currentState.sharedPhotos, { type: "photo", url }],
    });
  };

  const handleRemovePhoto = (idx: number) => {
    updateGarmentState(selectedGarmentId, {
      sharedPhotos: currentState.sharedPhotos.filter((_, i) => i !== idx),
    });
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      // TODO: When storage is set up, upload blob via uploadFeedbackVoiceNote() from storage.ts
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        updateGarmentState(selectedGarmentId, {
          sharedVoiceNotes: [...currentState.sharedVoiceNotes, url],
        });
        stream.getTracks().forEach(t => t.stop());
        setRecordingOptionId(null);
      };

      mediaRecorder.start();
      setRecordingOptionId("shared");
    } catch {
      toast.error("Could not access microphone");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const removeVoiceNote = (idx: number) => {
    updateGarmentState(selectedGarmentId, {
      sharedVoiceNotes: currentState.sharedVoiceNotes.filter((_, i) => i !== idx),
    });
  };

  const onConfirmClick = () => {
    if (!currentState.satisfaction || !currentState.feedbackAction || !currentState.distributionAction) {
        toast.error("Please complete all feedback sections");
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
                allBrovas.map(b => ({ id: b.id, piece_stage: b.piece_stage as any, acceptance_status: (b as any).acceptance_status, feedback_status: (b as any).feedback_status })),
                activeGarment.id
            );

            await updateGarment(activeGarment.id, {
                piece_stage: result.newStage,
                acceptance_status: result.acceptanceStatus,
                feedback_status: result.feedbackStatus,
            });

            if (result.message) {
                toast.info(result.message);
            }
        } else {
            const updatePayload: any = {};

            if (state.feedbackAction === "accepted") {
                const isHomeDelivery = (activeOrder as any).home_delivery;
                updatePayload.piece_stage = "completed";
                updatePayload.fulfillment_type = isHomeDelivery ? "delivered" : "collected";
                updatePayload.acceptance_status = true;
                updatePayload.feedback_status = "accepted";
            } else {
                updatePayload.piece_stage = "brova_trialed";
                updatePayload.feedback_status = state.feedbackAction;
                updatePayload.acceptance_status = false;
            }

            await updateGarment(activeGarment.id, updatePayload);
        }

        // Build measurement diffs JSON (logs all rows with feedback value, regardless of reason)
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
            notes: state.measurementNotes[row.key] || null,
          }));

        // --- Measurement propagation (Customer Request only) ---
        // Customer Request rows feed a new measurements row; Workshop Error rows stay
        // logged in measurement_diffs only (original spec preserved — workshop just refixes).
        let newMeasurementId: string | null = null;
        const previousMeasurementId = activeGarment.measurement_id || null;
        const customerReqRows = MEASUREMENT_ROWS.filter(row => {
          const fbVal = state.feedbackMeasurements[row.key];
          return (
            state.differenceReasons[row.key] === "Customer Request" &&
            fbVal !== "" &&
            fbVal !== undefined
          );
        });

        if (customerReqRows.length > 0 && measurement && activeOrder.customer?.id) {
          const base: Partial<Measurement> = { ...(measurement as any) };
          delete (base as any).id;
          delete (base as any).created_at;
          delete (base as any).updated_at;
          (base as any).measurement_date = new Date().toISOString();
          for (const row of customerReqRows) {
            (base as any)[row.key] = state.feedbackMeasurements[row.key];
          }
          const created = await createMeasurement(base);
          if (created.status === "success" && created.data) {
            newMeasurementId = created.data.id;

            // Repoint: brovas only. Finals stay on their own measurement_id.
            if (activeGarment.garment_type === "brova" && previousMeasurementId) {
              await bulkRepointMeasurement(
                activeOrder.id,
                previousMeasurementId,
                newMeasurementId,
              );
            } else {
              await updateGarment(activeGarment.id, { measurement_id: newMeasurementId });
            }
          }
        }

        // --- Style propagation (brova only) ---
        // Main style rejection → overwrite style fields on sibling brovas sharing same style_id.
        // style_id itself stays fixed so grouping holds.
        if (activeGarment.garment_type === "brova" && activeGarment.style_id != null) {
          const styleFieldUpdates: Partial<Garment> = {};
          const hashwaFieldUpdates: Partial<Garment> = {};
          for (const opt of optionRows) {
            const mainRejected = state.optionChecks[`${opt.id}-main`] === false;
            const mainNewValue = state.styleChanges[opt.id];
            const hashwaRejected = state.optionChecks[`${opt.id}-hashwa`] === false;
            const hashwaNewValue = state.hashwaChanges[opt.id];

            if (mainRejected && mainNewValue) {
              // Map option id → garment field
              if (opt.id === "collar") styleFieldUpdates.collar_type = mainNewValue;
              else if (opt.id === "collarBtn") styleFieldUpdates.collar_button = mainNewValue;
              else if (opt.id === "frontPocket") styleFieldUpdates.front_pocket_type = mainNewValue;
              else if (opt.id === "cuff") styleFieldUpdates.cuffs_type = mainNewValue;
              else if (opt.id === "jabzour") {
                // Shaab = ZIPPER (needs secondary jabzour_2). Non-shaab = BUTTON (actual style in jabzour_2).
                if (mainNewValue === "JAB_SHAAB") {
                  const secondary = state.styleChanges["jabzour_2"];
                  styleFieldUpdates.jabzour_1 = "ZIPPER";
                  if (secondary) styleFieldUpdates.jabzour_2 = secondary;
                } else {
                  styleFieldUpdates.jabzour_1 = "BUTTON";
                  styleFieldUpdates.jabzour_2 = mainNewValue;
                }
              }
            }
            // smallTabaggi is a boolean toggle: reject = flip, no picker.
            if (opt.id === "smallTabaggi" && mainRejected) {
              styleFieldUpdates.small_tabaggi = !activeGarment.small_tabaggi;
            }
            if (hashwaRejected && hashwaNewValue) {
              if (opt.id === "frontPocket") hashwaFieldUpdates.front_pocket_thickness = hashwaNewValue;
              else if (opt.id === "cuff") hashwaFieldUpdates.cuffs_thickness = hashwaNewValue;
              else if (opt.id === "jabzour") hashwaFieldUpdates.jabzour_thickness = hashwaNewValue;
            }
          }
          const combined = { ...styleFieldUpdates, ...hashwaFieldUpdates };
          if (Object.keys(combined).length > 0) {
            await bulkUpdateStyleFields(activeOrder.id, activeGarment.style_id, combined);
          }
        }

        // Build options checklist JSON (logs verdict + any replacement values)
        const optionsChecklist = optionRows.map(opt => ({
          option_name: opt.id,
          expected_value: opt.mainValue,
          actual_correct: state.optionChecks[`${opt.id}-main`] === true,
          rejected: state.optionChecks[`${opt.id}-main`] === false,
          new_value: state.styleChanges[opt.id] || null,
          hashwa_correct: opt.hashwaValue ? state.optionChecks[`${opt.id}-hashwa`] === true : null,
          hashwa_rejected: opt.hashwaValue ? state.optionChecks[`${opt.id}-hashwa`] === false : null,
          hashwa_new_value: opt.hashwaValue ? (state.hashwaChanges[opt.id] || null) : null,
          notes: state.optionNotes[opt.id] || null,
        }));

        // Get satisfaction numeric value
        const satLevel = SATISFACTION_LEVELS.find(s => s.value === state.satisfaction);

        // Determine feedback type
        const feedbackType = activeGarment.garment_type === "brova" ? "brova_trial" : "final_collection";

        // TODO: When storage is set up, upload signature via uploadFeedbackSignature() from storage.ts

        const feedbackPayload = {
          garment_id: activeGarment.id,
          order_id: activeOrder.id,
          feedback_type: feedbackType,
          trip_number: activeGarment.trip_number || 1,
          action: state.feedbackAction ?? undefined,
          previous_stage: (activeGarment.piece_stage ?? undefined) as string | undefined,
          previous_measurement_id: newMeasurementId ? previousMeasurementId : null,
          distribution: state.distributionAction || null,
          satisfaction_level: satLevel?.numericValue || null,
          measurement_diffs: measurementDiffs.length > 0 ? JSON.stringify(measurementDiffs) : null,
          options_checklist: optionsChecklist.length > 0 ? JSON.stringify(optionsChecklist) : null,
          customer_signature: state.customerSignature || null,
          photo_urls: state.sharedPhotos.length > 0
            ? JSON.stringify(state.sharedPhotos.map(p => p.url))
            : null,
          voice_note_urls: state.sharedVoiceNotes.length > 0
            ? JSON.stringify(state.sharedVoiceNotes)
            : null,
          notes: state.notes || null,
          difference_reasons: Object.keys(state.differenceReasons).length > 0
            ? JSON.stringify(state.differenceReasons)
            : null,
        };

        // Upsert: update existing feedback or create new one
        if (state.existingFeedbackId) {
          await updateFeedback(state.existingFeedbackId, feedbackPayload);
        } else {
          const fbResult = await createFeedback(feedbackPayload);
          if (fbResult.status === 'success' && fbResult.data) {
            updateGarmentState(selectedGarmentId, { existingFeedbackId: fbResult.data.id });
          }
        }

        // Mark garment as submitted in local state
        updateGarmentState(selectedGarmentId, { submitted: true, isEditing: true });

        // Refresh order data so garment pills reflect updated piece_stage
        const refreshed = await getOrderById(activeOrder.id, true);
        if (refreshed.status === 'success' && refreshed.data) {
          setActiveOrder(refreshed.data);
        }

        // Invalidate dispatch queries so "Return to Workshop" tab is fresh
        if (state.distributionAction === "workshop") {
          queryClient.invalidateQueries({ queryKey: ["redispatchGarments"] });
          queryClient.invalidateQueries({ queryKey: ["dispatchOrders"] });
        }

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

  const findDisplayText = (list: BaseOption[], val: string | undefined | null) => {
    if (!val) return val;
    return list.find(o => o.value === val || o.displayText === val)?.displayText ?? val;
  };

  const optionRows = useMemo(() => {
    if (!activeGarment) return [];
    const g = activeGarment;

    // Reverse-map jabzour from DB values to frontend display values
    // DB stores: jabzour_1 = "ZIPPER" for Shaab, "BUTTON" for others (actual style in jabzour_2)
    const isShaab = g.jabzour_1 === "ZIPPER";
    let displayJabzour1: string | null | undefined;
    let displayJabzour2: string | null | undefined = null;

    if (isShaab) {
      displayJabzour1 = "JAB_SHAAB";
      displayJabzour2 = g.jabzour_2; // secondary jabzour style
    } else if (g.jabzour_1 === "BUTTON") {
      displayJabzour1 = g.jabzour_2; // actual style stored in jabzour_2
      displayJabzour2 = null;
    } else {
      displayJabzour1 = g.jabzour_1;
    }

    const rows: Array<{
      id: string;
      label: string;
      mainValue: string | null | undefined;
      displayText?: string | null;
      mainImage: string | null | undefined;
      hashwaLabel: string | null;
      hashwaValue: string | null | undefined;
      extraCheckLabel?: string | null;
      extraCheckValue?: boolean | null;
    }> = [
      {
        id: "collar",
        label: "Collar",
        mainValue: g.collar_type,
        displayText: findDisplayText(collarTypes, g.collar_type),
        mainImage: findOptionImage(collarTypes, g.collar_type),
        hashwaLabel: null,
        hashwaValue: null
      },
      {
        id: "collarBtn",
        label: "Collar Button",
        mainValue: g.collar_button,
        displayText: findDisplayText(collarButtons, g.collar_button),
        mainImage: findOptionImage(collarButtons, g.collar_button),
        hashwaLabel: null,
        hashwaValue: null,
      },
      // Small Tabbagi — always shown; reject flips the boolean
      {
        id: "smallTabaggi",
        label: "Small Tabbagi",
        mainValue: g.small_tabaggi ? "Yes" : "No",
        displayText: g.small_tabaggi ? "Yes — Small Tabbagi present" : "No — Not applied",
        mainImage: smallTabaggiImage as string | null,
        hashwaLabel: null as string | null,
        hashwaValue: null as string | null,
      },
      // Combined jabzour row: shows closure type (Zipper/Button) + style
      ...(g.jabzour_1 ? [{
        id: "jabzour",
        label: "Jabzour",
        mainValue: displayJabzour1 || g.jabzour_1,
        displayText: isShaab
          ? `Shaab (Zipper)${displayJabzour2 ? ` · ${findDisplayText(jabzourTypes, displayJabzour2) || displayJabzour2}` : ""}`
          : `${findDisplayText(jabzourTypes, displayJabzour1) || displayJabzour1} (Button)`,
        mainImage: isShaab
          ? findOptionImage(jabzourTypes, "JAB_SHAAB")
          : findOptionImage(jabzourTypes, displayJabzour1),
        hashwaLabel: "Hashwa" as string | null,
        hashwaValue: g.jabzour_thickness as string | null | undefined
      }] : []),
      {
        id: "frontPocket",
        label: "Front Pocket",
        mainValue: g.front_pocket_type,
        displayText: findDisplayText(topPocketTypes, g.front_pocket_type),
        mainImage: findOptionImage(topPocketTypes, g.front_pocket_type),
        hashwaLabel: "Hashwa",
        hashwaValue: g.front_pocket_thickness
      },
      {
        id: "cuff",
        label: "Cuff",
        mainValue: g.cuffs_type,
        displayText: findDisplayText(cuffTypes, g.cuffs_type),
        mainImage: findOptionImage(cuffTypes, g.cuffs_type),
        hashwaLabel: "Hashwa",
        hashwaValue: g.cuffs_thickness
      },
      // Accessories
      ...(g.wallet_pocket ? [{
        id: "walletPocket",
        label: "Wallet Pocket",
        mainValue: "Yes",
        displayText: "Wallet Pocket",
        mainImage: walletIcon as string | null,
        hashwaLabel: null as string | null,
        hashwaValue: null as string | null
      }] : []),
      ...(g.pen_holder ? [{
        id: "penHolder",
        label: "Pen Holder",
        mainValue: "Yes",
        displayText: "Pen Holder",
        mainImage: penIcon as string | null,
        hashwaLabel: null as string | null,
        hashwaValue: null as string | null
      }] : []),
    ];

    return rows.filter(r => r.mainValue && r.mainValue !== "None");
  }, [activeGarment]);

  if (isLoadingOrder) {
    return (
      <div className="p-4 md:p-5 max-w-6xl mx-auto space-y-4">
        {/* Header skeleton */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64 rounded-lg" />
            <Skeleton className="h-4 w-40 rounded-md" />
          </div>
          <Skeleton className="h-10 w-28 rounded-xl" />
        </div>
        {/* Tabs skeleton */}
        <Skeleton className="h-10 w-80 rounded-xl" />
        {/* Content skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!activeOrder) {
    return (
      <div className="p-4 md:p-5 max-w-6xl mx-auto flex flex-col items-center justify-center py-10 text-center">
        <div className="size-14 bg-muted/30 rounded-full flex items-center justify-center mb-4 border-2 border-dashed border-border shadow-inner">
          <Package className="w-10 h-10 text-muted-foreground/40" />
        </div>
        <h3 className="text-lg font-black text-foreground uppercase tracking-tight">Order Not Found</h3>
        <p className="text-muted-foreground font-medium uppercase tracking-widest text-xs mt-2">This order could not be loaded</p>
        <Button variant="outline" className="mt-4 font-bold" onClick={() => router.history.back()}>
          <ArrowLeft className="size-3.5 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-5 max-w-6xl mx-auto space-y-4 pb-20">

      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border pb-3">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => router.history.back()}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            Order <span className="text-primary">Feedback</span>
          </h1>
          <span className="text-sm text-muted-foreground font-medium">
            #{activeOrder.id} &bull; {activeOrder.customer?.name || "Guest"}
          </span>
          {activeGarment?.garment_type === "brova" && (
            <Badge variant="outline" className="text-xs font-black uppercase bg-amber-50 text-amber-700 border-amber-200">Brova Trial</Badge>
          )}
          {activeGarment?.garment_type === "final" && (
            <Badge variant="outline" className="text-xs font-black uppercase bg-emerald-50 text-emerald-700 border-emerald-200">Final / Pickup</Badge>
          )}
          {currentState.isEditing && (
            <Badge variant="outline" className="text-xs font-black uppercase bg-blue-50 text-blue-700 border-blue-200">Editing</Badge>
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
                    <p className="text-xs font-black uppercase tracking-widest text-muted-foreground leading-none mb-1">Customer</p>
                    <p className="font-bold text-sm leading-none">{activeOrder.customer?.name || "Guest"}</p>
                  </div>
                  <div className="ml-2 pl-3 border-l border-border py-1">
                    <p className="text-xs font-bold text-muted-foreground font-mono leading-none">{activeOrder.customer?.phone}</p>
                  </div>
                </div>

                <div className="hidden lg:block h-6 w-px bg-border/60" />

                {/* Financial Status */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg">
                            <Banknote className="w-3.5 h-3.5" />
                        </div>
                        <div>
                            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground leading-none mb-1">Total Paid</p>
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
                            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground leading-none mb-1">Balance</p>
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
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-primary/10 rounded-lg text-primary">
                      <Hash className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-muted-foreground leading-none mb-1">Order & Inv</p>
                      <div className="flex items-center gap-2 leading-none">
                        <span className="font-black text-sm">#{activeOrder.id}</span>
                        <span className="text-xs font-bold text-primary opacity-70">INV: {activeOrder.invoice_number || "\u2014"}</span>
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
                    <p className="text-xs font-black uppercase tracking-widest text-muted-foreground leading-none mb-1">Delivery</p>
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

          {/* ═══ GARMENT-LEVEL FEEDBACK ═══ */}
          {/* 3. Garment Selection Tabs */}
          <Tabs value={selectedGarmentId || ""} onValueChange={setSelectedGarmentId} className="w-full space-y-4">
            <div className="flex items-center justify-between overflow-x-auto pb-2 scrollbar-hide">
                <TabsList className="h-auto flex-nowrap justify-start gap-2 bg-transparent p-0">
                {eligibleGarments.map((garment) => {
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
                                <span className="font-black text-xs truncate uppercase tracking-tighter">{garment.garment_id}</span>
                                <div className="flex items-center gap-1">
                                    {isSubmitted && (
                                        <div className="size-3.5 rounded-full bg-emerald-500 flex items-center justify-center">
                                            <Check className="size-2 text-white" />
                                        </div>
                                    )}
                                    <Badge
                                        className={cn(
                                            "h-3 px-1 text-[7px] font-black uppercase border-none",
                                            (garment.garment_type === 'brova' && (garment.trip_number || 1) >= 4) ||
                                            (garment.garment_type === 'final' && (garment.trip_number || 1) >= 2)
                                                ? "bg-blue-100 text-blue-700 data-[state=active]:bg-blue-500 data-[state=active]:text-white"
                                                : garment.garment_type === 'brova'
                                                    ? "bg-amber-100 text-amber-700 data-[state=active]:bg-amber-500 data-[state=active]:text-white"
                                                    : "bg-emerald-100 text-emerald-700 data-[state=active]:bg-emerald-500 data-[state=active]:text-white"
                                        )}
                                    >
                                        {garment.garment_type === 'brova' && (garment.trip_number || 1) >= 4
                                            ? `Alt ${(garment.trip_number || 1) - 3}`
                                            : garment.garment_type === 'final' && (garment.trip_number || 1) >= 2
                                                ? `Alt ${(garment.trip_number || 1) - 1}`
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
                <Card className="border border-border shadow-sm overflow-clip rounded-xl py-0 gap-0">
                    <CardHeader className="bg-muted/30 border-b px-4 py-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="p-1.5 bg-primary text-primary-foreground rounded-lg">
                                    <Ruler className="w-4 h-4" />
                                </div>
                                <CardTitle className="text-base font-bold uppercase tracking-tight">Measurement Feedback</CardTitle>
                            </div>
                            <div className="flex items-center gap-2">
                                {isMeasurementLoading ? (
                                    <Badge variant="outline" className="bg-background font-black text-xs h-6 px-2">LOADING…</Badge>
                                ) : measurementId ? (
                                    <Badge variant="outline" className="bg-background font-mono font-bold text-[10px] h-6 px-2" title="Measurement ID">
                                        M: {String(measurementId).slice(0, 8)}
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="bg-background font-black text-xs h-6 px-2">NO MEASUREMENT</Badge>
                                )}
                            </div>
                        </div>
                    </CardHeader>

                    <div className="p-3 space-y-4">
                        {MEASUREMENT_GROUPS.map((group) => (
                            <div key={group.title} className="rounded-lg border border-border/60 overflow-hidden">
                                <div className="bg-muted/40 px-3 py-1.5 border-b border-border/60 text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                                    {group.title}
                                </div>
                                <div className="relative overflow-x-auto">
                                    <table className="w-full border-collapse">
                                        <thead className="bg-muted/30 border-b-2 border-border/60">
                                            <tr className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                                                <th className="text-left p-3 bg-muted/50 border-r border-border/60 min-w-[110px] sticky left-0 z-20">Label</th>
                                                {group.rows.map((row) => (
                                                    <th key={row.key} className="p-2 text-center border border-border/40 min-w-[96px]">
                                                        <div className="font-black text-[11px] leading-tight">{row.type}</div>
                                                        <div className="font-bold text-[10px] text-muted-foreground/80 leading-tight">{row.subType}</div>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {/* Current row */}
                                            <tr className="border-b border-border/40">
                                                <td className="p-3 bg-muted/40 border-r border-border/60 font-black text-xs uppercase tracking-widest text-muted-foreground sticky left-0 z-10">Current</td>
                                                {group.rows.map((row) => {
                                                    const orderValue = measurement ? (measurement[row.key as keyof Measurement] as number | null) : undefined;
                                                    return (
                                                        <td key={row.key} className="p-2 text-center border border-border/30 bg-muted/20">
                                                            <span className="font-black text-sm tabular-nums">{orderValue ?? "—"}</span>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                            {/* New row */}
                                            <tr className="border-b border-border/40">
                                                <td className="p-3 bg-primary/5 border-r border-border/60 font-black text-xs uppercase tracking-widest text-primary sticky left-0 z-10">New</td>
                                                {group.rows.map((row) => {
                                                    const orderValue = measurement ? (measurement[row.key as keyof Measurement] as number | null) : undefined;
                                                    const feedbackValue = currentState.feedbackMeasurements[row.key];
                                                    const diff = getDifference(orderValue, feedbackValue);
                                                    const status = getDiffStatus(diff);
                                                    return (
                                                        <td key={row.key} className="p-1 border border-border/30 bg-primary/[0.02]">
                                                            <Input
                                                                type="number"
                                                                step="0.01"
                                                                className={cn(
                                                                    "h-8 w-full text-center font-black text-sm tabular-nums border transition-all",
                                                                    status === 'error' && "border-destructive bg-destructive/5 text-destructive",
                                                                    status === 'warning' && "border-amber-500 bg-amber-50 text-amber-700",
                                                                    status === 'success' && "border-emerald-500 bg-emerald-50 text-emerald-700",
                                                                    !feedbackValue && "border-border hover:border-primary/40"
                                                                )}
                                                                placeholder="—"
                                                                value={feedbackValue ?? ""}
                                                                onChange={(e) => handleFeedbackMeasurementChange(row.key, e.target.value)}
                                                            />
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                            {/* Delta row */}
                                            <tr className="border-b border-border/40">
                                                <td className="p-3 bg-muted/40 border-r border-border/60 font-black text-xs uppercase tracking-widest text-muted-foreground sticky left-0 z-10">Delta</td>
                                                {group.rows.map((row) => {
                                                    const orderValue = measurement ? (measurement[row.key as keyof Measurement] as number | null) : undefined;
                                                    const feedbackValue = currentState.feedbackMeasurements[row.key];
                                                    const diff = getDifference(orderValue, feedbackValue);
                                                    const status = getDiffStatus(diff);
                                                    return (
                                                        <td key={row.key} className="p-2 text-center border border-border/30">
                                                            {diff !== null ? (
                                                                <Badge variant="secondary" className={cn(
                                                                    "font-black text-xs h-5 px-1.5",
                                                                    status === 'success' && "bg-emerald-100 text-emerald-800 border-emerald-200",
                                                                    status === 'warning' && "bg-amber-100 text-amber-800 border-amber-200",
                                                                    status === 'error' && "bg-red-100 text-red-800 border-red-200"
                                                                )}>
                                                                    {diff > 0 ? `+${diff}` : diff}
                                                                </Badge>
                                                            ) : (
                                                                <span className="text-muted-foreground/30 font-black text-xs">—</span>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                            {/* Reason row */}
                                            <tr className="border-b border-border/40">
                                                <td className="p-3 bg-muted/40 border-r border-border/60 font-black text-xs uppercase tracking-widest text-muted-foreground sticky left-0 z-10">Reason</td>
                                                {group.rows.map((row) => {
                                                    const reasonValue = currentState.differenceReasons[row.key] || "";
                                                    const selectedReason = DIFFERENCE_REASONS.find(r => r.label === reasonValue);
                                                    return (
                                                        <td key={row.key} className="p-0 border border-border/30">
                                                            <Select value={reasonValue} onValueChange={(val) => handleDifferenceReasonChange(row.key, val)}>
                                                                <SelectTrigger className={cn(
                                                                    "h-full min-h-10 w-full text-[10px] font-bold border-none shadow-none rounded-none px-2 transition-colors",
                                                                    selectedReason ? selectedReason.color : "bg-muted/20 hover:bg-muted/40"
                                                                )}>
                                                                    <SelectValue placeholder="—" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {DIFFERENCE_REASONS.map(r => (
                                                                        <SelectItem key={r.label} value={r.label} className={cn("text-xs font-bold uppercase py-2", r.color)}>
                                                                            {r.label}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                            {/* Notes row */}
                                            <tr>
                                                <td className="p-3 bg-muted/40 border-r border-border/60 font-black text-xs uppercase tracking-widest text-muted-foreground sticky left-0 z-10">Notes</td>
                                                {group.rows.map((row) => {
                                                    const noteValue = currentState.measurementNotes[row.key] || "";
                                                    return (
                                                        <td key={row.key} className="p-1 border border-border/30">
                                                            <Input
                                                                className="h-8 w-full text-[11px] font-medium border-none shadow-none focus-visible:ring-1 focus-visible:ring-primary bg-transparent px-1.5"
                                                                placeholder="—"
                                                                value={noteValue}
                                                                onChange={(e) => handleMeasurementNoteChange(row.key, e.target.value)}
                                                            />
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>

                {/* STYLE feedback SECTION */}
                <Card className="border border-border shadow-sm rounded-xl overflow-clip py-0 gap-0">
                    <CardHeader className="bg-muted/30 border-b px-4 py-3">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 bg-primary text-primary-foreground rounded-lg">
                                <PenTool className="w-4 h-4" />
                            </div>
                            <CardTitle className="text-base font-bold uppercase tracking-tight">Style Feedback</CardTitle>
                            <Badge variant="secondary" className="ml-auto text-xs font-bold">
                                {optionRows.filter(o => currentState.optionChecks[`${o.id}-main`]).length}/{optionRows.length} Confirmed
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {optionRows.map((opt) => {
                                const isConfirmed = currentState.optionChecks[`${opt.id}-main`] === true;
                                const isRejected = currentState.optionChecks[`${opt.id}-main`] === false;
                                const hashwaConfirmed = currentState.optionChecks[`${opt.id}-hashwa`] === true;
                                const hashwaRejected = currentState.optionChecks[`${opt.id}-hashwa`] === false;

                                const pickerList = STYLE_OPTION_LISTS[opt.id];
                                const newStyleValue = currentState.styleChanges[opt.id] || "";
                                const newStyleImage = pickerList ? findOptionImage(pickerList, newStyleValue) : null;
                                const newStyleText = pickerList ? findDisplayText(pickerList, newStyleValue) : newStyleValue;
                                const newHashwaValue = currentState.hashwaChanges[opt.id] || "";

                                return (
                                    <div
                                        key={opt.id}
                                        className={cn(
                                            "rounded-xl border-2 p-3 transition-all",
                                            isConfirmed && "border-emerald-300 bg-emerald-50/40",
                                            isRejected && "border-red-300 bg-red-50/40",
                                            !isConfirmed && !isRejected && "border-border bg-card"
                                        )}
                                    >
                                        <div className="flex items-stretch gap-3">
                                            {/* Current option image */}
                                            {opt.mainImage ? (
                                                <div className={cn(
                                                    "h-14 w-14 shrink-0 rounded-lg border-2 p-1 shadow-sm bg-white",
                                                    isConfirmed ? "border-emerald-300" : isRejected ? "border-red-200" : "border-border"
                                                )}>
                                                    <img src={opt.mainImage} alt={opt.label} className="w-full h-full object-contain" />
                                                </div>
                                            ) : (
                                                <div className="h-14 w-14 shrink-0 bg-muted/20 rounded-lg border-2 border-dashed border-border flex items-center justify-center">
                                                    <Package className="w-4 h-4 text-muted-foreground/30" />
                                                </div>
                                            )}

                                            {/* Label + current value */}
                                            <div className="flex-1 min-w-0 flex flex-col justify-between">
                                                <div>
                                                    <p className="font-black text-xs uppercase tracking-tight text-foreground">{opt.label}</p>
                                                    <p className="text-[11px] font-bold text-muted-foreground truncate">{opt.displayText || opt.mainValue}</p>
                                                </div>
                                                {opt.hashwaValue && (
                                                    <Badge
                                                        variant="outline"
                                                        className={cn(
                                                            "self-start font-bold text-[10px] h-4 px-1.5 mt-1",
                                                            hashwaConfirmed && "bg-emerald-100 text-emerald-800 border-emerald-300",
                                                            hashwaRejected && "bg-red-100 text-red-800 border-red-300",
                                                            !hashwaConfirmed && !hashwaRejected && "bg-amber-50 text-amber-700 border-amber-200"
                                                        )}
                                                    >
                                                        Hashwa: {opt.hashwaValue}
                                                    </Badge>
                                                )}
                                            </div>

                                            {/* Confirm / Reject */}
                                            <div className="shrink-0 flex flex-col gap-1">
                                                <button
                                                    onClick={() => handleCheck(`${opt.id}-main`, true)}
                                                    className={cn(
                                                        "flex items-center justify-center gap-1 px-2 h-7 rounded border-2 font-bold text-[11px] uppercase transition-all",
                                                        isConfirmed
                                                            ? "bg-emerald-500 border-emerald-500 text-white"
                                                            : "bg-background border-border text-muted-foreground hover:border-emerald-400 hover:text-emerald-600"
                                                    )}
                                                >
                                                    <Check className="w-3 h-3" />
                                                    OK
                                                </button>
                                                <button
                                                    onClick={() => handleCheck(`${opt.id}-main`, false)}
                                                    className={cn(
                                                        "flex items-center justify-center gap-1 px-2 h-7 rounded border-2 font-bold text-[11px] uppercase transition-all",
                                                        isRejected
                                                            ? "bg-red-500 border-red-500 text-white"
                                                            : "bg-background border-border text-muted-foreground hover:border-red-400 hover:text-red-600"
                                                    )}
                                                >
                                                    <X className="w-3 h-3" />
                                                    No
                                                </button>
                                            </div>
                                        </div>

                                        {/* Rejected → pick new main style */}
                                        {isRejected && pickerList && (
                                            <div className="mt-3 pt-3 border-t border-red-200 space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-red-700 shrink-0">New →</span>
                                                    <Select value={newStyleValue} onValueChange={(v) => handleStyleChange(opt.id, v)}>
                                                        <SelectTrigger className="h-10 flex-1 bg-background border-red-200">
                                                            {newStyleValue ? (
                                                                <div className="flex items-center gap-2">
                                                                    {newStyleImage && <img src={newStyleImage} alt={newStyleText || ""} className="h-7 w-7 object-contain" />}
                                                                    <span className="text-xs font-bold">{newStyleText}</span>
                                                                </div>
                                                            ) : (
                                                                <SelectValue placeholder="Select replacement..." />
                                                            )}
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {pickerList.map((o) => (
                                                                <SelectItem key={o.value} value={o.value}>
                                                                    <div className="flex items-center gap-2">
                                                                        {o.image && <img src={o.image} alt={o.alt} className="h-8 w-8 object-contain" />}
                                                                        <span className="text-xs font-bold">{o.displayText}</span>
                                                                    </div>
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                {/* Shaab = Zipper → needs secondary jabzour_2 pick */}
                                                {opt.id === "jabzour" && newStyleValue === "JAB_SHAAB" && (() => {
                                                    const secondaryValue = currentState.styleChanges["jabzour_2"] || "";
                                                    const secondaryList = jabzourTypes.filter(j => j.value !== "JAB_SHAAB");
                                                    const secondaryImage = findOptionImage(secondaryList, secondaryValue);
                                                    const secondaryText = findDisplayText(secondaryList, secondaryValue);
                                                    return (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] font-black uppercase tracking-widest text-red-700 shrink-0">Under Zipper →</span>
                                                            <Select value={secondaryValue} onValueChange={(v) => handleStyleChange("jabzour_2", v)}>
                                                                <SelectTrigger className="h-10 flex-1 bg-background border-red-200">
                                                                    {secondaryValue ? (
                                                                        <div className="flex items-center gap-2">
                                                                            {secondaryImage && <img src={secondaryImage} alt={secondaryText || ""} className="h-7 w-7 object-contain" />}
                                                                            <span className="text-xs font-bold">{secondaryText}</span>
                                                                        </div>
                                                                    ) : (
                                                                        <SelectValue placeholder="Select jabzour style..." />
                                                                    )}
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {secondaryList.map((o) => (
                                                                        <SelectItem key={o.value} value={o.value}>
                                                                            <div className="flex items-center gap-2">
                                                                                {o.image && <img src={o.image} alt={o.alt} className="h-8 w-8 object-contain" />}
                                                                                <span className="text-xs font-bold">{o.displayText}</span>
                                                                            </div>
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        )}

                                        {/* Small Tabbagi reject → flip indicator (no picker) */}
                                        {isRejected && opt.id === "smallTabaggi" && (
                                            <div className="mt-3 pt-3 border-t border-red-200 flex items-center gap-2">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-red-700 shrink-0">New →</span>
                                                <Badge variant="outline" className="font-black text-xs bg-red-50 text-red-700 border-red-200">
                                                    {activeGarment?.small_tabaggi ? "Remove Small Tabbagi" : "Add Small Tabbagi"}
                                                </Badge>
                                            </div>
                                        )}

                                        {/* Hashwa row */}
                                        {opt.hashwaValue && (
                                            <div className="mt-2 pt-2 border-t border-border/40 flex items-center gap-2">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground shrink-0">Hashwa</span>
                                                <button
                                                    onClick={() => handleCheck(`${opt.id}-hashwa`, true)}
                                                    className={cn(
                                                        "flex items-center gap-1 px-2 h-6 rounded border font-bold text-[10px] uppercase transition-all",
                                                        hashwaConfirmed
                                                            ? "bg-emerald-500 border-emerald-500 text-white"
                                                            : "bg-background border-border text-muted-foreground hover:border-emerald-400"
                                                    )}
                                                >
                                                    <Check className="w-3 h-3" /> OK
                                                </button>
                                                <button
                                                    onClick={() => handleCheck(`${opt.id}-hashwa`, false)}
                                                    className={cn(
                                                        "flex items-center gap-1 px-2 h-6 rounded border font-bold text-[10px] uppercase transition-all",
                                                        hashwaRejected
                                                            ? "bg-red-500 border-red-500 text-white"
                                                            : "bg-background border-border text-muted-foreground hover:border-red-400"
                                                    )}
                                                >
                                                    <X className="w-3 h-3" /> No
                                                </button>
                                                {hashwaRejected && (
                                                    <Select value={newHashwaValue} onValueChange={(v) => handleHashwaChange(opt.id, v)}>
                                                        <SelectTrigger className="h-7 text-[11px] flex-1 bg-background border-red-200">
                                                            <SelectValue placeholder="New thickness..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {thicknessOptions.map((t) => (
                                                                <SelectItem key={t.value} value={t.value} className="text-xs font-bold">
                                                                    {t.value === "NO HASHWA" ? "No Hashwa" : t.value.charAt(0) + t.value.slice(1).toLowerCase()}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            </div>
                                        )}

                                        {/* Notes */}
                                        <div className="mt-2 flex items-center gap-2 bg-muted/20 rounded px-2 border border-transparent focus-within:border-primary/30 focus-within:bg-background transition-all">
                                            <MessageSquare className="size-3.5 text-muted-foreground/40 shrink-0" />
                                            <Input
                                                className="border-none shadow-none focus-visible:ring-0 bg-transparent text-[11px] font-medium h-7 p-0"
                                                placeholder="Note..."
                                                value={currentState.optionNotes[opt.id] || ""}
                                                onChange={(e) => handleOptionNoteChange(opt.id, e.target.value)}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                {/* SHARED MEDIA (photos + voice notes) */}
                <Card className="border border-border shadow-sm rounded-xl overflow-clip py-0 gap-0">
                    <CardHeader className="bg-muted/30 border-b px-4 py-3">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 bg-primary/10 text-primary rounded-lg">
                                <Camera className="w-4 h-4" />
                            </div>
                            <CardTitle className="text-base font-bold uppercase tracking-tight">Attachments</CardTitle>
                            <Badge variant="secondary" className="ml-auto text-xs font-bold">
                                {currentState.sharedPhotos.length + currentState.sharedVoiceNotes.length} items
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 space-y-3">
                        {/* Capture buttons */}
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-9 font-bold text-xs"
                                onClick={() => document.getElementById("shared-photo-input")?.click()}
                            >
                                <Camera className="w-3.5 h-3.5 mr-1.5" />
                                Add Photo
                            </Button>
                            <Button
                                variant={recordingOptionId === "shared" ? "destructive" : "outline"}
                                size="sm"
                                className="h-9 font-bold text-xs"
                                onClick={recordingOptionId === "shared" ? stopRecording : startRecording}
                            >
                                {recordingOptionId === "shared" ? (
                                    <><MicOff className="w-3.5 h-3.5 mr-1.5" />Stop</>
                                ) : (
                                    <><Mic className="w-3.5 h-3.5 mr-1.5" />Record Voice Note</>
                                )}
                            </Button>
                            <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                id="shared-photo-input"
                                onChange={(e) => handleAddPhoto(e.target.files?.[0] || null)}
                            />
                        </div>

                        {/* Recording indicator */}
                        {recordingOptionId === "shared" && (
                            <div className="flex items-center gap-2 p-2 bg-red-50 rounded-lg border border-red-200">
                                <div className="size-2.5 rounded-full bg-red-500 animate-pulse" />
                                <span className="text-xs font-bold uppercase tracking-wide text-red-700">Recording...</span>
                            </div>
                        )}

                        {/* Photo thumbnails */}
                        {currentState.sharedPhotos.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {currentState.sharedPhotos.map((p, i) => (
                                    <div key={i} className="relative group size-20 rounded-lg overflow-hidden border-2 border-border shadow-sm">
                                        <img src={p.url} alt={`Attachment ${i + 1}`} className="w-full h-full object-cover" />
                                        <button
                                            onClick={() => handleRemovePhoto(i)}
                                            className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <X className="size-4 text-white" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Voice notes */}
                        {currentState.sharedVoiceNotes.length > 0 && (
                            <div className="space-y-2">
                                {currentState.sharedVoiceNotes.map((url, i) => (
                                    <VoiceNotePlayer
                                        key={i}
                                        url={url}
                                        label={`Voice Note ${i + 1}`}
                                        onRemove={() => removeVoiceNote(i)}
                                    />
                                ))}
                            </div>
                        )}

                        {currentState.sharedPhotos.length === 0 && currentState.sharedVoiceNotes.length === 0 && (
                            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60 text-center py-2">
                                No attachments yet
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* PREVIOUS FEEDBACK HISTORY */}
                {feedbackHistory.length > 0 && (
                    <Card className="border border-border shadow-sm rounded-xl overflow-clip py-0 gap-0">
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
                                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
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
                                                <Badge variant="outline" className="font-black text-xs uppercase">
                                                    Trip {fb.trip_number || i + 1}
                                                </Badge>
                                                <Badge
                                                    className={cn(
                                                        "font-black text-xs uppercase border-none",
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
                                            <span className="text-xs font-bold text-muted-foreground">
                                                {fb.created_at ? new Date(fb.created_at).toLocaleDateString("en-GB") : ""}
                                            </span>
                                        </div>
                                        {fb.satisfaction_level && (
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Satisfaction:</span>
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
          <Card className="border border-border shadow-sm rounded-xl overflow-clip">
              <CardHeader className="bg-muted/30 border-b px-4 py-3">
                  <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-primary/10 text-primary rounded-lg">
                          <User className="w-4 h-4" />
                      </div>
                      <CardTitle className="text-base font-black uppercase tracking-tight">Customer Sentiments</CardTitle>
                  </div>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                  <div className="space-y-2">
                      <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Overall Satisfaction</Label>
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
                                      <span className="font-bold uppercase tracking-wider text-xs">{level.label}</span>
                                  </Label>
                              </div>
                          ))}
                      </RadioGroup>
                  </div>

                  {/* Signature (Brova only) */}
                  {activeTab === "brova" && (
                      <div className="pt-3 border-t border-border/60 space-y-3">
                          <div className="flex items-center justify-between">
                              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Customer Signature <span className="text-muted-foreground/50 font-medium">(optional)</span></Label>
                              {currentState.customerSignature && (
                                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-black text-xs">SIGNED</Badge>
                              )}
                          </div>

                          {currentState.customerSignature ? (
                              <div className="relative rounded-xl border-2 border-emerald-300 bg-white p-3">
                                  <img
                                      src={currentState.customerSignature}
                                      alt="Customer signature"
                                      className="w-full h-24 object-contain"
                                  />
                                  <button
                                      onClick={() => updateGarmentState(selectedGarmentId, { customerSignature: null })}
                                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-muted/80 hover:bg-destructive/10 hover:text-destructive transition-colors"
                                  >
                                      <X className="size-3.5" />
                                  </button>
                              </div>
                          ) : (
                              <SignaturePad
                              onSave={(sig) => {
                                  updateGarmentState(selectedGarmentId, { customerSignature: sig });
                              }}
                              trigger={
                                  <button className="w-full flex flex-col items-center justify-center gap-2 h-28 rounded-xl border-2 border-dashed border-border bg-muted/10 hover:border-primary/40 hover:bg-primary/[0.02] transition-all cursor-pointer">
                                      <div className="p-2.5 rounded-full bg-muted/30">
                                          <PenTool className="size-5 text-muted-foreground/50" />
                                      </div>
                                      <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Tap to Sign</span>
                                  </button>
                              }
                          />
                          )}
                      </div>
                  )}
              </CardContent>
          </Card>

          {/* GARMENT ACTION */}
          <Card className="border border-primary/20 shadow-sm rounded-xl overflow-clip">
              <CardHeader className="bg-primary/5 border-b px-4 py-3">
                  <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-primary text-primary-foreground rounded-lg">
                          <RefreshCw className="w-4 h-4" />
                      </div>
                      <CardTitle className="text-base font-black uppercase tracking-tight">Garment Action</CardTitle>
                  </div>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                  {/* Status */}
                  <div className="space-y-2">
                      <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Status</Label>
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
                                          "flex items-center justify-center h-10 rounded-lg border-2 border-border bg-card px-2 cursor-pointer transition-all font-black uppercase tracking-tight text-xs text-center",
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
                      <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Distribution</Label>
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
                                          <span className="font-bold uppercase tracking-wide text-xs">{opt.label}</span>
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
                          disabled={!currentState.satisfaction || !currentState.feedbackAction || !currentState.distributionAction || isSubmitting || (currentState.submitted && !currentState.isEditing)}
                          className="w-full h-11 font-black uppercase tracking-widest shadow-md text-sm rounded-xl"
                      >
                          {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : currentState.submitted && !currentState.isEditing ? <Check className="w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                          {currentState.existingFeedbackId ? "Update Feedback" : "Submit Feedback"}
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
