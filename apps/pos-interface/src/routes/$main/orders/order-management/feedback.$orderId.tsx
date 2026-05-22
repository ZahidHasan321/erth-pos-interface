"use client";

import { useState, useEffect, useMemo, useRef, useCallback, memo } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ruler,
  Camera,
  Package,
  Save,
  Check,
  X,
  User,
  Clock,
  RefreshCw,
  MessageSquare,
  PenTool,
  AlertCircle,
  ArrowLeft,
  ArrowUp,
  Mic,
  MicOff,
  Play,
  Pause,
  ChevronDown,
  History,
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
import { Switch } from "@repo/ui/switch";
import { toast } from "sonner";
import { cn, parseUtcTimestamp, TIMEZONE } from "@/lib/utils";
import { ConfirmationDialog } from "@repo/ui/confirmation-dialog";
import { RadioGroup, RadioGroupItem } from "@repo/ui/radio-group";
import { SignaturePad } from "@/components/forms/signature-pad";

// API and Types
import { getOrderById } from "@/api/orders";
import { getMeasurementById, createMeasurement } from "@/api/measurements";
import { updateGarment, bulkRepointMeasurement, bulkUpdateStyleFields } from "@/api/garments";
import { createFeedback, updateFeedback, getFeedbackByGarmentId, getFeedbackByGarmentAndTrip } from "@/api/feedback";
import { uploadFeedbackPhoto, uploadFeedbackVoiceNote, uploadFeedbackSignature } from "@/lib/storage";
import { buildFinalGarmentPayload } from "@/lib/feedback-payload";
import type { Measurement, Order, Garment, Customer, GarmentFeedback } from "@repo/database";
import { evaluateBrovaFeedback, getAlterationNumber } from "@repo/database";

// Assets & Constants
import {
  collarTypes,
  collarButtons,
  jabzourTypes,
  topPocketTypes,
  cuffTypes,
  walletIcon,
  penIcon,
  phoneIcon,
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
  { type: "Arm Hole", subType: "Front", key: "armhole_front" },
  { type: "Chest", subType: "Upper", key: "chest_upper" },
  { type: "Chest", subType: "Full", key: "chest_full" },
  { type: "Chest", subType: "Half", key: "chest_front" },
  { type: "Chest", subType: "Back", key: "chest_back" },
  { type: "Shoulder", subType: "Shoulder", key: "shoulder" },
  { type: "Elbow", subType: "Elbow", key: "elbow" },
  { type: "Sleeves", subType: "Length", key: "sleeve_length" },
  { type: "Sleeves", subType: "Width", key: "sleeve_width" },
  { type: "Bottom", subType: "Bottom", key: "bottom" },
  { type: "Jabzour", subType: "Length", key: "jabzour_length" },
  { type: "Jabzour", subType: "Width", key: "jabzour_width" },
  { type: "Jabzour", subType: "2nd Btn Dist", key: "second_button_distance" },
  { type: "Basma", subType: "Length", key: "basma_length" },
  { type: "Basma", subType: "Width", key: "basma_width" },
] as const;

type MeasurementRow = (typeof MEASUREMENT_ROWS)[number];

const MEASUREMENT_GROUPS: Array<{ title: string; rows: readonly MeasurementRow[] }> = [
  {
    title: "Collar, Length & Chest",
    rows: MEASUREMENT_ROWS.filter(r =>
      ["collar_width", "collar_height", "length_front", "length_back", "chest_upper", "chest_full", "chest_front", "chest_back"].includes(r.key)
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
      ["waist_front", "waist_back", "armhole_front", "shoulder", "elbow", "sleeve_length", "sleeve_width", "bottom"].includes(r.key)
    ),
  },
  {
    title: "Jabzour",
    rows: MEASUREMENT_ROWS.filter(r =>
      ["jabzour_length", "jabzour_width", "second_button_distance"].includes(r.key)
    ),
  },
  {
    title: "Basma",
    rows: MEASUREMENT_ROWS.filter(r =>
      ["basma_length", "basma_width"].includes(r.key)
    ),
  },
];

const SATISFACTION_LEVELS = [
  { value: "angry", label: "Angry", emoji: "\u{1F621}", numericValue: 1 },
  { value: "sad", label: "Unhappy", emoji: "\u{1F61E}", numericValue: 2 },
  { value: "neutral", label: "Okay", emoji: "\u{1F636}", numericValue: 3 },
  { value: "happy", label: "Happy", emoji: "\u{1F60A}", numericValue: 4 },
  { value: "very_happy", label: "Love It", emoji: "\u{1F929}", numericValue: 5 },
];

const BROVA_FEEDBACK_OPTIONS = [
  { value: "accepted", label: "Accept", color: "peer-data-[state=checked]:border-emerald-600 peer-data-[state=checked]:text-emerald-700 peer-data-[state=checked]:ring-1 peer-data-[state=checked]:ring-emerald-600" },
  { value: "needs_repair_accepted", label: "Accept with fix", color: "peer-data-[state=checked]:border-amber-500 peer-data-[state=checked]:text-amber-700 peer-data-[state=checked]:ring-1 peer-data-[state=checked]:ring-amber-500" },
  { value: "needs_repair_rejected", label: "Reject — repair", color: "peer-data-[state=checked]:border-amber-600 peer-data-[state=checked]:text-amber-800 peer-data-[state=checked]:ring-1 peer-data-[state=checked]:ring-amber-600" },
  { value: "needs_redo", label: "Reject — redo", color: "peer-data-[state=checked]:border-destructive peer-data-[state=checked]:text-destructive peer-data-[state=checked]:ring-1 peer-data-[state=checked]:ring-destructive" },
];

const FINAL_FEEDBACK_OPTIONS = [
  { value: "accepted", label: "Accepted", color: "peer-data-[state=checked]:border-emerald-600 peer-data-[state=checked]:text-emerald-700 peer-data-[state=checked]:ring-1 peer-data-[state=checked]:ring-emerald-600" },
  { value: "needs_repair", label: "Needs repair", color: "peer-data-[state=checked]:border-amber-500 peer-data-[state=checked]:text-amber-700 peer-data-[state=checked]:ring-1 peer-data-[state=checked]:ring-amber-500" },
  { value: "needs_redo", label: "Needs redo", color: "peer-data-[state=checked]:border-destructive peer-data-[state=checked]:text-destructive peer-data-[state=checked]:ring-1 peer-data-[state=checked]:ring-destructive" },
];

// `label` is the canonical value stored & matched against in the save handler
// (e.g. "Customer Request" gates measurement propagation). `short` is the
// compact form shown in the table trigger so the 96px cell never wraps.
const DIFFERENCE_REASONS = [
  { label: "Customer Request", short: "Customer", dot: "bg-emerald-500" },
  { label: "Workshop Error", short: "Workshop", dot: "bg-destructive" },
  { label: "Shop Error", short: "Shop", dot: "bg-muted-foreground" },
];

// Lightweight option lists for non-image style fields (collar position, lines).
// BaseOption shape kept so they reuse the same picker UI; `image` left empty.
const collarPositions: BaseOption[] = [
  { value: "up", displayText: "Up", alt: "Collar up", image: null },
  { value: "down", displayText: "Down", alt: "Collar down", image: null },
  { value: "__standard__", displayText: "Standard", alt: "Standard", image: null },
];
const linesOptions: BaseOption[] = [
  { value: "1", displayText: "Single Line", alt: "Single line", image: null },
  { value: "2", displayText: "Double Line", alt: "Double line", image: null },
];

// Maps optionRows id → picker option list for style rejection replacement
const STYLE_OPTION_LISTS: Record<string, BaseOption[] | undefined> = {
  collar: collarTypes,
  collarBtn: collarButtons,
  frontPocket: topPocketTypes,
  cuff: cuffTypes,
  jabzour: jabzourTypes,
  collarPosition: collarPositions,
  lines: linesOptions,
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
  // Local cache of File/Blob for blob: preview URLs. Photos and voice notes
  // are uploaded to storage only on submit so abandoned drafts don't leave
  // orphan files in the bucket. Signatures take a separate path (data URL →
  // upload at submit, see onConfirmClick).
  pendingUploads: Record<string, { kind: "photo" | "voice"; blob: File | Blob }>;
  satisfaction: string | null;
  feedbackAction: string | null;
  distributionAction: string | null;
  isInvestigationNeeded: boolean;
  customerSignature: string | null;
  notes: string;
  submitted: boolean;
  existingFeedbackId: string | null;
  isEditing: boolean;
  // When true, Customer Request measurement edits create a new measurement
  // for THIS garment only, leaving siblings on their existing measurement.
  // Default false → existing behavior (bulk repoint across all sharing garments).
  measurementGarmentOnly: boolean;
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
  pendingUploads: {},
  satisfaction: null,
  feedbackAction: null,
  distributionAction: null,
  isInvestigationNeeded: false,
  customerSignature: null,
  notes: "",
  submitted: false,
  existingFeedbackId: null,
  isEditing: false,
  measurementGarmentOnly: false,
});

// --- Local draft persistence ---
// Keep un-submitted feedback alive across reloads. Keyed per garment+trip
// (trip increments invalidate the draft — different stage of the garment's life).
// blob: URLs and File/Blob refs can't survive a reload, so they're dropped from
// the persisted shape; un-uploaded photos/voice notes are lost on reload by design.
const DRAFT_KEY_PREFIX = "feedback-draft";
const draftKey = (garmentId: string, tripNumber: number) =>
  `${DRAFT_KEY_PREFIX}:${garmentId}:${tripNumber}`;

const toDraftJson = (st: GarmentFeedbackState) => {
  // pendingUploads holds File/Blob refs that can't be JSON-serialized — drop it.
  // Blob URLs are tied to the page session and won't resolve after reload.
  const out = { ...st } as Partial<GarmentFeedbackState>;
  delete out.pendingUploads;
  out.sharedPhotos = st.sharedPhotos.filter(p => !p.url.startsWith("blob:"));
  out.sharedVoiceNotes = st.sharedVoiceNotes.filter(u => !u.startsWith("blob:"));
  return out;
};

// Treat empty default state as no-draft so we don't litter localStorage with
// keys for every garment the user merely clicked through.
const isDraftMeaningful = (st: GarmentFeedbackState): boolean =>
  Object.keys(st.feedbackMeasurements).length > 0 ||
  Object.keys(st.differenceReasons).length > 0 ||
  Object.keys(st.measurementNotes).length > 0 ||
  Object.keys(st.optionNotes).length > 0 ||
  Object.keys(st.optionChecks).length > 0 ||
  Object.keys(st.styleChanges).length > 0 ||
  Object.keys(st.hashwaChanges).length > 0 ||
  st.sharedPhotos.some(p => !p.url.startsWith("blob:")) ||
  st.sharedVoiceNotes.some(u => !u.startsWith("blob:")) ||
  st.satisfaction !== null ||
  st.feedbackAction !== null ||
  st.distributionAction !== null ||
  st.isInvestigationNeeded ||
  !!st.customerSignature ||
  st.notes.length > 0;

const loadDraft = (garmentId: string, tripNumber: number): Partial<GarmentFeedbackState> | null => {
  try {
    const raw = localStorage.getItem(draftKey(garmentId, tripNumber));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { ...parsed, pendingUploads: {} };
  } catch {
    return null;
  }
};

const clearDraft = (garmentId: string, tripNumber: number) => {
  try { localStorage.removeItem(draftKey(garmentId, tripNumber)); } catch { /* ignore */ }
};

interface OrderWithDetails extends Order {
    customer?: Customer;
    garments?: Garment[];
}

// Memoized per-row text field for the keyed inputs inside `.map()` (measurement
// values, measurement notes, option notes). Skips re-render when its own
// `inputKey`/`value`/`onChange` are unchanged — paired with stable handlers
// below, a keystroke in one row no longer re-renders all the others.
type KeyedTextFieldProps = {
  inputKey: string;
  value: string;
  onChange: (key: string, value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">;

const KeyedTextField = memo(function KeyedTextField({
  inputKey,
  value,
  onChange,
  ...rest
}: KeyedTextFieldProps) {
  return (
    <Input
      {...rest}
      value={value}
      onChange={(e) => onChange(inputKey, e.target.value)}
    />
  );
});

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
        className="shrink-0 size-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all"
      >
        {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current ml-0.5" />}
      </button>
      <div className="flex flex-col flex-1 min-w-0 gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-muted-foreground truncate">
            {label}
          </span>
          <span className="text-[11px] font-medium tabular-nums text-muted-foreground shrink-0">
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
            className="absolute top-1/2 size-3 rounded-full bg-primary border border-background opacity-0 group-hover:opacity-100 transition-opacity -translate-x-1/2 -translate-y-1/2 pointer-events-none"
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
    // Read draft synchronously up front; overlay after DB result (or use alone
    // if no DB feedback). Draft wins on conflict — it's the user's newest edits.
    const draft = loadDraft(selectedGarmentId, tripNumber);
    getFeedbackByGarmentAndTrip(selectedGarmentId, tripNumber).then(res => {
      if (res.status === 'success' && res.data) {
        const fb = res.data;
        const satLevel = SATISFACTION_LEVELS.find(s => s.numericValue === fb.satisfaction_level);

        // Rehydrate attachments from storage URLs
        const parseJsonArray = (raw: unknown): unknown[] => {
          if (!raw) return [];
          if (Array.isArray(raw)) return raw;
          if (typeof raw !== "string") return [];
          try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
        };
        const photoEntries = parseJsonArray(fb.photo_urls)
          .map((p: any) => (typeof p === "string" ? { type: "photo" as const, url: p } : p))
          .filter((p: any) => p && typeof p.url === "string");
        const voiceEntries = parseJsonArray(fb.voice_note_urls).filter(
          (v): v is string => typeof v === "string",
        );

        // Rebuild measurement state from measurement_diffs JSON
        const feedbackMeasurements: Record<string, number | ""> = {};
        const measurementNotes: Record<string, string> = {};
        for (const row of parseJsonArray(fb.measurement_diffs)) {
          const d = row as any;
          if (!d || typeof d !== "object" || !d.field) continue;
          if (d.actual_value !== null && d.actual_value !== undefined) {
            feedbackMeasurements[d.field] = d.actual_value;
          }
          if (d.notes) measurementNotes[d.field] = d.notes;
        }

        // Rebuild option state from options_checklist JSON
        const optionChecks: Record<string, boolean> = {};
        const styleChanges: Record<string, string> = {};
        const hashwaChanges: Record<string, string> = {};
        const optionNotes: Record<string, string> = {};
        for (const row of parseJsonArray(fb.options_checklist)) {
          const o = row as any;
          if (!o || typeof o !== "object" || !o.option_name) continue;
          if (o.actual_correct === true) optionChecks[`${o.option_name}-main`] = true;
          else if (o.rejected === true) optionChecks[`${o.option_name}-main`] = false;
          if (o.hashwa_correct === true) optionChecks[`${o.option_name}-hashwa`] = true;
          else if (o.hashwa_rejected === true) optionChecks[`${o.option_name}-hashwa`] = false;
          if (o.new_value) styleChanges[o.option_name] = o.new_value;
          if (o.hashwa_new_value) hashwaChanges[o.option_name] = o.hashwa_new_value;
          if (o.notes) optionNotes[o.option_name] = o.notes;
        }

        // difference_reasons stored as plain {field: reason} object
        let differenceReasons: Record<string, string> = {};
        if (fb.difference_reasons) {
          try {
            const parsed = typeof fb.difference_reasons === "string"
              ? JSON.parse(fb.difference_reasons)
              : fb.difference_reasons;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              differenceReasons = parsed as Record<string, string>;
            }
          } catch { /* ignore */ }
        }

        updateGarmentState(selectedGarmentId, {
          feedbackAction: fb.action || null,
          distributionAction: fb.distribution || null,
          satisfaction: satLevel?.value || null,
          notes: fb.notes || "",
          customerSignature: fb.customer_signature || null,
          sharedPhotos: photoEntries as any,
          sharedVoiceNotes: voiceEntries,
          feedbackMeasurements,
          measurementNotes,
          differenceReasons,
          optionChecks,
          styleChanges,
          hashwaChanges,
          optionNotes,
          existingFeedbackId: fb.id,
          isEditing: true,
          submitted: true,
          ...(draft || {}),
        });
      } else if (draft) {
        // No DB feedback yet, but a local draft exists — restore it.
        updateGarmentState(selectedGarmentId, draft);
      }
    });
  }, [selectedGarmentId, activeGarment]);

  // Auto-set distribution when feedbackAction changes
  useEffect(() => {
    const action = currentState.feedbackAction;
    if (!action) return;
    // Rejects needing rework → force workshop.
    // Redo → dead garment, customer rejected; pickup invalid, clear if set.
    if (action === "needs_repair" || action === "needs_repair_rejected" || action === "needs_repair_accepted") {
      updateGarmentState(selectedGarmentId, { distributionAction: "workshop" });
    } else if (action === "needs_redo" && currentState.distributionAction === "pickup") {
      updateGarmentState(selectedGarmentId, { distributionAction: null });
    }
  }, [currentState.feedbackAction, currentState.distributionAction, selectedGarmentId, updateGarmentState]);

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

  // Persist garment drafts to localStorage so a reload doesn't reset in-progress
  // feedback. Debounced so a flurry of keystrokes is one write.
  useEffect(() => {
    if (!activeOrder?.garments) return;
    const t = setTimeout(() => {
      for (const [id, st] of Object.entries(garmentStates)) {
        const g = activeOrder.garments?.find(x => x.id === id);
        if (!g) continue;
        const trip = g.trip_number || 1;
        if (isDraftMeaningful(st)) {
          try { localStorage.setItem(draftKey(id, trip), JSON.stringify(toDraftJson(st))); }
          catch { /* quota / private mode — silently skip */ }
        } else {
          clearDraft(id, trip);
        }
      }
    }, 300);
    return () => clearTimeout(t);
  }, [garmentStates, activeOrder?.garments]);

  // --- Handlers ---

  // Keyed handlers below use setGarmentStates(prev => ...) directly instead of
  // updateGarmentState + currentState — that closes over `prev` (no render-time
  // dep on currentState) so the callback is stable across re-renders and the
  // memoized KeyedTextField rows actually skip work.
  const handleFeedbackMeasurementChange = useCallback((key: string, value: string) => {
    if (!selectedGarmentId) return;
    const numValue = value === "" ? "" : parseFloat(value);
    setGarmentStates(prev => {
      const cur = prev[selectedGarmentId] || createEmptyGarmentState();
      return {
        ...prev,
        [selectedGarmentId]: {
          ...cur,
          feedbackMeasurements: { ...cur.feedbackMeasurements, [key]: numValue },
        },
      };
    });
  }, [selectedGarmentId]);

  const handleDifferenceReasonChange = (key: string, value: string) => {
    updateGarmentState(selectedGarmentId, {
      differenceReasons: { ...currentState.differenceReasons, [key]: value },
    });
  };

  const handleMeasurementNoteChange = useCallback((key: string, value: string) => {
    if (!selectedGarmentId) return;
    setGarmentStates(prev => {
      const cur = prev[selectedGarmentId] || createEmptyGarmentState();
      return {
        ...prev,
        [selectedGarmentId]: {
          ...cur,
          measurementNotes: { ...cur.measurementNotes, [key]: value },
        },
      };
    });
  }, [selectedGarmentId]);

  const handleOptionNoteChange = useCallback((key: string, value: string) => {
    if (!selectedGarmentId) return;
    setGarmentStates(prev => {
      const cur = prev[selectedGarmentId] || createEmptyGarmentState();
      return {
        ...prev,
        [selectedGarmentId]: {
          ...cur,
          optionNotes: { ...cur.optionNotes, [key]: value },
        },
      };
    });
  }, [selectedGarmentId]);

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

  const handleAddPhoto = (file: File | null) => {
    if (!file) return;
    if (!selectedGarmentId) return;
    const previewUrl = URL.createObjectURL(file);
    setGarmentStates(prev => {
      const st = prev[selectedGarmentId] || createEmptyGarmentState();
      return {
        ...prev,
        [selectedGarmentId]: {
          ...st,
          sharedPhotos: [...st.sharedPhotos, { type: "photo", url: previewUrl }],
          pendingUploads: { ...st.pendingUploads, [previewUrl]: { kind: "photo", blob: file } },
        },
      };
    });
  };

  const handleRemovePhoto = (idx: number) => {
    if (!selectedGarmentId) return;
    const removed = currentState.sharedPhotos[idx];
    setGarmentStates(prev => {
      const st = prev[selectedGarmentId];
      if (!st) return prev;
      const nextPending = { ...st.pendingUploads };
      if (removed && nextPending[removed.url]) delete nextPending[removed.url];
      return {
        ...prev,
        [selectedGarmentId]: {
          ...st,
          sharedPhotos: st.sharedPhotos.filter((_, i) => i !== idx),
          pendingUploads: nextPending,
        },
      };
    });
    if (removed?.url.startsWith("blob:")) URL.revokeObjectURL(removed.url);
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

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach(t => t.stop());
        setRecordingOptionId(null);

        if (!selectedGarmentId) return;
        const previewUrl = URL.createObjectURL(blob);
        setGarmentStates(prev => {
          const st = prev[selectedGarmentId] || createEmptyGarmentState();
          return {
            ...prev,
            [selectedGarmentId]: {
              ...st,
              sharedVoiceNotes: [...st.sharedVoiceNotes, previewUrl],
              pendingUploads: { ...st.pendingUploads, [previewUrl]: { kind: "voice", blob } },
            },
          };
        });
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
    if (!selectedGarmentId) return;
    const removed = currentState.sharedVoiceNotes[idx];
    setGarmentStates(prev => {
      const st = prev[selectedGarmentId];
      if (!st) return prev;
      const nextPending = { ...st.pendingUploads };
      if (removed && nextPending[removed]) delete nextPending[removed];
      return {
        ...prev,
        [selectedGarmentId]: {
          ...st,
          sharedVoiceNotes: st.sharedVoiceNotes.filter((_, i) => i !== idx),
          pendingUploads: nextPending,
        },
      };
    });
    if (removed?.startsWith("blob:")) URL.revokeObjectURL(removed);
  };

  const onConfirmClick = () => {
    if (!currentState.satisfaction || !currentState.feedbackAction || !currentState.distributionAction) {
        toast.error("Please complete all feedback sections");
        return;
    }
    if (measurementId && isMeasurementLoading) {
        toast.error("Measurements still loading — please wait before submitting");
        return;
    }
    // Any measurement change must have a reason picked — silently dropping
    // a Customer Request because the dropdown was untouched is the bug behind
    // the "spec changed in feedback but workshop still made the old size" reports.
    const missingReason: string[] = [];
    for (const row of MEASUREMENT_ROWS) {
      const fbVal = currentState.feedbackMeasurements[row.key];
      if (fbVal === "" || fbVal === undefined) continue;
      const orig = measurement ? (measurement[row.key as keyof Measurement] as number | null) : null;
      if (orig == null) continue;
      if (Number(orig) === Number(fbVal)) continue;
      if (!currentState.differenceReasons[row.key]) {
        missingReason.push(`${row.type} ${row.subType}`);
      }
    }
    if (missingReason.length > 0) {
      toast.error(
        `Pick a reason for: ${missingReason.join(", ")} — Customer Request / Workshop Error / Shop Error`,
        { duration: 6000 },
      );
      return;
    }
    setIsConfirmDialogOpen(true);
  };

  const handleSave = async () => {
    if (!activeOrder || !selectedGarmentId || !activeGarment || !currentState.feedbackAction) return;

    setIsConfirmDialogOpen(false);
    setIsSubmitting(true);

    // Fields that bulk propagation (bulkRepointMeasurement / bulkUpdateStyleFields)
    // may mutate on sibling garments. Snapshot them now so we can detect which
    // siblings shifted under the user and reset their in-memory feedback state.
    const SIBLING_TRACKED_FIELDS = [
      "collar_type", "collar_button", "front_pocket_type", "cuffs_type",
      "jabzour_1", "jabzour_2", "small_tabaggi",
      "front_pocket_thickness", "cuffs_thickness", "jabzour_thickness",
    ] as const;
    const preSaveSnapshot: Record<string, { measurement_id: string | null; style: Record<string, unknown> }> = {};
    for (const g of activeOrder.garments || []) {
      preSaveSnapshot[g.id] = {
        measurement_id: g.measurement_id ?? null,
        style: Object.fromEntries(SIBLING_TRACKED_FIELDS.map(k => [k, (g as any)[k]])),
      };
    }

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
            const isAlterationGarment = activeGarment.garment_type === "alteration";
            const isHomeDelivery = isAlterationGarment
                ? !!(activeGarment as any).home_delivery
                : (activeOrder as any).home_delivery;

            const updatePayload = buildFinalGarmentPayload({
                feedbackAction: state.feedbackAction,
                isAlterationGarment,
                isHomeDelivery,
            });

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

            // Default: brovas bulk-repoint all order garments sharing the
            // measurement (so finals inherit the body correction). When the
            // user toggled "this garment only", skip the bulk update.
            if (
              activeGarment.garment_type === "brova" &&
              previousMeasurementId &&
              !state.measurementGarmentOnly
            ) {
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

        // --- Style propagation ---
        // Brovas: bulk-update every garment in the order sharing style_id (so
        // finals inherit the correction before they're produced). Finals and
        // alteration-order garments update only the active garment — siblings
        // may already be in a different production state and shouldn't shift.
        {
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
              // Collar position: "__standard__" sentinel means null (no position set).
              else if (opt.id === "collarPosition") {
                styleFieldUpdates.collar_position =
                  mainNewValue === "__standard__" ? null : (mainNewValue as "up" | "down");
              }
              // Lines: enum string ("1"/"2") → integer column.
              else if (opt.id === "lines") {
                const parsed = Number(mainNewValue);
                if (parsed === 1 || parsed === 2) styleFieldUpdates.lines = parsed;
              }
            }
            // Boolean accessory toggles — reject = flip current value (add if off, remove if on).
            if (mainRejected) {
              if (opt.id === "smallTabaggi") styleFieldUpdates.small_tabaggi = !activeGarment.small_tabaggi;
              else if (opt.id === "penHolder") styleFieldUpdates.pen_holder = !activeGarment.pen_holder;
              else if (opt.id === "walletPocket") styleFieldUpdates.wallet_pocket = !activeGarment.wallet_pocket;
              else if (opt.id === "mobilePocket") styleFieldUpdates.mobile_pocket = !activeGarment.mobile_pocket;
            }
            if (hashwaRejected && hashwaNewValue) {
              if (opt.id === "frontPocket") hashwaFieldUpdates.front_pocket_thickness = hashwaNewValue;
              else if (opt.id === "cuff") hashwaFieldUpdates.cuffs_thickness = hashwaNewValue;
              else if (opt.id === "jabzour") hashwaFieldUpdates.jabzour_thickness = hashwaNewValue;
              else if (opt.id === "collar") hashwaFieldUpdates.collar_thickness = hashwaNewValue;
            }
          }
          const combined = { ...styleFieldUpdates, ...hashwaFieldUpdates };
          if (Object.keys(combined).length > 0) {
            if (activeGarment.garment_type === "brova" && activeGarment.style_id != null) {
              await bulkUpdateStyleFields(activeOrder.id, activeGarment.style_id, combined);
            } else {
              await updateGarment(activeGarment.id, combined);
            }
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

        // Upload signature to Supabase Storage if it's a fresh data URL (not an existing public URL)
        let signatureUrl: string | null = state.customerSignature || null;
        if (signatureUrl && signatureUrl.startsWith("data:")) {
          try {
            const { url } = await uploadFeedbackSignature(
              signatureUrl,
              activeOrder.id,
              activeGarment.id,
              activeGarment.trip_number || 1,
            );
            signatureUrl = url;
            updateGarmentState(selectedGarmentId, { customerSignature: url });
          } catch (err) {
            toast.error(`Failed to upload signature: ${err instanceof Error ? err.message : String(err)}`);
            return;
          }
        }

        // Upload any pending photos/voice notes to storage now. Files captured
        // earlier sit in pendingUploads as blob: previews — they only become
        // real URLs at submit time so abandoned drafts don't leave orphans.
        const uploadedPhotos: Array<{ type: "photo" | "video"; url: string }> = [];
        for (const entry of state.sharedPhotos) {
          if (!entry.url.startsWith("blob:")) {
            uploadedPhotos.push(entry);
            continue;
          }
          const pending = state.pendingUploads[entry.url];
          if (!pending || pending.kind !== "photo") continue;
          try {
            const { url } = await uploadFeedbackPhoto(
              pending.blob,
              activeOrder.id,
              activeGarment.id,
              activeGarment.trip_number || 1,
            );
            uploadedPhotos.push({ type: entry.type, url });
            URL.revokeObjectURL(entry.url);
          } catch (err) {
            toast.error(`Failed to upload photo: ${err instanceof Error ? err.message : String(err)}`);
            return;
          }
        }

        const uploadedVoiceNotes: string[] = [];
        for (const u of state.sharedVoiceNotes) {
          if (!u.startsWith("blob:")) {
            uploadedVoiceNotes.push(u);
            continue;
          }
          const pending = state.pendingUploads[u];
          if (!pending || pending.kind !== "voice") continue;
          try {
            const { url } = await uploadFeedbackVoiceNote(
              pending.blob,
              activeOrder.id,
              activeGarment.id,
              activeGarment.trip_number || 1,
            );
            uploadedVoiceNotes.push(url);
            URL.revokeObjectURL(u);
          } catch (err) {
            toast.error(`Failed to upload voice note: ${err instanceof Error ? err.message : String(err)}`);
            return;
          }
        }

        // Reflect uploaded URLs back into garment state so subsequent edits see
        // them, and drop the pending blob entries we just consumed.
        setGarmentStates(prev => {
          const st = prev[selectedGarmentId!];
          if (!st) return prev;
          return {
            ...prev,
            [selectedGarmentId!]: {
              ...st,
              sharedPhotos: uploadedPhotos,
              sharedVoiceNotes: uploadedVoiceNotes,
              pendingUploads: {},
            },
          };
        });

        const persistedPhotos = uploadedPhotos;
        const persistedVoiceNotes = uploadedVoiceNotes;

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
          customer_signature: signatureUrl,
          photo_urls: persistedPhotos.length > 0
            ? JSON.stringify(persistedPhotos.map(p => p.url))
            : null,
          voice_note_urls: persistedVoiceNotes.length > 0
            ? JSON.stringify(persistedVoiceNotes)
            : null,
          notes: state.notes || null,
          difference_reasons: (() => {
            const filtered = Object.fromEntries(
              Object.entries(state.differenceReasons).filter(([key]) => {
                const v = state.feedbackMeasurements[key];
                return v !== "" && v !== undefined;
              })
            );
            return Object.keys(filtered).length > 0 ? JSON.stringify(filtered) : null;
          })(),
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

        // Submitted — drop the local draft. A subsequent edit creates a fresh one.
        clearDraft(activeGarment.id, activeGarment.trip_number || 1);

        // Refresh order data so garment pills reflect updated piece_stage
        const refreshed = await getOrderById(activeOrder.id, true);
        if (refreshed.status === 'success' && refreshed.data) {
          setActiveOrder(refreshed.data);

          // Detect siblings whose baseline shifted via bulk propagation and
          // reset their in-memory state so the rehydration effect re-runs from
          // the new baseline. Without this, the user's typed-in feedback for B
          // would be silently anchored to a stale measurement/style.
          const affectedNames: string[] = [];
          const affectedIds = new Set<string>();
          for (const g of refreshed.data.garments || []) {
            if (g.id === activeGarment.id) continue;
            const snap = preSaveSnapshot[g.id];
            if (!snap) continue;
            const measChanged = snap.measurement_id !== (g.measurement_id ?? null);
            const styleChanged = SIBLING_TRACKED_FIELDS.some(
              k => snap.style[k] !== (g as any)[k],
            );
            if (measChanged || styleChanged) {
              affectedIds.add(g.id);
              affectedNames.push(g.garment_id || g.id.slice(0, 8));
            }
          }
          if (affectedIds.size > 0) {
            // Also drop any localStorage drafts for the affected siblings —
            // they were anchored to a stale baseline.
            for (const id of affectedIds) {
              const g = refreshed.data.garments?.find(x => x.id === id);
              if (g) clearDraft(id, g.trip_number || 1);
            }
            setGarmentStates(prev => {
              const next = { ...prev };
              let mutated = false;
              for (const id of affectedIds) {
                if (next[id]) { delete next[id]; mutated = true; }
              }
              return mutated ? next : prev;
            });
            toast.warning(
              `Baseline updated for ${affectedNames.join(", ")} — please re-verify before submitting.`,
              { duration: 6000 },
            );
          }
        }

        // Invalidate dispatch queries so "Return to Workshop" tab is fresh
        if (state.distributionAction === "workshop") {
          queryClient.invalidateQueries({ queryKey: ["redispatchGarments"] });
          queryClient.invalidateQueries({ queryKey: ["dispatchOrders"] });
        }

        // Balance check for final collection
        const balance = (Number(activeOrder?.order_total) || 0) - (Number(activeOrder?.paid) || 0);

        if (state.feedbackAction === "accepted" &&
            (activeGarment.garment_type === "final" || activeGarment.garment_type === "alteration")) {
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

  // Boolean accessory toggles (no picker — rejection flips the value).
  // Centralized so the JSX, the propagation switch, and the diff log all agree.
  const BOOL_OPT_FIELDS: Record<string, keyof Garment> = {
    smallTabaggi: "small_tabaggi",
    penHolder: "pen_holder",
    walletPocket: "wallet_pocket",
    mobilePocket: "mobile_pocket",
  };
  const BOOL_OPT_NAMES: Record<string, string> = {
    smallTabaggi: "Small Tabbagi",
    penHolder: "Pen Holder",
    walletPocket: "Wallet Pocket",
    mobilePocket: "Mobile Pocket",
  };
  const isBoolOpt = (id: string) => id in BOOL_OPT_FIELDS;
  const getBoolCurrent = (id: string): boolean => {
    if (!activeGarment) return false;
    const field = BOOL_OPT_FIELDS[id];
    return !!(field && (activeGarment as any)[field]);
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
        hashwaLabel: "Hashwa",
        hashwaValue: g.collar_thickness,
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
      // Accessories — always shown so customer can ADD as well as REMOVE.
      {
        id: "walletPocket",
        label: "Wallet Pocket",
        mainValue: g.wallet_pocket ? "Yes" : "No",
        displayText: g.wallet_pocket ? "Yes — Wallet pocket present" : "No — Not applied",
        mainImage: walletIcon as string | null,
        hashwaLabel: null as string | null,
        hashwaValue: null as string | null
      },
      {
        id: "penHolder",
        label: "Pen Holder",
        mainValue: g.pen_holder ? "Yes" : "No",
        displayText: g.pen_holder ? "Yes — Pen holder present" : "No — Not applied",
        mainImage: penIcon as string | null,
        hashwaLabel: null as string | null,
        hashwaValue: null as string | null
      },
      {
        id: "mobilePocket",
        label: "Mobile Pocket",
        mainValue: g.mobile_pocket ? "Yes" : "No",
        displayText: g.mobile_pocket ? "Yes — Mobile pocket present" : "No — Not applied",
        mainImage: phoneIcon as string | null,
        hashwaLabel: null as string | null,
        hashwaValue: null as string | null
      },
      // Collar position — three-state (up / down / null=standard).
      {
        id: "collarPosition",
        label: "Collar Position",
        mainValue: g.collar_position ?? "__standard__",
        displayText: findDisplayText(collarPositions, g.collar_position ?? "__standard__"),
        mainImage: null,
        hashwaLabel: null,
        hashwaValue: null,
      },
      // Lines — single (1) or double (2). Stored as integer on DB.
      {
        id: "lines",
        label: "Lines",
        mainValue: String(g.lines ?? 1),
        displayText: findDisplayText(linesOptions, String(g.lines ?? 1)),
        mainImage: null,
        hashwaLabel: null,
        hashwaValue: null,
      },
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
          <Skeleton className="h-10 w-28 rounded-md" />
        </div>
        {/* Tabs skeleton */}
        <Skeleton className="h-10 w-80 rounded-md" />
        {/* Content skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-48 rounded-md" />
            <Skeleton className="h-32 rounded-md" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-40 rounded-md" />
            <Skeleton className="h-24 rounded-md" />
          </div>
        </div>
      </div>
    );
  }

  if (!activeOrder) {
    return (
      <div className="p-4 md:p-5 max-w-6xl mx-auto flex flex-col items-center justify-center py-10 text-center">
        <div className="size-14 bg-muted/30 rounded-full flex items-center justify-center mb-4 border border-dashed border-border shadow-inner">
          <Package className="w-10 h-10 text-muted-foreground/40" />
        </div>
        <h3 className="text-lg font-medium text-foreground">Order not found</h3>
        <p className="text-muted-foreground text-sm mt-2">This order could not be loaded.</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => router.history.back()}>
          <ArrowLeft className="size-3.5 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-5 max-w-6xl mx-auto space-y-4 pb-20">

      {/* Header — compact one-row context strip */}
      {(() => {
        const balance = (activeOrder.order_total || 0) - (activeOrder.paid || 0);
        const isHomeDelivery = !!(activeOrder as any).home_delivery;
        return (
          <div className="flex items-center gap-3 flex-wrap border-b border-border pb-3">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => router.history.back()}>
              <ArrowLeft className="size-4" />
            </Button>

            <div className="flex items-baseline gap-2 min-w-0">
              <h1 className="text-base font-medium text-foreground truncate">
                {activeOrder.customer?.name || "Guest"}
              </h1>
              <span className="text-xs text-muted-foreground tabular-nums">#{activeOrder.id}</span>
              {activeOrder.invoice_number && (
                <span className="text-xs text-muted-foreground tabular-nums hidden sm:inline">
                  · INV {activeOrder.invoice_number}
                </span>
              )}
              {activeOrder.customer?.phone && (
                <span className="text-xs text-muted-foreground font-mono hidden md:inline">
                  · {activeOrder.customer.phone}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 ml-auto text-xs">
              {activeGarment?.garment_type === "brova" && (
                <Badge variant="outline" className="font-normal">Brova trial</Badge>
              )}
              {activeGarment?.garment_type === "final" && (
                <Badge variant="outline" className="font-normal">Final pickup</Badge>
              )}
              {activeGarment?.garment_type === "alteration" && (
                <Badge variant="outline" className="font-normal">Alteration</Badge>
              )}
              {currentState.isEditing && (
                <Badge variant="outline" className="font-normal">Editing</Badge>
              )}
              <span className="text-muted-foreground tabular-nums">
                Paid <span className="text-foreground">{activeOrder.paid || 0} KWD</span>
              </span>
              <span className={cn("tabular-nums", balance > 0 ? "text-destructive" : "text-muted-foreground")}>
                · {balance > 0 ? `Balance ${balance.toFixed(3)} KWD` : "Paid in full"}
              </span>
              <span className="text-muted-foreground hidden md:inline">
                · {isHomeDelivery ? "Home delivery" : "Pickup"}
              </span>
            </div>
          </div>
        );
      })()}

      <div className="space-y-4">

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
                        className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary border border-border bg-card px-3 h-8 rounded-md gap-2 transition-colors"
                    >
                        <span className="text-sm font-medium tabular-nums">{garment.garment_id}</span>
                        <span className="text-[10px] opacity-70">
                            {(() => {
                                const altNum = getAlterationNumber(garment.trip_number);
                                if (altNum !== null) return `Alt ${altNum}`;
                                if (garment.garment_type === 'brova') return "Brova";
                                if (garment.garment_type === 'alteration') return "Alt";
                                return "Final";
                            })()}
                        </span>
                        {isSubmitted && (
                            <span className="size-1.5 rounded-full bg-emerald-500" aria-label="Submitted" />
                        )}
                    </TabsTrigger>
                    );
                })}
                </TabsList>
            </div>

            <TabsContent value={selectedGarmentId || ""} className="mt-0 space-y-4 focus-visible:ring-0">

                 {/* MEASUREMENT feedback SECTION */}
                <Card className="border border-border overflow-clip rounded-md py-0 gap-0">
                    <CardHeader className="bg-muted/30 border-b px-4 py-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <Ruler className="size-4 text-muted-foreground" />
                                <CardTitle className="text-sm font-medium">Measurement feedback</CardTitle>
                            </div>
                            <div className="flex items-center gap-2">
                                {isMeasurementLoading ? (
                                    <Badge variant="outline" className="bg-background font-semibold text-xs h-6 px-2">LOADING…</Badge>
                                ) : measurementId ? (
                                    <Badge variant="outline" className="bg-background font-mono font-medium text-[10px] h-6 px-2" title="Measurement ID">
                                        M: {String(measurementId).slice(0, 8)}
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="bg-background font-semibold text-xs h-6 px-2">NO MEASUREMENT</Badge>
                                )}
                            </div>
                        </div>
                    </CardHeader>

                    {/* Scope toggle — only meaningful when bulk propagation would otherwise fire (brova) */}
                    {activeGarment?.garment_type === "brova" && (
                        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-muted/30 border-b border-border">
                            <div className="flex items-start gap-2 min-w-0">
                                <AlertCircle className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                                <div className="min-w-0">
                                    <p className="text-xs font-medium">This garment only</p>
                                    <p className="text-xs text-muted-foreground leading-snug">
                                        {currentState.measurementGarmentOnly
                                            ? "Customer-request edits create a new measurement for this brova only — siblings unchanged."
                                            : "Customer-request edits update every garment on this order sharing this measurement."}
                                    </p>
                                </div>
                            </div>
                            <Switch
                                checked={currentState.measurementGarmentOnly}
                                onCheckedChange={(v) =>
                                    updateGarmentState(selectedGarmentId, { measurementGarmentOnly: v })
                                }
                                aria-label="Apply measurement changes to this garment only"
                            />
                        </div>
                    )}

                    <div className="p-3 space-y-4">
                        {MEASUREMENT_GROUPS.map((group) => (
                            <div key={group.title} className="rounded-lg border border-border/60 overflow-hidden">
                                <div className="bg-muted/40 px-3 py-1.5 border-b border-border/60 text-[11px] font-medium text-muted-foreground">
                                    {group.title}
                                </div>
                                <div className="relative overflow-x-auto">
                                    <table className="border-collapse table-fixed">
                                        <thead className="bg-muted/30 border-b border-border/60">
                                            <tr className="text-xs font-medium text-muted-foreground">
                                                <th className="text-left p-3 bg-muted/50 border-r border-border/60 w-[110px] sticky left-0 z-20">Label</th>
                                                {group.rows.map((row) => (
                                                    <th key={row.key} className="p-2 text-center border border-border/40 w-[96px]">
                                                        <div className="font-semibold text-[11px] leading-tight">{row.type}</div>
                                                        <div className="font-medium text-[10px] text-muted-foreground leading-tight">{row.subType}</div>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {/* Current row */}
                                            <tr className="border-b border-border/40">
                                                <td className="p-3 bg-muted/40 border-r border-border/60 text-xs font-medium text-muted-foreground sticky left-0 z-10">Current</td>
                                                {group.rows.map((row) => {
                                                    const orderValue = measurement ? (measurement[row.key as keyof Measurement] as number | null) : undefined;
                                                    return (
                                                        <td key={row.key} className="p-2 text-center border border-border/30 bg-muted/20">
                                                            {orderValue != null ? (
                                                                <span className="font-semibold text-sm tabular-nums">{orderValue}</span>
                                                            ) : (
                                                                <span className="text-muted-foreground/40 text-xs">·</span>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                            {/* New row */}
                                            <tr className="border-b border-border/40">
                                                <td className="p-3 bg-primary/5 border-r border-border/60 text-xs font-medium text-primary sticky left-0 z-10">New</td>
                                                {group.rows.map((row) => {
                                                    const orderValue = measurement ? (measurement[row.key as keyof Measurement] as number | null) : undefined;
                                                    const feedbackValue = currentState.feedbackMeasurements[row.key];
                                                    const diff = getDifference(orderValue, feedbackValue);
                                                    const status = getDiffStatus(diff);
                                                    return (
                                                        <td key={row.key} className="p-1 border border-border/30 bg-primary/[0.02]">
                                                            <KeyedTextField
                                                                type="number"
                                                                step="0.01"
                                                                className={cn(
                                                                    "h-8 w-full text-center font-semibold text-sm tabular-nums border transition-all",
                                                                    status === 'error' && "border-destructive bg-destructive/5 text-destructive",
                                                                    status === 'warning' && "border-amber-500 bg-amber-50 text-amber-700",
                                                                    status === 'success' && "border-emerald-500 bg-emerald-50 text-emerald-700",
                                                                    !feedbackValue && "border-border hover:border-primary/40"
                                                                )}
                                                                inputKey={row.key}
                                                                value={feedbackValue === "" || feedbackValue == null ? "" : String(feedbackValue)}
                                                                onChange={handleFeedbackMeasurementChange}
                                                            />
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                            {/* Delta row */}
                                            <tr className="border-b border-border/40">
                                                <td className="p-3 bg-muted/40 border-r border-border/60 text-xs font-medium text-muted-foreground sticky left-0 z-10">Delta</td>
                                                {group.rows.map((row) => {
                                                    const orderValue = measurement ? (measurement[row.key as keyof Measurement] as number | null) : undefined;
                                                    const feedbackValue = currentState.feedbackMeasurements[row.key];
                                                    const diff = getDifference(orderValue, feedbackValue);
                                                    const status = getDiffStatus(diff);
                                                    return (
                                                        <td key={row.key} className="p-2 text-center border border-border/30">
                                                            {diff !== null && (
                                                                <Badge variant="secondary" className={cn(
                                                                    "font-semibold text-xs h-5 px-1.5",
                                                                    status === 'success' && "bg-emerald-100 text-emerald-800 border-emerald-200",
                                                                    status === 'warning' && "bg-amber-100 text-amber-800 border-amber-200",
                                                                    status === 'error' && "bg-red-100 text-red-800 border-border"
                                                                )}>
                                                                    {diff > 0 ? `+${diff}` : diff}
                                                                </Badge>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                            {/* Reason row */}
                                            <tr className="border-b border-border/40">
                                                <td className="p-3 bg-muted/40 border-r border-border/60 text-xs font-medium text-muted-foreground sticky left-0 z-10">Reason</td>
                                                {group.rows.map((row) => {
                                                    const reasonValue = currentState.differenceReasons[row.key] || "";
                                                    const selectedReason = DIFFERENCE_REASONS.find(r => r.label === reasonValue);
                                                    return (
                                                        <td key={row.key} className="p-0 border border-border/30">
                                                            <Select value={reasonValue} onValueChange={(val) => handleDifferenceReasonChange(row.key, val)}>
                                                                <SelectTrigger
                                                                    className="h-10 w-full text-xs font-medium border-none shadow-none rounded-none px-2 bg-transparent hover:bg-muted/30 transition-colors"
                                                                    aria-label="Reason for measurement difference"
                                                                >
                                                                    {selectedReason ? (
                                                                        <span className="flex items-center gap-1.5 truncate">
                                                                            <span className={cn("size-1.5 rounded-full shrink-0", selectedReason.dot)} />
                                                                            <span className="truncate">{selectedReason.short}</span>
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-muted-foreground/50">·</span>
                                                                    )}
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {DIFFERENCE_REASONS.map(r => (
                                                                        <SelectItem key={r.label} value={r.label} className="text-xs font-medium py-2">
                                                                            <span className="flex items-center gap-2">
                                                                                <span className={cn("size-1.5 rounded-full", r.dot)} />
                                                                                {r.label}
                                                                            </span>
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
                                                <td className="p-3 bg-muted/40 border-r border-border/60 text-xs font-medium text-muted-foreground sticky left-0 z-10">Notes</td>
                                                {group.rows.map((row) => {
                                                    const noteValue = currentState.measurementNotes[row.key] || "";
                                                    return (
                                                        <td key={row.key} className="p-1 border border-border/30">
                                                            <KeyedTextField
                                                                className="h-8 w-full text-[11px] font-medium border-none shadow-none focus-visible:ring-1 focus-visible:ring-primary bg-transparent px-1.5"
                                                                inputKey={row.key}
                                                                value={noteValue}
                                                                onChange={handleMeasurementNoteChange}
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
                <Card className="border border-border rounded-md overflow-clip py-0 gap-0">
                    <CardHeader className="bg-muted/30 border-b px-4 py-3">
                        <div className="flex items-center gap-2.5">
                            <PenTool className="size-4 text-muted-foreground" />
                            <CardTitle className="text-sm font-medium">Style feedback</CardTitle>
                            <Badge variant="secondary" className="ml-auto text-xs font-medium">
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
                                            "rounded-md border bg-card p-3 transition-colors",
                                            isConfirmed && "border-emerald-500/50",
                                            isRejected && "border-destructive/60",
                                            !isConfirmed && !isRejected && "border-border"
                                        )}
                                    >
                                        <div className="flex items-stretch gap-3">
                                            {/* Current option image */}
                                            {opt.mainImage ? (
                                                <div className="h-12 w-12 shrink-0 rounded-md border border-border p-1 bg-background">
                                                    <img src={opt.mainImage} alt={opt.label} className="w-full h-full object-contain" />
                                                </div>
                                            ) : (
                                                <div className="h-12 w-12 shrink-0 bg-muted/20 rounded-md border border-dashed border-border flex items-center justify-center">
                                                    <Package className="w-4 h-4 text-muted-foreground/40" />
                                                </div>
                                            )}

                                            {/* Label + current value */}
                                            <div className="flex-1 min-w-0 flex flex-col justify-between">
                                                <div>
                                                    <p className="text-sm font-medium text-foreground">{opt.label}</p>
                                                    <p className="text-xs text-muted-foreground truncate">{opt.displayText || opt.mainValue}</p>
                                                </div>
                                                {opt.hashwaValue && (
                                                    <Badge
                                                        variant="outline"
                                                        className={cn(
                                                            "self-start font-normal text-[10px] h-4 px-1.5 mt-1",
                                                            hashwaConfirmed && "border-emerald-500/50 text-emerald-700",
                                                            hashwaRejected && "border-destructive/60 text-destructive",
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
                                                        "flex items-center justify-center gap-1 px-2 h-7 rounded-md border text-xs font-medium transition-colors",
                                                        isConfirmed
                                                            ? "bg-emerald-600 border-emerald-600 text-white"
                                                            : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
                                                    )}
                                                >
                                                    <Check className="w-3 h-3" />
                                                    {isBoolOpt(opt.id) ? "Keep" : "OK"}
                                                </button>
                                                <button
                                                    onClick={() => handleCheck(`${opt.id}-main`, false)}
                                                    className={cn(
                                                        "flex items-center justify-center gap-1 px-2 h-7 rounded-md border text-xs font-medium transition-colors whitespace-nowrap",
                                                        // Booleans: green when reject = ADD, red when reject = REMOVE.
                                                        isRejected
                                                            ? (isBoolOpt(opt.id) && !getBoolCurrent(opt.id)
                                                                ? "bg-emerald-600 border-emerald-600 text-white"
                                                                : "bg-destructive border-destructive text-white")
                                                            : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
                                                    )}
                                                >
                                                    <X className="w-3 h-3" />
                                                    {isBoolOpt(opt.id)
                                                        ? (getBoolCurrent(opt.id) ? `Remove ${BOOL_OPT_NAMES[opt.id]}` : `Add ${BOOL_OPT_NAMES[opt.id]}`)
                                                        : "No"}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Rejected → pick new main style */}
                                        {isRejected && pickerList && (
                                            <div className="mt-3 pt-3 border-t border-border space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-muted-foreground shrink-0">New →</span>
                                                    <Select value={newStyleValue} onValueChange={(v) => handleStyleChange(opt.id, v)}>
                                                        <SelectTrigger className="h-10 flex-1 bg-background border-border">
                                                            {newStyleValue ? (
                                                                <div className="flex items-center gap-2">
                                                                    {newStyleImage && <img src={newStyleImage} alt={newStyleText || ""} className="h-7 w-7 object-contain" />}
                                                                    <span className="text-xs font-medium">{newStyleText}</span>
                                                                </div>
                                                            ) : (
                                                                <SelectValue placeholder="Select replacement..." />
                                                            )}
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {pickerList.map((o) => {
                                                                const isCurrent = o.value === opt.mainValue || o.displayText === opt.mainValue;
                                                                return (
                                                                    <SelectItem key={o.value} value={o.value} disabled={isCurrent}>
                                                                        <div className="flex items-center gap-2">
                                                                            {o.image && <img src={o.image} alt={o.alt} className="h-8 w-8 object-contain" />}
                                                                            <span className="text-xs font-medium">{o.displayText}</span>
                                                                            {isCurrent && <span className="text-[10px] text-muted-foreground ml-1">(current)</span>}
                                                                        </div>
                                                                    </SelectItem>
                                                                );
                                                            })}
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
                                                            <span className="text-xs text-muted-foreground shrink-0">Under Zipper →</span>
                                                            <Select value={secondaryValue} onValueChange={(v) => handleStyleChange("jabzour_2", v)}>
                                                                <SelectTrigger className="h-10 flex-1 bg-background border-border">
                                                                    {secondaryValue ? (
                                                                        <div className="flex items-center gap-2">
                                                                            {secondaryImage && <img src={secondaryImage} alt={secondaryText || ""} className="h-7 w-7 object-contain" />}
                                                                            <span className="text-xs font-medium">{secondaryText}</span>
                                                                        </div>
                                                                    ) : (
                                                                        <SelectValue placeholder="Select jabzour style..." />
                                                                    )}
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {secondaryList.map((o) => {
                                                                        const currentSecondary = activeGarment?.jabzour_2 ?? null;
                                                                        const isCurrent = !!currentSecondary && (o.value === currentSecondary || o.displayText === currentSecondary);
                                                                        return (
                                                                            <SelectItem key={o.value} value={o.value} disabled={isCurrent}>
                                                                                <div className="flex items-center gap-2">
                                                                                    {o.image && <img src={o.image} alt={o.alt} className="h-8 w-8 object-contain" />}
                                                                                    <span className="text-xs font-medium">{o.displayText}</span>
                                                                                    {isCurrent && <span className="text-[10px] text-muted-foreground ml-1">(current)</span>}
                                                                                </div>
                                                                            </SelectItem>
                                                                        );
                                                                    })}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        )}

                                        {/* Boolean reject → flip indicator (no picker). */}
                                        {isRejected && isBoolOpt(opt.id) && (() => {
                                            const removing = getBoolCurrent(opt.id);
                                            return (
                                                <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                                                    <span className="text-xs text-muted-foreground shrink-0">New →</span>
                                                    <Badge
                                                        variant="outline"
                                                        className={cn(
                                                            "font-medium text-xs",
                                                            removing ? "text-destructive border-destructive/40" : "text-emerald-700 border-emerald-500/40"
                                                        )}
                                                    >
                                                        {removing ? `Remove ${BOOL_OPT_NAMES[opt.id]}` : `Add ${BOOL_OPT_NAMES[opt.id]}`}
                                                    </Badge>
                                                </div>
                                            );
                                        })()}

                                        {/* Hashwa row */}
                                        {opt.hashwaValue && (
                                            <div className="mt-2 pt-2 border-t border-border/40 flex items-center gap-2">
                                                <span className="text-xs text-muted-foreground shrink-0">Hashwa</span>
                                                <button
                                                    onClick={() => handleCheck(`${opt.id}-hashwa`, true)}
                                                    className={cn(
                                                        "flex items-center gap-1 px-2 h-6 rounded-md border text-xs font-medium transition-colors",
                                                        hashwaConfirmed
                                                            ? "bg-emerald-600 border-emerald-600 text-white"
                                                            : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
                                                    )}
                                                >
                                                    <Check className="w-3 h-3" /> OK
                                                </button>
                                                <button
                                                    onClick={() => handleCheck(`${opt.id}-hashwa`, false)}
                                                    className={cn(
                                                        "flex items-center gap-1 px-2 h-6 rounded-md border text-xs font-medium transition-colors",
                                                        hashwaRejected
                                                            ? "bg-destructive border-destructive text-white"
                                                            : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
                                                    )}
                                                >
                                                    <X className="w-3 h-3" /> No
                                                </button>
                                                {hashwaRejected && (
                                                    <Select value={newHashwaValue} onValueChange={(v) => handleHashwaChange(opt.id, v)}>
                                                        <SelectTrigger className="h-7 text-[11px] flex-1 bg-background border-border">
                                                            <SelectValue placeholder="New thickness..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {thicknessOptions.map((t) => {
                                                                const isCurrent = t.value === opt.hashwaValue;
                                                                return (
                                                                    <SelectItem key={t.value} value={t.value} disabled={isCurrent} className="text-xs font-medium">
                                                                        {t.value === "NO HASHWA" ? "No Hashwa" : t.value.charAt(0) + t.value.slice(1).toLowerCase()}
                                                                        {isCurrent && <span className="text-[10px] text-muted-foreground ml-1">(current)</span>}
                                                                    </SelectItem>
                                                                );
                                                            })}
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            </div>
                                        )}

                                        {/* Notes */}
                                        <div className="mt-2 flex items-center gap-2 bg-muted/20 rounded px-2 border border-transparent focus-within:border-primary/30 focus-within:bg-background transition-all">
                                            <MessageSquare className="size-3.5 text-muted-foreground/40 shrink-0" />
                                            <KeyedTextField
                                                className="border-none shadow-none focus-visible:ring-0 bg-transparent text-[11px] font-medium h-7 p-0"
                                                placeholder="Note..."
                                                inputKey={opt.id}
                                                value={currentState.optionNotes[opt.id] || ""}
                                                onChange={handleOptionNoteChange}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                {/* SHARED MEDIA (photos + voice notes) */}
                <Card className="border border-border rounded-md overflow-clip py-0 gap-0">
                    <CardHeader className="bg-muted/30 border-b px-4 py-3">
                        <div className="flex items-center gap-2.5">
                            <Camera className="size-4 text-muted-foreground" />
                            <CardTitle className="text-sm font-medium">Attachments</CardTitle>
                            <Badge variant="secondary" className="ml-auto text-xs font-medium">
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
                                className="h-9 font-medium text-xs"
                                onClick={() => document.getElementById("shared-photo-input")?.click()}
                            >
                                <Camera className="w-3.5 h-3.5 mr-1.5" />
                                Add Photo
                            </Button>
                            <Button
                                variant={recordingOptionId === "shared" ? "destructive" : "outline"}
                                size="sm"
                                className="h-9 font-medium text-xs"
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
                            <div className="flex items-center gap-2 p-2 rounded-md border border-destructive/30 bg-destructive/5">
                                <div className="size-2 rounded-full bg-destructive animate-pulse" />
                                <span className="text-xs font-medium text-destructive">Recording…</span>
                            </div>
                        )}

                        {/* Photo thumbnails */}
                        {currentState.sharedPhotos.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {currentState.sharedPhotos.map((p, i) => (
                                    <div key={i} className="relative group size-20 rounded-lg overflow-hidden border border-border">
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
                            <p className="text-xs text-muted-foreground text-center py-2">
                                No attachments yet
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* PREVIOUS FEEDBACK HISTORY */}
                {feedbackHistory.length > 0 && (
                    <Card className="border border-border rounded-md overflow-clip py-0 gap-0">
                        <CardHeader
                            className="bg-muted/30 border-b px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                            onClick={() => setHistoryOpen(!historyOpen)}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <History className="size-4 text-muted-foreground" />
                                    <div>
                                        <CardTitle className="text-sm font-medium">Previous feedback</CardTitle>
                                        <p className="text-xs text-muted-foreground mt-0.5">
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
                                    <div key={fb.id} className="p-3 rounded-md border border-border/60 bg-muted/10 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="text-xs font-normal">
                                                    Trip {fb.trip_number || i + 1}
                                                </Badge>
                                                <Badge
                                                    variant="outline"
                                                    className={cn(
                                                        "text-xs font-medium",
                                                        (fb.action === "accepted" || fb.action === "collected") && "border-emerald-500/40 text-emerald-700",
                                                        fb.action === "needs_repair_accepted" && "border-amber-500/40 text-amber-700",
                                                        fb.action === "needs_repair_rejected" && "border-amber-600/40 text-amber-800",
                                                        fb.action === "needs_redo" && "border-destructive/40 text-destructive",
                                                        fb.action === "delivered" && "border-primary/40 text-primary",
                                                    )}
                                                >
                                                    {fb.action?.replace(/_/g, " ")}
                                                </Badge>
                                            </div>
                                            <span className="text-xs font-medium text-muted-foreground">
                                                {fb.created_at ? parseUtcTimestamp(fb.created_at).toLocaleDateString("en-GB", { timeZone: TIMEZONE }) : ""}
                                            </span>
                                        </div>
                                        {fb.satisfaction_level && (
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-muted-foreground">Satisfaction:</span>
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
          <Card className="border border-border rounded-md overflow-clip">
              <CardHeader className="bg-muted/30 border-b px-4 py-3">
                  <div className="flex items-center gap-2.5">
                      <User className="size-4 text-muted-foreground" />
                      <CardTitle className="text-sm font-medium">Customer sentiments</CardTitle>
                  </div>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                  <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">Overall Satisfaction <span className="text-destructive">*</span></Label>
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
                                      className="flex flex-col items-center justify-center gap-0.5 h-14 rounded-md border border-border bg-card p-2 cursor-pointer transition-colors grayscale opacity-60 hover:opacity-100 hover:grayscale-0 hover:border-muted-foreground/40 peer-data-[state=checked]:opacity-100 peer-data-[state=checked]:grayscale-0 peer-data-[state=checked]:border-primary peer-data-[state=checked]:ring-1 peer-data-[state=checked]:ring-primary"
                                  >
                                      <span className="text-2xl leading-none">{level.emoji}</span>
                                      <span className="text-[10px] text-muted-foreground">{level.label}</span>
                                  </Label>
                              </div>
                          ))}
                      </RadioGroup>
                  </div>

                  {/* Signature (Brova only) */}
                  {activeTab === "brova" && (
                      <div className="pt-3 border-t border-border/60 space-y-3">
                          <div className="flex items-center justify-between">
                              <Label className="text-xs font-medium text-muted-foreground">Customer Signature <span className="text-muted-foreground/50 font-medium">(optional)</span></Label>
                              {currentState.customerSignature && (
                                  <Badge variant="outline" className="text-emerald-700 border-emerald-500/50 text-xs font-medium">Signed</Badge>
                              )}
                          </div>

                          {currentState.customerSignature ? (
                              <div className="relative rounded-md border border-emerald-500/40 bg-white p-3">
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
                                  <button className="w-full flex flex-col items-center justify-center gap-2 h-28 rounded-md border border-dashed border-border bg-muted/10 hover:border-primary/40 hover:bg-primary/[0.02] transition-all cursor-pointer">
                                      <div className="p-2.5 rounded-full bg-muted/30">
                                          <PenTool className="size-5 text-muted-foreground/50" />
                                      </div>
                                      <span className="text-xs font-medium text-muted-foreground">Tap to Sign</span>
                                  </button>
                              }
                          />
                          )}
                      </div>
                  )}
              </CardContent>
          </Card>

          {/* GARMENT ACTION */}
          <Card className="border border-primary/20 rounded-md overflow-clip">
              <CardHeader className="bg-primary/5 border-b px-4 py-3">
                  <div className="flex items-center gap-2.5">
                      <RefreshCw className="size-4 text-muted-foreground" />
                      <CardTitle className="text-sm font-medium">Garment action</CardTitle>
                  </div>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                  {/* Status */}
                  <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">Status <span className="text-destructive">*</span></Label>
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
                                          "flex items-center justify-center h-10 rounded-lg border border-border bg-card px-2 cursor-pointer transition-all font-medium text-xs text-center",
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
                      <div className="p-3 rounded-md border border-destructive/30 bg-destructive/5">
                          <div className="flex items-center gap-3">
                              <AlertCircle className="size-4 text-destructive shrink-0" />
                              <p className="text-sm font-medium text-destructive flex-1">Investigation required?</p>
                              <Checkbox
                                  id="investigation"
                                  checked={currentState.isInvestigationNeeded}
                                  onCheckedChange={(c) => updateGarmentState(selectedGarmentId, { isInvestigationNeeded: c as boolean })}
                              />
                          </div>
                      </div>
                  )}

                  {/* Distribution */}
                  <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">Distribution <span className="text-destructive">*</span></Label>
                      <RadioGroup
                          value={currentState.distributionAction || ""}
                          onValueChange={(val) => updateGarmentState(selectedGarmentId, { distributionAction: val })}
                          className="grid grid-cols-3 gap-2"
                      >
                          {[
                            { value: "pickup", label: "Customer pickup", icon: Package },
                            { value: "workshop", label: "To workshop", icon: RefreshCw },
                            { value: "shop", label: "Stay at shop", icon: Clock },
                          ].map((opt) => {
                              const action = currentState.feedbackAction;
                              const forceWorkshop =
                                action === "needs_repair" ||
                                action === "needs_repair_rejected" ||
                                action === "needs_repair_accepted";
                              const isDisabled =
                                (forceWorkshop && opt.value !== "workshop") ||
                                (action === "needs_redo" && opt.value === "pickup");
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
                                              "flex items-center justify-center gap-2 h-10 rounded-md border border-border bg-card px-2 cursor-pointer transition-colors text-sm font-medium peer-data-[state=checked]:border-primary peer-data-[state=checked]:ring-1 peer-data-[state=checked]:ring-primary",
                                              isDisabled && "opacity-40 cursor-not-allowed"
                                          )}
                                      >
                                          <opt.icon className="size-3.5 text-muted-foreground" />
                                          <span>{opt.label}</span>
                                      </Label>
                                  </div>
                              );
                          })}
                      </RadioGroup>
                  </div>

                  {/* Notes + Submit */}
                  <div className="space-y-3">
                      <Textarea
                          placeholder="Finalization notes…"
                          className="min-h-[60px] rounded-md border resize-none text-sm"
                          value={currentState.notes}
                          onChange={(e) => updateGarmentState(selectedGarmentId, { notes: e.target.value })}
                      />
                      {(() => {
                        const missing: string[] = [];
                        if (!currentState.satisfaction) missing.push("Overall Satisfaction");
                        if (!currentState.feedbackAction) missing.push("Status");
                        if (!currentState.distributionAction) missing.push("Distribution");
                        const lockedDone = currentState.submitted && !currentState.isEditing;
                        return (
                          <>
                            <Button
                                onClick={onConfirmClick}
                                disabled={missing.length > 0 || isSubmitting || lockedDone || (!!measurementId && isMeasurementLoading)}
                                className="w-full h-11 font-medium text-sm rounded-md"
                            >
                                {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : lockedDone ? <Check className="w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                {currentState.existingFeedbackId ? "Update Feedback" : "Submit Feedback"}
                            </Button>
                            {missing.length > 0 && !lockedDone && (
                              <p className="text-xs text-destructive text-center">
                                Required: {missing.join(", ")}
                              </p>
                            )}
                          </>
                        );
                      })()}
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
        className="fixed bottom-6 right-6 z-50 h-10 w-10 rounded-full shadow-md"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      >
        <ArrowUp className="size-4" />
      </Button>
    </div>
  );
}
