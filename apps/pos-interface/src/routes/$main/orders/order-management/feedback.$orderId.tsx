"use client";

import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback, memo } from "react";
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
  ArrowLeft,
  ArrowRight,
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
import { ShoulderSlopeSelect, ShoulderSlopeDisplay } from "@repo/ui/shoulder-slope";
import { CollarPositionSelect, CollarPositionDisplay, type CollarPositionValue } from "@repo/ui/collar-position";
import { toast } from "sonner";
import { cn, parseUtcTimestamp, TIMEZONE } from "@/lib/utils";
import { ConfirmationDialog } from "@repo/ui/confirmation-dialog";
import { RadioGroup, RadioGroupItem } from "@repo/ui/radio-group";
import { SignaturePad } from "@/components/forms/signature-pad";

// API and Types
import { getOrderById, repriceOrderStyles } from "@/api/orders";
import { getMeasurementById, getMeasurementsByCustomer, createMeasurement } from "@/api/measurements";
import { updateGarment, createRedoReplacement, redoPromoteFinalToBrova } from "@/api/garments";
import { getFabrics } from "@/api/fabrics";
import { createFeedback, updateFeedback, getFeedbackByGarmentId, getFeedbackByGarmentAndTrip } from "@/api/feedback";
import { uploadFeedbackPhoto, uploadFeedbackVoiceNote, uploadFeedbackSignature } from "@/lib/storage";
import { usePricing } from "@/hooks/usePricing";
import { useAuth } from "@/context/auth";
import { computeStyleReprice, type RepriceGarmentInput } from "@/lib/feedback-reprice";
import {
  buildFinalGarmentPayload,
  planMeasurementPropagation,
  reasonPropagates,
} from "@/lib/feedback-payload";
import {
  type StyleFields,
  buildBrovaStyleUpdates,
  pickStyleFields,
  diffStyleFields,
} from "@/lib/feedback-finals";
import {
  type StagedMeasurement,
  type GarmentOverride,
  type GarmentTag,
  type MeasurementInPlay,
  computeOverrideTargets,
  computeSharedMeasurementGroup,
  computeMeasurementsInPlay,
  defaultMeasurementAssignments,
  brovaResultingStyle,
  orderFinalsInProduction,
  brovaEditable,
} from "@/lib/feedback-overrides";
import { MeasurementOverrideSection, FinalsCardOverride, GarmentTagLabel } from "@/components/feedback/override-section";
import { MeasurementSheet } from "@/components/feedback/measurement-sheet";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/sheet";
import type { Measurement, Order, Garment, Customer, GarmentFeedback, BrovaFeedback, ShoulderSlope } from "@repo/database";
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
    title: "Jabzour & Basma",
    rows: MEASUREMENT_ROWS.filter(r =>
      ["jabzour_length", "jabzour_width", "second_button_distance", "basma_length", "basma_width"].includes(r.key)
    ),
  },
];

// Label + field column widths (px). LABEL_COL_W is the fixed label column;
// FIELD_COL_W is the *minimum* a field column may shrink to before columns wrap
// into a stacked block. Field columns stretch to fill the row but never past
// FIELD_COL_MAX_W, so a group with only a couple of columns stays left-aligned
// at a sane width instead of one column swallowing the whole row.
const LABEL_COL_W = 110;
const FIELD_COL_W = 96;
const FIELD_COL_MAX_W = 160;
// The measurement group card draws a 1px border on each side; subtract it so the
// table fills the inner content width exactly without triggering a stray scroll.
const GROUP_BORDER_W = 2;

function chunkArray<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

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
  { value: "needs_repair_rejected", label: "Reject: repair", color: "peer-data-[state=checked]:border-amber-600 peer-data-[state=checked]:text-amber-800 peer-data-[state=checked]:ring-1 peer-data-[state=checked]:ring-amber-600" },
  { value: "needs_redo", label: "Reject: redo", color: "peer-data-[state=checked]:border-destructive peer-data-[state=checked]:text-destructive peer-data-[state=checked]:ring-1 peer-data-[state=checked]:ring-destructive" },
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

// Lightweight option list for the non-image `lines` style field. BaseOption
// shape kept so it reuses the same picker UI; `image` left empty. (collar
// position is a measurement now — see the measurement section, not here.)
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
  lines: linesOptions,
};

// --- Types ---

interface GarmentFeedbackState {
  feedbackMeasurements: Record<string, number | "">;
  // Categorical shoulder-slope correction (kept out of the numeric map above).
  // Its reason/notes reuse differenceReasons["shoulder_slope"] / measurementNotes.
  shoulderSlopeNew: ShoulderSlope | "";
  // Categorical collar-position correction (also a body measurement). "" = no
  // change; "standard" serializes to null. Reason reuses differenceReasons["collar_position"].
  collarPositionNew: CollarPositionValue | "";
  differenceReasons: Record<string, string>;
  measurementNotes: Record<string, string>;
  optionNotes: Record<string, string>;
  optionChecks: Record<string, boolean>;
  styleChanges: Record<string, string>;
  hashwaChanges: Record<string, string>;
  // Per-style attachments, keyed by option id (collar, cuff, jabzour, …) so each
  // style carries its own photos/voice notes instead of one shared bucket.
  optionPhotos: Record<string, Array<{ type: "photo" | "video"; url: string }>>;
  optionVoiceNotes: Record<string, string[]>;
  // Read-only attachments from feedback saved before per-style attachments
  // existed (stored flat with no style). Shown in an "Earlier attachments" box;
  // never re-filed or written back.
  legacyPhotos: Array<{ type: "photo" | "video"; url: string }>;
  legacyVoiceNotes: string[];
  // Local cache of File/Blob for blob: preview URLs. Photos and voice notes
  // are uploaded to storage only on submit so abandoned drafts don't leave
  // orphan files in the bucket. Signatures take a separate path (data URL →
  // upload at submit, see onConfirmClick).
  pendingUploads: Record<string, { kind: "photo" | "voice"; blob: File | Blob }>;
  satisfaction: string | null;
  feedbackAction: string | null;
  distributionAction: string | null;
  customerSignature: string | null;
  notes: string;
  submitted: boolean;
  existingFeedbackId: string | null;
  isEditing: boolean;
  // Staged measurement derived from the correction table (§2.5). One new
  // measurement record staged locally and committed only on submit.
  stagedMeasurement: StagedMeasurement | null;
  // Per-garment override state for measurement assignment + style (§2.5).
  // Keyed by garment id (finals + shared sibling brova).
  garmentOverrides: Record<string, GarmentOverride>;
  // Redo resolution (§2.5, brova + needs_redo only). An explicit required choice;
  // seeded from the original's fabric source. replacement_in/out create a fresh
  // replacement at the shop; promote discards + promotes a parked final to brova.
  redoOutcome: "replacement_in" | "replacement_out" | "promote" | null;
  redoReplacementFabricId: number | null; // for the customer-cloth → our-stock cross
  redoPromoteFinalId: string | null;      // which parked final becomes the new brova
}

const createEmptyGarmentState = (): GarmentFeedbackState => ({
  feedbackMeasurements: {},
  shoulderSlopeNew: "",
  collarPositionNew: "",
  differenceReasons: {},
  measurementNotes: {},
  optionNotes: {},
  optionChecks: {},
  styleChanges: {},
  hashwaChanges: {},
  optionPhotos: {},
  optionVoiceNotes: {},
  legacyPhotos: [],
  legacyVoiceNotes: [],
  pendingUploads: {},
  satisfaction: null,
  feedbackAction: null,
  distributionAction: null,
  customerSignature: null,
  notes: "",
  submitted: false,
  existingFeedbackId: null,
  isEditing: false,
  stagedMeasurement: null,
  garmentOverrides: {},
  redoOutcome: null,
  redoReplacementFabricId: null,
  redoPromoteFinalId: null,
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
  out.optionPhotos = Object.fromEntries(
    Object.entries(st.optionPhotos ?? {}).map(([k, arr]) => [k, arr.filter(p => !p.url.startsWith("blob:"))]),
  );
  out.optionVoiceNotes = Object.fromEntries(
    Object.entries(st.optionVoiceNotes ?? {}).map(([k, arr]) => [k, arr.filter(u => !u.startsWith("blob:"))]),
  );
  return out;
};

// Treat empty default state as no-draft so we don't litter localStorage with
// keys for every garment the user merely clicked through.
const isDraftMeaningful = (st: GarmentFeedbackState): boolean =>
  Object.keys(st.feedbackMeasurements).length > 0 ||
  st.shoulderSlopeNew !== "" ||
  st.collarPositionNew !== "" ||
  Object.keys(st.differenceReasons).length > 0 ||
  Object.keys(st.measurementNotes).length > 0 ||
  Object.keys(st.optionNotes).length > 0 ||
  Object.keys(st.optionChecks).length > 0 ||
  Object.keys(st.styleChanges).length > 0 ||
  Object.keys(st.hashwaChanges).length > 0 ||
  st.stagedMeasurement != null ||
  Object.keys(st.garmentOverrides ?? {}).length > 0 ||
  Object.values(st.optionPhotos ?? {}).some(arr => arr.some(p => !p.url.startsWith("blob:"))) ||
  Object.values(st.optionVoiceNotes ?? {}).some(arr => arr.some(u => !u.startsWith("blob:"))) ||
  st.satisfaction !== null ||
  st.feedbackAction !== null ||
  st.distributionAction !== null ||
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

// Note field that buffers its text locally and only commits upward on blur.
// Notes have no live-derived UI (unlike measurement values, whose Delta badge
// updates every keystroke), so committing on each character is pure waste — it
// re-renders the whole feedback page. Buffering keeps typing local to this input.
type BufferedNoteFieldProps = {
  inputKey: string;
  value: string;
  onCommit: (key: string, value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">;

const BufferedNoteField = memo(function BufferedNoteField({
  inputKey,
  value,
  onCommit,
  ...rest
}: BufferedNoteFieldProps) {
  const [local, setLocal] = useState(value);
  const focusedRef = useRef(false);
  // Re-sync when the value changes from outside (garment switch, draft load),
  // but never while focused — that would clobber what's being typed.
  useEffect(() => {
    if (!focusedRef.current) setLocal(value);
  }, [value]);
  return (
    <Input
      {...rest}
      value={local}
      onFocus={() => { focusedRef.current = true; }}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        focusedRef.current = false;
        if (local !== value) onCommit(inputKey, local);
      }}
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
          <span className="text-xs font-medium text-muted-foreground truncate">
            {label}
          </span>
          <span className="text-xs font-medium tabular-nums text-muted-foreground shrink-0">
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

// --- Read-only previous-feedback detail (history) ---
// Renders a full, read-only view of one past trip's feedback record (measurement
// changes, style/option verdicts, attachments, signature, notes) — not just the
// rating + action. Parses the same JSON shapes the save handler writes.

const parseHistoryObjectArray = (raw: unknown): Record<string, unknown>[] => {
  if (!raw) return [];
  let v: unknown = raw;
  if (typeof raw === "string") {
    try { v = JSON.parse(raw); } catch { return []; }
  }
  return Array.isArray(v) ? (v.filter(x => x && typeof x === "object") as Record<string, unknown>[]) : [];
};

const parseHistoryStringArray = (raw: unknown): string[] => {
  if (!raw) return [];
  let v: unknown = raw;
  if (typeof raw === "string") {
    try { v = JSON.parse(raw); } catch { return []; }
  }
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
};

const MEASUREMENT_LABEL = new Map<string, string>(
  MEASUREMENT_ROWS.map(r => [r.key as string, `${r.type} · ${r.subType}`]),
);

const OPTION_LABEL: Record<string, string> = {
  collar: "Collar",
  collarBtn: "Collar Button",
  smallTabaggi: "Small Tabbagi",
  jabzour: "Jabzour",
  frontPocket: "Front Pocket",
  cuff: "Cuff",
  walletPocket: "Wallet Pocket",
  penHolder: "Pen Holder",
  mobilePocket: "Mobile Pocket",
  lines: "Lines",
};

const ACTION_LABEL: Record<string, string> = {
  accepted: "Accepted",
  needs_repair_accepted: "Accept with fix",
  needs_repair_rejected: "Reject: repair",
  needs_repair: "Needs repair",
  needs_redo: "Reject: redo",
  collected: "Collected",
  delivered: "Delivered",
};

const DISTRIBUTION_LABEL: Record<string, string> = {
  pickup: "Customer pickup",
  workshop: "To workshop",
  shop: "Stay at shop",
};

const actionBadgeColor = (action: string | null | undefined): string =>
  cn(
    "text-sm font-medium",
    (action === "accepted" || action === "collected") && "border-emerald-500/40 text-emerald-700",
    action === "needs_repair_accepted" && "border-amber-500/40 text-amber-700",
    (action === "needs_repair_rejected" || action === "needs_repair") && "border-amber-600/40 text-amber-800",
    action === "needs_redo" && "border-destructive/40 text-destructive",
    action === "delivered" && "border-primary/40 text-primary",
  );

function PreviousFeedbackDetail({ fb, index }: { fb: GarmentFeedback; index: number }) {
  const diffs = parseHistoryObjectArray(fb.measurement_diffs);
  const options = parseHistoryObjectArray(fb.options_checklist);
  const topPhotos = parseHistoryStringArray(fb.photo_urls);
  const topVoices = parseHistoryStringArray(fb.voice_note_urls);

  // Per-style media lives inside options_checklist rows; the flat photo_urls /
  // voice_note_urls is just their aggregate (or, for legacy records, the only
  // copy). Show per-style media when present, otherwise fall back to the flat
  // block — never both, to avoid showing every attachment twice.
  const hasPerOptionMedia = options.some(
    o => parseHistoryStringArray(o["photo_urls"]).length > 0 || parseHistoryStringArray(o["voice_note_urls"]).length > 0,
  );

  const sat = SATISFACTION_LEVELS.find(s => s.numericValue === fb.satisfaction_level);
  const actionLabel = fb.action ? (ACTION_LABEL[fb.action] ?? fb.action.replace(/_/g, " ")) : "";
  const distLabel = fb.distribution ? (DISTRIBUTION_LABEL[fb.distribution] ?? fb.distribution) : null;
  const dateStr = fb.created_at
    ? parseUtcTimestamp(fb.created_at).toLocaleDateString("en-GB", { timeZone: TIMEZONE, day: "2-digit", month: "short", year: "numeric" })
    : "";

  const sectionLabel = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

  // Collapsed summary: how many decisions of each kind this trip recorded, so the
  // closed row still signals what changed without opening it.
  const styleChangeCount = options.filter(o => o["rejected"] === true).length;
  const hashwaChangeCount = options.filter(o => o["hashwa_rejected"] === true).length;
  const summaryBits = [
    diffs.length > 0 ? `${diffs.length} measurement${diffs.length > 1 ? "s" : ""}` : null,
    styleChangeCount > 0 ? `${styleChangeCount} style` : null,
    hashwaChangeCount > 0 ? `${hashwaChangeCount} hashwa` : null,
  ].filter(Boolean) as string[];

  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card overflow-clip">
      {/* Trip header — click to expand the full recorded decision */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className={cn(
          "w-full flex flex-wrap items-center gap-2 px-4 py-3 bg-muted/20 text-left hover:bg-muted/30 transition-colors",
          open && "border-b",
        )}
      >
        <Badge variant="outline" className="text-sm font-medium">
          Trip {fb.trip_number || index + 1}
        </Badge>
        {actionLabel && (
          <Badge variant="outline" className={actionBadgeColor(fb.action)}>{actionLabel}</Badge>
        )}
        {sat && (
          <span className="text-sm text-foreground inline-flex items-center gap-1.5">
            <span className="text-lg leading-none">{sat.emoji}</span>
            {sat.label}
          </span>
        )}
        {!open && summaryBits.length > 0 && (
          <span className="text-sm text-muted-foreground truncate">· {summaryBits.join(" · ")}</span>
        )}
        <span className="ml-auto flex items-center gap-3 shrink-0">
          {dateStr && <span className="text-sm font-medium text-muted-foreground">{dateStr}</span>}
          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </span>
      </button>

      {open && (
      <div className="p-4 space-y-5">
        {/* Distribution decision */}
        {distLabel && (
          <p className="text-sm text-muted-foreground">
            Distribution: <span className="text-foreground font-medium">{distLabel}</span>
          </p>
        )}
        {/* Measurement changes */}
        {diffs.length > 0 && (
          <div className="space-y-2">
            <div className={cn(sectionLabel, "flex items-center gap-1.5")}>
              <Ruler className="size-3.5" /> Measurement changes
            </div>
            <div className="overflow-x-auto rounded-md border border-border/60">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-muted/40 text-xs font-medium text-muted-foreground">
                    <th className="text-left p-2 border-b border-border/60">Measurement</th>
                    <th className="p-2 border-b border-border/60 text-center">Current</th>
                    <th className="p-2 border-b border-border/60 text-center">New</th>
                    <th className="p-2 border-b border-border/60 text-center">Δ</th>
                    <th className="text-left p-2 border-b border-border/60">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {diffs.map((d, di) => {
                    const field = String(d["field"] ?? "");
                    const reason = d["reason"] ? String(d["reason"]) : null;
                    const reasonMeta = DIFFERENCE_REASONS.find(r => r.label === reason);
                    const original = d["original_value"];
                    const actual = d["actual_value"];
                    const difference = d["difference"];
                    const note = d["notes"] ? String(d["notes"]) : null;
                    return (
                      <tr key={di} className="border-b border-border/40 last:border-0 align-top">
                        <td className="p-2 font-medium">
                          {MEASUREMENT_LABEL.get(field) ?? field}
                          {note && <div className="text-xs text-muted-foreground font-normal mt-0.5">{note}</div>}
                        </td>
                        <td className="p-2 text-center tabular-nums text-muted-foreground">
                          {original != null ? String(original) : "-"}
                        </td>
                        <td className="p-2 text-center tabular-nums font-semibold">
                          {actual != null ? String(actual) : "-"}
                        </td>
                        <td className="p-2 text-center tabular-nums">
                          {typeof difference === "number" && difference !== 0
                            ? <span className={cn("font-semibold", difference > 0 ? "text-emerald-700" : "text-destructive")}>
                                {difference > 0 ? `+${difference}` : difference}
                              </span>
                            : <span className="text-muted-foreground/50">·</span>}
                        </td>
                        <td className="p-2">
                          {reason ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className={cn("size-1.5 rounded-full shrink-0", reasonMeta?.dot ?? "bg-muted-foreground")} />
                              {reason}
                            </span>
                          ) : <span className="text-muted-foreground/50">-</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Style / option verdicts */}
        {options.length > 0 && (
          <div className="space-y-2">
            <div className={cn(sectionLabel, "flex items-center gap-1.5")}>
              <MessageSquare className="size-3.5" /> Style verdicts
            </div>
            <div className="divide-y divide-border/50 rounded-md border border-border/60">
              {options.map((o, oi) => {
                const name = String(o["option_name"] ?? "");
                const label = OPTION_LABEL[name] ?? name;
                const correct = o["actual_correct"] === true;
                const rejected = o["rejected"] === true;
                const newValue = o["new_value"] ? String(o["new_value"]) : null;
                const hashwaCorrect = o["hashwa_correct"] === true;
                const hashwaRejected = o["hashwa_rejected"] === true;
                const hashwaNew = o["hashwa_new_value"] ? String(o["hashwa_new_value"]) : null;
                const note = o["notes"] ? String(o["notes"]) : null;
                const photos = parseHistoryStringArray(o["photo_urls"]);
                const voices = parseHistoryStringArray(o["voice_note_urls"]);
                return (
                  <div key={oi} className="p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-sm font-medium">{label}</span>
                      {rejected ? (
                        <span className="inline-flex items-center gap-1.5 text-sm text-destructive">
                          <X className="size-3.5" /> Rejected{newValue && <span className="text-muted-foreground">→ <span className="text-foreground font-medium">{newValue}</span></span>}
                        </span>
                      ) : correct ? (
                        <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
                          <Check className="size-3.5" /> Correct
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground/60">Not checked</span>
                      )}
                    </div>
                    {(hashwaCorrect || hashwaRejected) && (
                      <div className="text-xs text-muted-foreground pl-0.5">
                        Hashwa: {hashwaRejected ? (
                          <span className="text-destructive">Rejected{hashwaNew && ` → ${hashwaNew}`}</span>
                        ) : (
                          <span className="text-emerald-700">Correct</span>
                        )}
                      </div>
                    )}
                    {note && <p className="text-sm text-muted-foreground">{note}</p>}
                    {photos.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {photos.map((url, pi) => (
                          <div key={pi} className="size-16 rounded-md overflow-hidden border border-border">
                            <img src={url} alt={`${label} ${pi + 1}`} className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    )}
                    {voices.length > 0 && (
                      <div className="space-y-1.5">
                        {voices.map((url, vi) => (
                          <audio key={vi} src={url} controls preload="metadata" className="w-full h-9" />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Flat attachments (legacy records / no per-style media) */}
        {!hasPerOptionMedia && (topPhotos.length > 0 || topVoices.length > 0) && (
          <div className="space-y-2">
            <div className={cn(sectionLabel, "flex items-center gap-1.5")}>
              <Camera className="size-3.5" /> Attachments
            </div>
            {topPhotos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {topPhotos.map((url, pi) => (
                  <div key={pi} className="size-20 rounded-md overflow-hidden border border-border">
                    <img src={url} alt={`Attachment ${pi + 1}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}
            {topVoices.length > 0 && (
              <div className="space-y-1.5">
                {topVoices.map((url, vi) => (
                  <audio key={vi} src={url} controls preload="metadata" className="w-full h-9" />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Customer signature */}
        {fb.customer_signature && (
          <div className="space-y-2">
            <div className={cn(sectionLabel, "flex items-center gap-1.5")}>
              <PenTool className="size-3.5" /> Customer signature
            </div>
            <div className="rounded-md border border-border bg-white p-2 w-fit">
              <img src={fb.customer_signature} alt="Customer signature" className="h-20 object-contain" />
            </div>
          </div>
        )}

        {/* Notes */}
        {fb.notes && (
          <div className="space-y-1.5">
            <div className={sectionLabel}>Notes</div>
            <p className="text-sm text-foreground whitespace-pre-wrap">{fb.notes}</p>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

// --- Main Component ---

function UnifiedFeedbackInterface() {
  const { main, orderId: rawOrderId } = Route.useParams();
  const { garmentId: deepLinkGarmentId } = Route.useSearch();
  const paramOrderId = Number(rawOrderId);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Style catalogue + rules: a brova-trial style change reprices the order on
  // submit using the SAME engine as order creation (§2.5), so flat-priced
  // styles (qallabi/designer) keep their fixed price.
  const { styles, stylePricingRules } = usePricing();

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

  // Previous feedback history — opened from the header button into a side sheet
  const [historySheetOpen, setHistorySheetOpen] = useState(false);

  // Measurement lineage sheet
  const [sheetOpen, setSheetOpen] = useState(false);

  // Measure the measurement-table area so field columns can wrap into stacked
  // blocks once they no longer fit, instead of scrolling sideways.
  const measurementAreaRef = useRef<HTMLDivElement>(null);
  const [measurementAreaWidth, setMeasurementAreaWidth] = useState(0);
  useLayoutEffect(() => {
    const el = measurementAreaRef.current;
    if (!el) return;
    setMeasurementAreaWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setMeasurementAreaWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
        const parsePhotoArray = (raw: unknown): Array<{ type: "photo" | "video"; url: string }> =>
          parseJsonArray(raw)
            .map((p: unknown) => (typeof p === "string" ? { type: "photo" as const, url: p } : p))
            .filter((p): p is { type: "photo" | "video"; url: string } =>
              !!p && typeof p === "object" && "url" in p && typeof (p as { url: unknown }).url === "string");
        const photoEntries = parsePhotoArray(fb.photo_urls);
        const voiceEntries = parseJsonArray(fb.voice_note_urls).filter(
          (v): v is string => typeof v === "string",
        );

        // Rebuild measurement state from measurement_diffs JSON
        const feedbackMeasurements: Record<string, number | ""> = {};
        const measurementNotes: Record<string, string> = {};
        let shoulderSlopeNew: ShoulderSlope | "" = "";
        let collarPositionNew: CollarPositionValue | "" = "";
        for (const row of parseJsonArray(fb.measurement_diffs)) {
          if (!row || typeof row !== "object") continue;
          const d = row as Record<string, unknown>;
          if (!d["field"]) continue;
          const field = String(d["field"]);
          // shoulder_slope is categorical — restore into its own field, never the
          // numeric feedbackMeasurements map.
          if (field === "shoulder_slope") {
            if (typeof d["actual_value"] === "string") {
              shoulderSlopeNew = d["actual_value"] as ShoulderSlope;
            }
            if (d["notes"]) measurementNotes[field] = String(d["notes"]);
            continue;
          }
          // collar_position is categorical too — restored as the picker choice
          // (up/down/standard); actual_value is stored as that choice string.
          if (field === "collar_position") {
            if (typeof d["actual_value"] === "string") {
              collarPositionNew = d["actual_value"] as CollarPositionValue;
            }
            if (d["notes"]) measurementNotes[field] = String(d["notes"]);
            continue;
          }
          if (d["actual_value"] !== null && d["actual_value"] !== undefined) {
            feedbackMeasurements[field] = d["actual_value"] as number | "";
          }
          if (d["notes"]) measurementNotes[field] = String(d["notes"]);
        }

        // Rebuild option state from options_checklist JSON
        const optionChecks: Record<string, boolean> = {};
        const styleChanges: Record<string, string> = {};
        const hashwaChanges: Record<string, string> = {};
        const optionNotes: Record<string, string> = {};
        const optionPhotos: Record<string, Array<{ type: "photo" | "video"; url: string }>> = {};
        const optionVoiceNotes: Record<string, string[]> = {};
        for (const row of parseJsonArray(fb.options_checklist)) {
          if (!row || typeof row !== "object") continue;
          const o = row as Record<string, unknown>;
          const optName = o["option_name"];
          if (!optName) continue;
          const key = String(optName);
          if (o["actual_correct"] === true) optionChecks[`${key}-main`] = true;
          else if (o["rejected"] === true) optionChecks[`${key}-main`] = false;
          if (o["hashwa_correct"] === true) optionChecks[`${key}-hashwa`] = true;
          else if (o["hashwa_rejected"] === true) optionChecks[`${key}-hashwa`] = false;
          if (o["new_value"]) styleChanges[key] = String(o["new_value"]);
          if (o["hashwa_new_value"]) hashwaChanges[key] = String(o["hashwa_new_value"]);
          if (o["notes"]) optionNotes[key] = String(o["notes"]);
          const rowPhotos = parsePhotoArray(o["photo_urls"]);
          if (rowPhotos.length) optionPhotos[key] = rowPhotos;
          const rowVoices = parseJsonArray(o["voice_note_urls"]).filter(
            (v): v is string => typeof v === "string",
          );
          if (rowVoices.length) optionVoiceNotes[key] = rowVoices;
        }
        // Old records stored attachments flat at the top level with no style.
        // Surface them read-only only when this record predates per-style
        // attachments (i.e. no per-option media was parsed).
        const hasPerOptionMedia =
          Object.keys(optionPhotos).length > 0 || Object.keys(optionVoiceNotes).length > 0;
        const legacyPhotos = hasPerOptionMedia ? [] : photoEntries;
        const legacyVoiceNotes = hasPerOptionMedia ? [] : voiceEntries;

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
          optionPhotos,
          optionVoiceNotes,
          legacyPhotos,
          legacyVoiceNotes,
          feedbackMeasurements,
          shoulderSlopeNew,
          collarPositionNew,
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
    // Seed the redo outcome from the original's fabric source (the default; the
    // staff may change it). Only for a brova being redone (§2.5).
    if (
      action === "needs_redo" &&
      activeGarment?.garment_type === "brova" &&
      currentState.redoOutcome == null
    ) {
      updateGarmentState(selectedGarmentId, {
        redoOutcome: activeGarment.fabric_source === "OUT" ? "replacement_out" : "replacement_in",
      });
    }
  }, [currentState.feedbackAction, currentState.distributionAction, currentState.redoOutcome, selectedGarmentId, activeGarment, updateGarmentState]);

  // 2. Measurement Query
  const measurementId = activeGarment?.measurement_id;
  const { data: measurementData, isLoading: isMeasurementLoading } = useQuery({
    queryKey: ["measurement", measurementId],
    queryFn: () => getMeasurementById(measurementId!),
    enabled: !!measurementId,
  });

  const measurement = measurementData?.data;

  // 2b. Human-readable measurement ids keyed by customer — covers all measurements
  // (including newly staged ones added during this session).
  const customerId = activeOrder?.customer?.id;

  const { data: measurementHumanIdsData } = useQuery({
    queryKey: ["measurements-by-customer", customerId],
    queryFn: () => getMeasurementsByCustomer(customerId!),
    enabled: !!customerId,
    staleTime: 5 * 60 * 1000,
  });

  const measurementHumanIds = useMemo((): Map<string, string> => {
    const map = new Map<string, string>();
    for (const row of measurementHumanIdsData?.data ?? []) {
      if (row.id && row.measurement_id) map.set(row.id, row.measurement_id);
    }
    return map;
  }, [measurementHumanIdsData]);

  // 2c. Fabrics list — only fetched for the redo sub-form's "from our stock"
  // picker, and only in the cross case (a customer-cloth brova switched to our
  // stock, where we have no catalogue fabric on file). Lazy via `enabled`.
  const needsRedoFabricPicker =
    activeGarment?.garment_type === "brova" &&
    currentState.feedbackAction === "needs_redo" &&
    currentState.redoOutcome === "replacement_in" &&
    activeGarment.fabric_source === "OUT";
  const { data: redoFabricsData } = useQuery({
    queryKey: ["fabrics-for-redo"],
    queryFn: () => getFabrics(),
    enabled: !!needsRedoFabricPicker,
    staleTime: 5 * 60 * 1000,
  });

  // 3. Feedback history query — this garment only, every trip. The history sheet
  // lists each trip's full recorded decision (measurements, style, hashwa, …).
  const { data: feedbackHistoryData } = useQuery({
    queryKey: ["garment-feedback", selectedGarmentId],
    queryFn: () => getFeedbackByGarmentId(selectedGarmentId!),
    enabled: !!selectedGarmentId,
  });
  // Oldest trip first so the sheet reads as the garment's story (Trip 1 → N).
  const feedbackHistory = useMemo(
    () => [...(feedbackHistoryData?.data ?? [])].sort((a, b) => (a.trip_number ?? 0) - (b.trip_number ?? 0)),
    [feedbackHistoryData],
  );

  // Auto-load order from URL params
  useEffect(() => {
    if (paramOrderId && !activeOrder) {
      setIsLoadingOrder(true);
      getOrderById(paramOrderId, true)
        .then((res) => {
          if (res.status === "error" || !res.data) {
            toast.error("Order not found");
          } else if (res.data.order_type === "ALTERATION") {
            // Alteration-out orders have no feedback/trial flow — they are received
            // and handed over at the cashier. If this page is reached for one, send
            // the user to the read-only alteration view instead of a broken form.
            router.navigate({
              to: "/$main/orders/new-alteration-order",
              params: { main },
              search: { orderId: paramOrderId },
              replace: true,
            });
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

  // Staged-measurement sync: keep stagedMeasurement in sync with the correction
  // table. Runs on measurement-table edits for brovas only. (§2.5)
  useEffect(() => {
    if (!selectedGarmentId || !activeGarment || activeGarment.garment_type !== "brova") return;

    // Build correctedFields from propagating rows that have a non-empty value.
    const correctedFields: Record<string, number | string> = {};
    for (const row of MEASUREMENT_ROWS) {
      const fbVal = currentState.feedbackMeasurements[row.key];
      if (reasonPropagates(currentState.differenceReasons[row.key]) && fbVal !== "" && fbVal !== undefined) {
        correctedFields[row.key] = Number(fbVal);
      }
    }
    // shoulder_slope is categorical — a spec-correcting reason re-points the slope
    // on the new measurement just like the numeric tape fields.
    if (
      reasonPropagates(currentState.differenceReasons["shoulder_slope"]) &&
      currentState.shoulderSlopeNew !== ""
    ) {
      correctedFields["shoulder_slope"] = currentState.shoulderSlopeNew;
    }
    // collar_position is categorical too — same spec-correction re-point. The
    // picker choice ("up"/"down"/"standard") is stored here; "standard" is mapped
    // back to null when the new measurement row is written (see handleSave).
    if (
      reasonPropagates(currentState.differenceReasons["collar_position"]) &&
      currentState.collarPositionNew !== ""
    ) {
      correctedFields["collar_position"] = currentState.collarPositionNew;
    }

    const hasPropagating = Object.keys(correctedFields).length > 0;
    const currentStaged = currentState.stagedMeasurement;

    if (hasPropagating) {
      if (currentStaged == null) {
        // No-staged → staged transition: create localId, seed defaults.
        const localId = `staged:${crypto.randomUUID()}`;
        const allGarments = activeOrder?.garments ?? [];
        const sharedGroup = computeSharedMeasurementGroup({ allGarments, brova: activeGarment });
        const targets = computeOverrideTargets({ allGarments, brova: activeGarment });
        const seedAssignments = defaultMeasurementAssignments({ targets, sharedGroup, stagedLocalId: localId });

        // Build initial garmentOverrides: brova adopts its own new measurement,
        // shared targets adopt it, others keep null.
        const initOverrides: Record<string, GarmentOverride> = {
          [activeGarment.id]: { measurementAssignment: localId, styleOverride: null },
        };
        for (const [gid, assignment] of Object.entries(seedAssignments)) {
          initOverrides[gid] = { measurementAssignment: assignment, styleOverride: null };
        }

        updateGarmentState(selectedGarmentId, {
          stagedMeasurement: {
            localId,
            derivedFromMeasurementId: activeGarment.measurement_id ?? null,
            correctedFields,
          },
          garmentOverrides: initOverrides,
        });
      } else {
        // Already staged: only update correctedFields, keep localId + overrides.
        const nextCorrected = JSON.stringify(correctedFields);
        const prevCorrected = JSON.stringify(currentStaged.correctedFields);
        if (nextCorrected !== prevCorrected) {
          updateGarmentState(selectedGarmentId, {
            stagedMeasurement: { ...currentStaged, correctedFields },
          });
        }
      }
    } else if (currentStaged != null) {
      // Propagating rows cleared: remove staged measurement and prune overrides.
      const oldLocalId = currentStaged.localId;
      const prunedOverrides: Record<string, GarmentOverride> = {};
      for (const [gid, ov] of Object.entries(currentState.garmentOverrides)) {
        prunedOverrides[gid] = {
          ...ov,
          measurementAssignment: ov.measurementAssignment === oldLocalId ? null : ov.measurementAssignment,
        };
      }
      updateGarmentState(selectedGarmentId, {
        stagedMeasurement: null,
        garmentOverrides: prunedOverrides,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGarmentId, activeGarment, currentState.feedbackMeasurements, currentState.differenceReasons, currentState.shoulderSlopeNew, currentState.collarPositionNew]);

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

  const handleShoulderSlopeChange = useCallback((value: ShoulderSlope) => {
    if (!selectedGarmentId) return;
    setGarmentStates(prev => {
      const cur = prev[selectedGarmentId] || createEmptyGarmentState();
      return {
        ...prev,
        [selectedGarmentId]: { ...cur, shoulderSlopeNew: value },
      };
    });
  }, [selectedGarmentId]);

  const handleCollarPositionChange = useCallback((value: CollarPositionValue) => {
    if (!selectedGarmentId) return;
    setGarmentStates(prev => {
      const cur = prev[selectedGarmentId] || createEmptyGarmentState();
      return {
        ...prev,
        [selectedGarmentId]: { ...cur, collarPositionNew: value },
      };
    });
  }, [selectedGarmentId]);

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

  // Option ids whose rejection toggles a boolean garment column.
  const BOOL_OPTION_COL: Record<string, "small_tabaggi" | "pen_holder" | "wallet_pocket" | "mobile_pocket"> = {
    smallTabaggi: "small_tabaggi",
    penHolder: "pen_holder",
    walletPocket: "wallet_pocket",
    mobilePocket: "mobile_pocket",
  };

  const handleCheck = (key: string, checked: boolean) => {
    const optId = key.endsWith("-main") ? key.slice(0, -"-main".length) : null;
    const col = optId ? BOOL_OPTION_COL[optId] : undefined;
    const patch: Partial<GarmentFeedbackState> = {
      optionChecks: { ...currentState.optionChecks, [key]: checked },
    };
    // Freeze the resulting boolean target as the option's new_value the moment
    // it is rejected — while the form still shows the as-built spec. Persisting
    // the absolute target (vs a relative flip applied at submit) keeps re-submits
    // idempotent: see buildBrovaStyleUpdates.
    if (optId && col && activeGarment && !checked) {
      patch.styleChanges = {
        ...currentState.styleChanges,
        [optId]: activeGarment[col] ? "No" : "Yes",
      };
    }
    updateGarmentState(selectedGarmentId, patch);
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

  const handleAddOptionPhoto = (optId: string, file: File | null) => {
    if (!file) return;
    if (!selectedGarmentId) return;
    const previewUrl = URL.createObjectURL(file);
    setGarmentStates(prev => {
      const st = prev[selectedGarmentId] || createEmptyGarmentState();
      return {
        ...prev,
        [selectedGarmentId]: {
          ...st,
          optionPhotos: {
            ...st.optionPhotos,
            [optId]: [...(st.optionPhotos[optId] ?? []), { type: "photo", url: previewUrl }],
          },
          pendingUploads: { ...st.pendingUploads, [previewUrl]: { kind: "photo", blob: file } },
        },
      };
    });
  };

  const handleRemoveOptionPhoto = (optId: string, idx: number) => {
    if (!selectedGarmentId) return;
    const removed = currentState.optionPhotos[optId]?.[idx];
    setGarmentStates(prev => {
      const st = prev[selectedGarmentId];
      if (!st) return prev;
      const nextPending = { ...st.pendingUploads };
      if (removed && nextPending[removed.url]) delete nextPending[removed.url];
      return {
        ...prev,
        [selectedGarmentId]: {
          ...st,
          optionPhotos: {
            ...st.optionPhotos,
            [optId]: (st.optionPhotos[optId] ?? []).filter((_, i) => i !== idx),
          },
          pendingUploads: nextPending,
        },
      };
    });
    if (removed?.url.startsWith("blob:")) URL.revokeObjectURL(removed.url);
  };

  const startRecording = async (optId: string) => {
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
              optionVoiceNotes: {
                ...st.optionVoiceNotes,
                [optId]: [...(st.optionVoiceNotes[optId] ?? []), previewUrl],
              },
              pendingUploads: { ...st.pendingUploads, [previewUrl]: { kind: "voice", blob } },
            },
          };
        });
      };

      mediaRecorder.start();
      setRecordingOptionId(optId);
    } catch {
      toast.error("Could not access microphone");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const removeOptionVoiceNote = (optId: string, idx: number) => {
    if (!selectedGarmentId) return;
    const removed = currentState.optionVoiceNotes[optId]?.[idx];
    setGarmentStates(prev => {
      const st = prev[selectedGarmentId];
      if (!st) return prev;
      const nextPending = { ...st.pendingUploads };
      if (removed && nextPending[removed]) delete nextPending[removed];
      return {
        ...prev,
        [selectedGarmentId]: {
          ...st,
          optionVoiceNotes: {
            ...st.optionVoiceNotes,
            [optId]: (st.optionVoiceNotes[optId] ?? []).filter((_, i) => i !== idx),
          },
          pendingUploads: nextPending,
        },
      };
    });
    if (removed?.startsWith("blob:")) URL.revokeObjectURL(removed);
  };

  const onConfirmClick = () => {
    if (isReadOnly) return;
    if (!currentState.satisfaction || !currentState.feedbackAction || !currentState.distributionAction) {
        toast.error("Please complete all feedback sections");
        return;
    }
    if (measurementId && isMeasurementLoading) {
        toast.error("Measurements still loading, please wait before submitting");
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
    // shoulder_slope: a changed slope needs a reason too (same spec-correction gate).
    {
      const slopeOrig = (measurement?.shoulder_slope ?? null) as ShoulderSlope | null;
      const slopeNew = currentState.shoulderSlopeNew;
      if (
        slopeNew !== "" &&
        slopeNew !== slopeOrig &&
        !currentState.differenceReasons["shoulder_slope"]
      ) {
        missingReason.push("Shoulder Slope");
      }
    }
    // collar_position: a changed position needs a reason too. Compare against the
    // original mapped to a picker choice (null = "standard").
    {
      const collarOrig = (measurement?.collar_position ?? null) as "up" | "down" | null;
      const collarOrigChoice: CollarPositionValue =
        collarOrig === "up" || collarOrig === "down" ? collarOrig : "standard";
      const collarNew = currentState.collarPositionNew;
      if (
        collarNew !== "" &&
        collarNew !== collarOrigChoice &&
        !currentState.differenceReasons["collar_position"]
      ) {
        missingReason.push("Collar Position");
      }
    }
    if (missingReason.length > 0) {
      toast.error(
        `Pick a reason for: ${missingReason.join(", ")} (Customer Request / Workshop Error / Shop Error)`,
        { duration: 6000 },
      );
      return;
    }
    // Redo (brova) requires an explicit outcome + its sub-field (§2.5).
    if (activeGarment?.garment_type === "brova" && currentState.feedbackAction === "needs_redo") {
      if (!currentState.redoOutcome) {
        toast.error("Pick how to redo: a replacement (our stock / customer fabric) or promote a final.");
        return;
      }
      if (
        currentState.redoOutcome === "replacement_in" &&
        activeGarment.fabric_source === "OUT" &&
        currentState.redoReplacementFabricId == null
      ) {
        toast.error("Pick the fabric to cut for the replacement.");
        return;
      }
      if (currentState.redoOutcome === "promote") {
        const parkedFinals = (activeOrder?.garments ?? []).filter(
          g => g.garment_type === "final" && g.piece_stage === "waiting_for_acceptance",
        );
        if (parkedFinals.length > 0 && !currentState.redoPromoteFinalId) {
          toast.error("Pick which final becomes the new brova.");
          return;
        }
      }
    }
    setIsConfirmDialogOpen(true);
  };

  const handleSave = async () => {
    if (isReadOnly) return;
    if (!activeOrder || !selectedGarmentId || !activeGarment || !currentState.feedbackAction) return;

    setIsConfirmDialogOpen(false);
    setIsSubmitting(true);

    // Snapshot sibling style/measurement now so we can detect any UNEXPECTED
    // baseline shift after save (the per-final resolved finals are excluded —
    // those changes are deliberate). Guards against surprise drift.
    const SIBLING_TRACKED_FIELDS = [
      "collar_type", "collar_button", "front_pocket_type", "cuffs_type",
      "jabzour_1", "jabzour_2", "small_tabaggi",
      "front_pocket_thickness", "cuffs_thickness", "jabzour_thickness",
    ] as const;
    const preSaveSnapshot: Record<string, { measurement_id: string | null; style: Record<string, unknown> }> = {};
    for (const g of activeOrder.garments || []) {
      preSaveSnapshot[g.id] = {
        measurement_id: g.measurement_id ?? null,
        style: Object.fromEntries(SIBLING_TRACKED_FIELDS.map(k => [k, g[k]])),
      };
    }

    try {
        const state = currentState;

        if (activeGarment.garment_type === "brova") {
            const allBrovas = activeOrder.garments?.filter(g => g.garment_type === "brova") || [];
            const result = evaluateBrovaFeedback(
                state.feedbackAction as BrovaFeedback,
                allBrovas.map(b => ({ id: b.id, piece_stage: b.piece_stage, acceptance_status: b.acceptance_status, feedback_status: b.feedback_status })),
                activeGarment.id
            );

            // needs_redo: the discard + outcome (replacement / promote) runs at the
            // END of handleSave, after any spec correction is applied, so the cloned
            // replacement / promoted final inherits it (§2.5). Other verdicts persist
            // their stage now.
            if (state.feedbackAction !== "needs_redo") {
                await updateGarment(activeGarment.id, {
                    piece_stage: result.newStage,
                    acceptance_status: result.acceptanceStatus,
                    feedback_status: result.feedbackStatus,
                });
            }

            if (result.message) {
                toast.info(result.message);
            }
        } else {
            // Finals only — alteration-out orders never reach this page (redirected
            // to the read-only alteration view on load).
            const updatePayload = buildFinalGarmentPayload({
                feedbackAction: state.feedbackAction,
                isAlterationGarment: false,
                isHomeDelivery: !!activeOrder.home_delivery,
            });

            await updateGarment(activeGarment.id, updatePayload);
        }

        // Build measurement diffs JSON. Logs a row when the shop entered a new
        // value OR tagged a fault reason — a reason with no value is still a
        // flagged error the workshop must re-check (§2.5). actual_value/difference
        // stay null for reason-only rows (no number was entered).
        const measurementDiffs: Array<Record<string, unknown>> = MEASUREMENT_ROWS
          .filter(row => {
            const orderVal = measurement ? (measurement[row.key as keyof Measurement] as number | null) : null;
            const fbVal = state.feedbackMeasurements[row.key];
            const hasValue = fbVal !== "" && fbVal !== undefined;
            const hasReason = !!state.differenceReasons[row.key];
            return orderVal != null && (hasValue || hasReason);
          })
          .map(row => {
            const orderVal = measurement ? (measurement[row.key as keyof Measurement] as number | null) : null;
            const fbVal = state.feedbackMeasurements[row.key];
            const hasValue = fbVal !== "" && fbVal !== undefined;
            return {
              field: row.key,
              original_value: orderVal,
              actual_value: hasValue ? fbVal : null,
              difference: hasValue ? getDifference(orderVal, fbVal) : null,
              reason: state.differenceReasons[row.key] || null,
              notes: state.measurementNotes[row.key] || null,
            };
          });

        // Categorical shoulder_slope change rides the same audit trail (no numeric
        // delta — difference stays null). Logged when the slope actually changes
        // or a fault reason was tagged.
        {
          const slopeOrig = (measurement?.shoulder_slope ?? null) as ShoulderSlope | null;
          const slopeNew = state.shoulderSlopeNew;
          const slopeReason = state.differenceReasons["shoulder_slope"] || null;
          const changed = slopeNew !== "" && slopeNew !== slopeOrig;
          if (changed || slopeReason) {
            measurementDiffs.push({
              field: "shoulder_slope",
              original_value: slopeOrig,
              actual_value: slopeNew !== "" ? slopeNew : null,
              difference: null,
              reason: slopeReason,
              notes: state.measurementNotes["shoulder_slope"] || null,
            });
          }
        }

        // collar_position rides the same categorical audit trail. original_value is
        // the raw DB value (up/down/null); actual_value stores the picker choice
        // (up/down/standard) so it round-trips into the picker on reload.
        {
          const collarOrig = (measurement?.collar_position ?? null) as "up" | "down" | null;
          const collarOrigChoice: CollarPositionValue =
            collarOrig === "up" || collarOrig === "down" ? collarOrig : "standard";
          const collarNew = state.collarPositionNew;
          const collarReason = state.differenceReasons["collar_position"] || null;
          const changed = collarNew !== "" && collarNew !== collarOrigChoice;
          if (changed || collarReason) {
            measurementDiffs.push({
              field: "collar_position",
              original_value: collarOrig,
              actual_value: collarNew !== "" ? collarNew : null,
              difference: null,
              reason: collarReason,
              notes: state.measurementNotes["collar_position"] || null,
            });
          }
        }

        // --- Measurement propagation (spec-correcting reasons) ---
        // Customer Request + Shop Error rows feed a new measurement row (the
        // recorded spec was wrong); Workshop Error rows stay logged in
        // measurement_diffs only (original spec preserved — workshop just refixes).
        // planMeasurementPropagation (see @/lib/feedback-payload) is the reason
        // gate unit-tested in garments.propagation.test.ts.
        let newMeasurementId: string | null = null;
        const previousMeasurementId = activeGarment.measurement_id || null;
        const measurementPlan = planMeasurementPropagation({
          rows: [
            ...MEASUREMENT_ROWS.map(row => {
              const fbVal = state.feedbackMeasurements[row.key];
              return {
                reason: state.differenceReasons[row.key] ?? null,
                hasValue: fbVal !== "" && fbVal !== undefined,
              };
            }),
            // shoulder_slope participates in the propagation gate too.
            {
              reason: state.differenceReasons["shoulder_slope"] ?? null,
              hasValue: state.shoulderSlopeNew !== "",
            },
            // collar_position participates in the propagation gate as well.
            {
              reason: state.differenceReasons["collar_position"] ?? null,
              hasValue: state.collarPositionNew !== "",
            },
          ],
        });

        // Assert the plan agrees with stagedMeasurement presence (wiring guard).
        const stagedPresent = state.stagedMeasurement != null;
        console.assert(
          measurementPlan.createNewMeasurement === stagedPresent,
          "measurementPlan and stagedMeasurement must agree",
        );

        if (state.stagedMeasurement && measurement && activeOrder.customer?.id) {
          const baseRecord: Record<string, unknown> = { ...measurement };
          delete baseRecord["id"];
          delete baseRecord["created_at"];
          delete baseRecord["updated_at"];
          baseRecord["measurement_date"] = new Date().toISOString();
          // Apply all corrected fields from the staged measurement. collar_position
          // is stored as the picker choice; its "standard" maps back to null (the
          // DB column is up/down/null).
          for (const [key, val] of Object.entries(state.stagedMeasurement.correctedFields)) {
            baseRecord[key] = key === "collar_position" && val === "standard" ? null : val;
          }
          baseRecord["idempotency_key"] = state.stagedMeasurement.localId;
          // Assign the next human-readable measurement_id sequence for this customer.
          const cm = await getMeasurementsByCustomer(activeOrder.customer.id);
          const maxSeq = (cm.data ?? []).reduce((max, row) => {
            if (!row.measurement_id) return max;
            const parts = row.measurement_id.split("-");
            const seq = parseInt(parts[parts.length - 1] ?? "", 10);
            return isNaN(seq) ? max : Math.max(max, seq);
          }, 0);
          baseRecord["measurement_id"] = `${activeOrder.customer.id}-${maxSeq + 1}`;
          const base = baseRecord as Partial<Measurement>;
          const created = await createMeasurement(base);
          if (created.status === "success" && created.data) {
            newMeasurementId = created.data.id;
          } else {
            // Minting the corrected measurement is the whole point of a
            // spec-correcting feedback row. If it fails we must NOT continue:
            // the override assignments below resolve the staged id to null and
            // silently no-op, leaving the garment advanced but still pointing at
            // the old (wrong) measurement with no error shown. Abort instead —
            // the create is idempotent (keyed on the staged localId), so a retry
            // is safe.
            throw new Error(
              `Failed to create the corrected measurement: ${created.status === "error" ? created.message : "unknown error"}`,
            );
          }
        }

        // --- Garment override writes (§2.5) ---
        // PRICING IS NOT TOUCHED HERE — a style change only updates the garment's
        // spec; the order is repriced by the cashier at settlement.

        // Helper: resolve a local staged id to the real DB id (or passthrough).
        const resolveAssignment = (a: string | null): string | null => {
          if (a == null) return null;
          if (state.stagedMeasurement && a === state.stagedMeasurement.localId) return newMeasurementId;
          return a;
        };

        // 1. Active garment's own option-flow style edits (brova or final).
        if (Object.keys(activeStyleUpdates).length > 0) {
          await updateGarment(activeGarment.id, activeStyleUpdates as Partial<Garment>);
        }

        // 2. Per-garment override writes: measurement repoint + style overrides.
        for (const [gid, ov] of Object.entries(state.garmentOverrides)) {
          const garment = (activeOrder.garments ?? []).find(x => x.id === gid);
          if (!garment) continue;
          const patch: Partial<Garment> = {};
          const resolvedMeasId = resolveAssignment(ov.measurementAssignment);
          if (resolvedMeasId != null && resolvedMeasId !== garment.measurement_id) {
            patch.measurement_id = resolvedMeasId;
          }
          if (ov.styleOverride != null) {
            Object.assign(patch, diffStyleFields(pickStyleFields(garment), ov.styleOverride));
          }
          if (Object.keys(patch).length > 0) {
            await updateGarment(gid, patch);
          }
        }

        // --- Reprice the order for style changes (§2.5) ---
        // The spec writes above changed what the workshop will build; now move
        // the style component of order_total to match, using the preview
        // computed with the same engine as order creation (flat-priced
        // qallabi/designer yield no delta). Skipped for needs_redo (its
        // discard/replacement lifecycle owns its own pricing) and when no priced
        // field moved. orders.paid is never touched here — collection stays the
        // cashier's job at settlement.
        // NOTE on atomicity: the feedback submit applies several writes (stage,
        // measurement, style/overrides, reprice, feedback record) as separate
        // calls — it is not a single DB transaction. It is safe because EVERY
        // write is idempotent on a re-submit: the stage advance and style/override
        // patches set absolute values, createMeasurement is keyed on the staged
        // localId (no duplicate), reprice_order_styles assigns absolute totals,
        // and the feedback record is an upsert. So a mid-sequence failure is a
        // transient partial state that re-submitting fully heals (the catch makes
        // every failure visible). A future hardening is a single server-side
        // apply RPC — see the bug report. The reprice below is deliberately
        // NON-FATAL: it is the least critical write (pricing is the cashier's
        // domain at settlement, orders.paid is never touched here), so a reprice
        // failure must not discard the just-uploaded photos and the feedback
        // record that follow.
        if (state.feedbackAction !== "needs_redo" && repricePreview?.changed) {
          const res = await repriceOrderStyles({
            orderId: activeOrder.id,
            garments: repricePreview.snapshots,
            newStyleCharge: repricePreview.newStyleCharge,
            newOrderTotal: repricePreview.newOrderTotal,
            actor: user?.id ?? null,
            reason: `Brova-trial style change (${state.feedbackAction})`,
            idempotencyKey: crypto.randomUUID(),
          });
          if (res.status === "error") {
            toast.warning(
              `Spec saved, but the order price was not updated: ${res.message}. Re-submit to retry, or adjust the total at the cashier.`,
              { duration: 8000 },
            );
          } else {
            toast.success(
              `Order total updated to KWD ${repricePreview.newOrderTotal.toFixed(3)} (${repricePreview.delta >= 0 ? "+" : ""}${repricePreview.delta.toFixed(3)}).`,
            );
          }
        }

        // --- Redo outcome execution (§2.5) ---
        // We deferred the brova discard so the corrected spec (style applied above,
        // plus the new derived measurement) is in place before cloning / promoting.
        if (activeGarment.garment_type === "brova" && state.feedbackAction === "needs_redo") {
          if (state.redoOutcome === "promote") {
            // The RPC discards the brova and (if chosen) promotes a parked final.
            // The promoted final already carries any correction the staff assigned
            // it through the override section above.
            const res = await redoPromoteFinalToBrova(activeGarment.id, state.redoPromoteFinalId ?? null);
            if (res.status === "error") { toast.error(res.message); return; }
            toast.success(
              state.redoPromoteFinalId
                ? "Brova discarded. A final was promoted to the new brova."
                : "Brova discarded for redo.",
            );
          } else {
            // replacement_in / replacement_out: discard the brova (repointing it to
            // the corrected measurement so the clone inherits it), then create the
            // shop-side replacement. It waits in dispatch for the customer's fabric
            // or a restock; otherwise it's ready to dispatch.
            await updateGarment(activeGarment.id, {
              piece_stage: "discarded",
              acceptance_status: false,
              feedback_status: "needs_redo",
              ...(newMeasurementId ? { measurement_id: newMeasurementId } : {}),
            });
            const fabricSource: "IN" | "OUT" = state.redoOutcome === "replacement_out" ? "OUT" : "IN";
            const res = await createRedoReplacement(activeGarment.id, {
              fabricSource,
              fabricId: fabricSource === "IN" ? (state.redoReplacementFabricId ?? null) : null,
            });
            if (res.status === "error") { toast.error(res.message); return; }
            const data = res.data;
            toast.success(
              data?.parked
                ? `Replacement created, waiting in dispatch (${data.parked_reason === "customer_decision" ? "customer fabric" : "restock"}).`
                : "Replacement created, ready to dispatch.",
            );
          }
          // New replacement / promoted brova affects the dispatch queue.
          queryClient.invalidateQueries({ queryKey: ["dispatchOrders"] });
        }

        // Upload pending per-style photos/voice notes now. Files captured earlier
        // sit in pendingUploads as blob: previews — they only become real URLs at
        // submit time so abandoned drafts don't leave orphans. Each attachment is
        // filed under its style option (collar, cuff, …).
        const resolvedPhotos: Record<string, Array<{ type: "photo" | "video"; url: string }>> = {};
        const resolvedVoiceNotes: Record<string, string[]> = {};
        for (const opt of optionRows) {
          const photos: Array<{ type: "photo" | "video"; url: string }> = [];
          for (const entry of state.optionPhotos[opt.id] ?? []) {
            if (!entry.url.startsWith("blob:")) { photos.push(entry); continue; }
            const pending = state.pendingUploads[entry.url];
            if (!pending || pending.kind !== "photo") continue;
            try {
              const { url } = await uploadFeedbackPhoto(
                pending.blob, activeOrder.id, activeGarment.id, activeGarment.trip_number || 1,
              );
              photos.push({ type: entry.type, url });
              URL.revokeObjectURL(entry.url);
            } catch (err) {
              toast.error(`Failed to upload photo: ${err instanceof Error ? err.message : String(err)}`);
              return;
            }
          }
          if (photos.length) resolvedPhotos[opt.id] = photos;

          const voices: string[] = [];
          for (const u of state.optionVoiceNotes[opt.id] ?? []) {
            if (!u.startsWith("blob:")) { voices.push(u); continue; }
            const pending = state.pendingUploads[u];
            if (!pending || pending.kind !== "voice") continue;
            try {
              const { url } = await uploadFeedbackVoiceNote(
                pending.blob, activeOrder.id, activeGarment.id, activeGarment.trip_number || 1,
              );
              voices.push(url);
              URL.revokeObjectURL(u);
            } catch (err) {
              toast.error(`Failed to upload voice note: ${err instanceof Error ? err.message : String(err)}`);
              return;
            }
          }
          if (voices.length) resolvedVoiceNotes[opt.id] = voices;
        }

        // Reflect resolved URLs back into per-style state, drop consumed blobs.
        setGarmentStates(prev => {
          const st = prev[selectedGarmentId!];
          if (!st) return prev;
          return {
            ...prev,
            [selectedGarmentId!]: {
              ...st,
              optionPhotos: { ...st.optionPhotos, ...resolvedPhotos },
              optionVoiceNotes: { ...st.optionVoiceNotes, ...resolvedVoiceNotes },
              pendingUploads: {},
            },
          };
        });

        // Build options checklist JSON (verdict + replacement values + per-style attachments)
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
          photo_urls: (resolvedPhotos[opt.id] ?? []).map(p => p.url),
          voice_note_urls: resolvedVoiceNotes[opt.id] ?? [],
        }));

        // Aggregate every per-style attachment into the flat top-level columns so
        // the workshop QC views (which read photo_urls/voice_note_urls) still show
        // them. Per-style detail lives in options_checklist above.
        const persistedPhotos = Object.values(resolvedPhotos).flat();
        const persistedVoiceNotes = Object.values(resolvedVoiceNotes).flat();

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
              Object.entries(state.differenceReasons).filter(([key, reason]) => {
                // Keep any reason set against a field with a spec value — covers
                // both value changes AND reason-only flags (§2.5), so a reason
                // with no entered value still round-trips. Drops orphan/empty
                // reasons on fields the garment never had a value for.
                if (!reason) return false;
                const orig = measurement ? (measurement[key as keyof Measurement] as number | null) : null;
                return orig != null;
              })
            );
            return Object.keys(filtered).length > 0 ? JSON.stringify(filtered) : null;
          })(),
          // Pricing is handled by the cashier at settlement, not on this page.
          price_adjustment: null,
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

          // Detect siblings whose baseline shifted UNEXPECTEDLY and reset their
          // in-memory state so the rehydration effect re-runs from the new
          // baseline. Garments we explicitly wrote overrides for are deliberate,
          // so they're excluded — this only guards against surprise shifts on
          // garments the user didn't explicitly act on.
          const resolvedFinalIds = new Set(Object.keys(state.garmentOverrides));
          const affectedNames: string[] = [];
          const affectedIds = new Set<string>();
          for (const g of refreshed.data.garments || []) {
            if (g.id === activeGarment.id) continue;
            if (resolvedFinalIds.has(g.id)) continue;
            const snap = preSaveSnapshot[g.id];
            if (!snap) continue;
            const measChanged = snap.measurement_id !== (g.measurement_id ?? null);
            const styleChanged = SIBLING_TRACKED_FIELDS.some(
              k => snap.style[k] !== g[k],
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
              `Baseline updated for ${affectedNames.join(", ")}, please re-verify before submitting.`,
              { duration: 6000 },
            );
          }
        }

        // Invalidate dispatch queries so "Return to Workshop" tab is fresh
        if (state.distributionAction === "workshop") {
          queryClient.invalidateQueries({ queryKey: ["redispatchGarments"] });
          queryClient.invalidateQueries({ queryKey: ["dispatchOrders"] });
        }

        // --- Payment guidance (non-blocking reminder) ---
        // After the spec + reprice writes, surface the money situation so staff
        // route the customer to the cashier. Collection AND refunds are always
        // the cashier's manual job (§2.6 / §3) — this only reminds, it never
        // charges or refunds anything. Uses the refreshed order so the balance
        // reflects any reprice just applied.
        const settledOrder = refreshed.status === "success" && refreshed.data ? refreshed.data : activeOrder;
        const newBalance =
          Math.round(((Number(settledOrder?.order_total) || 0) - (Number(settledOrder?.paid) || 0)) * 1000) / 1000;
        const repriceDelta =
          state.feedbackAction !== "needs_redo" && repricePreview && repricePreview.changed
            ? repricePreview.delta
            : 0;
        const changeNote =
          repriceDelta !== 0
            ? `Style change ${repriceDelta > 0 ? "added" : "removed"} KWD ${Math.abs(repriceDelta).toFixed(3)}. `
            : "";
        const garmentLabel = activeGarment.garment_id || activeGarment.id.slice(0, 8);

        if (state.feedbackAction === "needs_redo") {
          // Redo discarded the brova. Any refund the customer wants for it
          // (instead of taking the replacement) is processed manually at the
          // cashier — we only point them there.
          toast.info(
            `Brova ${garmentLabel} discarded for redo. Any refund the customer wants for it is processed manually at the cashier.`,
            { duration: 7000 },
          );
        } else if (newBalance > 0.0005) {
          toast.info(`${changeNote}Balance of KWD ${newBalance.toFixed(3)} due. Collect at the cashier.`, {
            duration: 7000,
          });
        } else if (newBalance < -0.0005) {
          toast.info(
            `${changeNote}Order is overpaid by KWD ${Math.abs(newBalance).toFixed(3)}. The customer is due a refund at the cashier.`,
            { duration: 7000 },
          );
        } else if (repriceDelta !== 0) {
          toast.info(`${changeNote}Order is fully settled.`, { duration: 5000 });
        }

        // Stay on page - don't navigate away. User can submit other garments.
    } catch (err) {
        console.error(err);
        toast.error(`Failed to save feedback results: ${err instanceof Error ? err.message : String(err)}`);
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
    return !!(field && activeGarment[field]);
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
        displayText: g.small_tabaggi ? "Yes, Small Tabbagi present" : "No, Not applied",
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
        displayText: g.wallet_pocket ? "Yes, Wallet pocket present" : "No, Not applied",
        mainImage: walletIcon as string | null,
        hashwaLabel: null as string | null,
        hashwaValue: null as string | null
      },
      {
        id: "penHolder",
        label: "Pen Holder",
        mainValue: g.pen_holder ? "Yes" : "No",
        displayText: g.pen_holder ? "Yes, Pen holder present" : "No, Not applied",
        mainImage: penIcon as string | null,
        hashwaLabel: null as string | null,
        hashwaValue: null as string | null
      },
      {
        id: "mobilePocket",
        label: "Mobile Pocket",
        mainValue: g.mobile_pocket ? "Yes" : "No",
        displayText: g.mobile_pocket ? "Yes, Mobile pocket present" : "No, Not applied",
        mainImage: phoneIcon as string | null,
        hashwaLabel: null as string | null,
        hashwaValue: null as string | null
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

  // --- Brova-trial override section (§2.5) ---
  const isBrova = activeGarment?.garment_type === "brova";

  // The active garment's own style edits from the option flow (brova or final).
  const activeStyleUpdates = useMemo(
    () =>
      activeGarment
        ? buildBrovaStyleUpdates({
            optionIds: optionRows.map(o => o.id),
            optionChecks: currentState.optionChecks,
            styleChanges: currentState.styleChanges,
            hashwaChanges: currentState.hashwaChanges,
            garment: activeGarment,
          })
        : {},
    [activeGarment, optionRows, currentState.optionChecks, currentState.styleChanges, currentState.hashwaChanges],
  );

  // Override targets: parked finals + sibling brova sharing same measurement.
  const overrideTargets = useMemo(
    () =>
      isBrova && activeGarment
        ? computeOverrideTargets({ allGarments: activeOrder?.garments ?? [], brova: activeGarment })
        : [],
    [isBrova, activeGarment, activeOrder?.garments],
  );

  // Shared measurement group (those that default to adopting the staged measurement).
  const sharedGroupIds = useMemo(
    () =>
      new Set(
        (isBrova && activeGarment
          ? computeSharedMeasurementGroup({ allGarments: activeOrder?.garments ?? [], brova: activeGarment })
          : []
        ).map(g => g.id),
      ),
    [isBrova, activeGarment, activeOrder?.garments],
  );

  // Finals only (style grid rows = parked finals).
  const overrideFinals = useMemo(
    () => overrideTargets.filter(g => g.garment_type === "final"),
    [overrideTargets],
  );

  // The brova's resulting style (current + option-flow edits) — seeds "apply to all".
  const brovaStyle = useMemo(
    () =>
      activeGarment
        ? brovaResultingStyle({ brova: activeGarment, activeStyleUpdates })
        : ({} as ReturnType<typeof brovaResultingStyle>),
    [activeGarment, activeStyleUpdates],
  );

  // --- Style reprice preview (§2.5) ---
  // A brova-trial style change reprices the order on submit. We recompute the
  // style price for the garments whose style actually changed — the active
  // garment (its option-flow edits) plus any parked finals the change was
  // propagated to — with the same engine used at order creation, then roll the
  // delta into order_total. Flat-priced styles (qallabi/designer) yield no delta
  // unless flipped into or out of a flat style. needs_redo is excluded (its
  // discard/replacement lifecycle owns its own pricing). null = nothing to reprice.
  const repricePreview = useMemo(() => {
    if (!activeOrder || !activeGarment) return null;
    if (currentState.feedbackAction === "needs_redo") return null;
    if (styles.length === 0) return null; // catalogue not loaded yet

    const inputs: RepriceGarmentInput[] = [];

    // 1. Active garment's own option-flow style edits.
    if (Object.keys(activeStyleUpdates).length > 0) {
      inputs.push({
        garmentId: activeGarment.id,
        oldSpec: activeGarment as unknown as RepriceGarmentInput["oldSpec"],
        newSpec: { ...activeGarment, ...activeStyleUpdates } as unknown as RepriceGarmentInput["newSpec"],
      });
    }

    // 2. Parked finals the brova style change was propagated to.
    for (const [gid, ov] of Object.entries(currentState.garmentOverrides)) {
      if (gid === activeGarment.id) continue; // handled above
      if (ov.styleOverride == null) continue;
      const g = (activeOrder.garments ?? []).find(x => x.id === gid);
      if (!g) continue;
      inputs.push({
        garmentId: gid,
        oldSpec: g as unknown as RepriceGarmentInput["oldSpec"],
        newSpec: { ...g, ...ov.styleOverride } as unknown as RepriceGarmentInput["newSpec"],
      });
    }

    if (inputs.length === 0) return null;

    return computeStyleReprice({
      garments: inputs,
      styles,
      rules: stylePricingRules,
      currentOrderTotal: Number(activeOrder.order_total) || 0,
      currentStyleCharge: Number(activeOrder.style_charge) || 0,
    });
  }, [activeOrder, activeGarment, activeStyleUpdates, currentState.garmentOverrides, currentState.feedbackAction, styles, stylePricingRules]);

  // All measurements in play (real ids + staged), with follower lists.
  const measurementsInPlay = useMemo(
    (): MeasurementInPlay[] => {
      if (!activeGarment) return [];
      return computeMeasurementsInPlay({
        allGarments: activeOrder?.garments ?? [],
        staged: currentState.stagedMeasurement,
        assignments: Object.fromEntries(
          Object.entries(currentState.garmentOverrides).map(([k, v]) => [k, v.measurementAssignment]),
        ),
        brova: activeGarment,
      });
    },
    [activeGarment, activeOrder?.garments, currentState.stagedMeasurement, currentState.garmentOverrides],
  );

  // Label function: human-readable measurement id, falling back to short uuid.
  const measurementLabel = useMemo(() => {
    const staged = currentState.stagedMeasurement;
    return (id: string | null): string => {
      if (id == null) return "Current";
      if (staged && id === staged.localId) {
        const src = staged.derivedFromMeasurementId;
        const srcHuman = src ? (measurementHumanIds.get(src) ?? null) : null;
        return srcHuman ? `${srcHuman} (new)` : "New";
      }
      return measurementHumanIds.get(id) ?? id.slice(0, 8);
    };
  }, [measurementHumanIds, currentState.stagedMeasurement]);

  // Label function: the garment's human-readable per-order code (e.g. "12-1")
  // plus its type, rendered as code + a small badge by GarmentTagLabel.
  const garmentLabel = useMemo(() => {
    const labelMap = new Map<string, GarmentTag>();
    for (const g of activeOrder?.garments ?? []) {
      const type: GarmentTag["type"] = g.garment_type === "brova" ? "Brova" : "Final";
      labelMap.set(g.id, { code: g.garment_id ?? g.id.slice(0, 8), type });
    }
    return (id: string): GarmentTag => labelMap.get(id) ?? { code: id.slice(0, 8), type: "Final" };
  }, [activeOrder?.garments]);

  // Read-only gating (§2.5).
  const orderLocked = useMemo(
    () => orderFinalsInProduction(activeOrder?.garments ?? []),
    [activeOrder?.garments],
  );
  const isReadOnly = useMemo(
    () => !activeGarment || orderLocked || !brovaEditable(activeGarment),
    [activeGarment, orderLocked],
  );

  // --- Override handlers ---
  const setGarmentOverrideMeasurement = useCallback(
    (garmentId: string, assignment: string | null) => {
      if (!selectedGarmentId) return;
      setGarmentStates(prev => {
        const st = prev[selectedGarmentId] || createEmptyGarmentState();
        const existing = st.garmentOverrides[garmentId] ?? { measurementAssignment: null, styleOverride: null };
        return {
          ...prev,
          [selectedGarmentId]: {
            ...st,
            garmentOverrides: {
              ...st.garmentOverrides,
              [garmentId]: { ...existing, measurementAssignment: assignment },
            },
          },
        };
      });
    },
    [selectedGarmentId],
  );

  const applyMeasurementToShared = useCallback(() => {
    if (!selectedGarmentId) return;
    const localId = currentState.stagedMeasurement?.localId ?? null;
    setGarmentStates(prev => {
      const st = prev[selectedGarmentId] || createEmptyGarmentState();
      const nextOverrides = { ...st.garmentOverrides };
      for (const id of sharedGroupIds) {
        const existing = nextOverrides[id] ?? { measurementAssignment: null, styleOverride: null };
        nextOverrides[id] = { ...existing, measurementAssignment: localId };
      }
      return { ...prev, [selectedGarmentId]: { ...st, garmentOverrides: nextOverrides } };
    });
  }, [selectedGarmentId, sharedGroupIds, currentState.stagedMeasurement]);

  const setFinalStyleField = useCallback(
    (finalId: string, patch: StyleFields) => {
      if (!selectedGarmentId) return;
      setGarmentStates(prev => {
        const st = prev[selectedGarmentId] || createEmptyGarmentState();
        const final = (activeOrder?.garments ?? []).find(g => g.id === finalId);
        if (!final) return prev;
        const existing = st.garmentOverrides[finalId]?.styleOverride;
        const base = existing ?? pickStyleFields(final);
        const existingOverride = st.garmentOverrides[finalId] ?? { measurementAssignment: null, styleOverride: null };
        return {
          ...prev,
          [selectedGarmentId]: {
            ...st,
            garmentOverrides: {
              ...st.garmentOverrides,
              [finalId]: { ...existingOverride, styleOverride: { ...base, ...patch } },
            },
          },
        };
      });
    },
    [selectedGarmentId, activeOrder?.garments],
  );

  if (isLoadingOrder) {
    return (
      <div className="p-4 md:p-5 max-w-6xl mx-auto space-y-4 pb-20">
        {/* Header skeleton — mirrors the real one-row context strip so the
            skeleton→content swap doesn't reflow the page. */}
        <div className="flex items-center gap-3 border-b border-border pb-3">
          <Skeleton className="h-8 w-8 rounded-md shrink-0" />
          <Skeleton className="h-5 w-48 rounded-md" />
          <Skeleton className="h-5 w-24 rounded-md ml-auto" />
        </div>
        {/* Tabs skeleton */}
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
        {/* Content skeleton — single column, full-width cards (matches real layout) */}
        <div className="space-y-4">
          <Skeleton className="h-64 w-full rounded-md" />
          <Skeleton className="h-80 w-full rounded-md" />
          <Skeleton className="h-40 w-full rounded-md" />
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

      {/* Header — order context only (brova trial; no price/pickup — that's the
          cashier's job at handover, not the feedback form). */}
      <div className="flex items-center gap-3 flex-wrap border-b border-border pb-4">
        <Button variant="ghost" size="sm" className="h-9 w-9 p-0 shrink-0" onClick={() => router.history.back()}>
          <ArrowLeft className="size-5" />
        </Button>

        <div className="flex items-baseline gap-2.5 min-w-0">
          <h1 className="text-xl font-semibold text-foreground truncate">
            {activeOrder.customer?.name || "Guest"}
          </h1>
          <span className="text-base text-muted-foreground tabular-nums">#{activeOrder.id}</span>
          {activeOrder.invoice_number && (
            <span className="text-base text-muted-foreground tabular-nums hidden sm:inline">
              · INV {activeOrder.invoice_number}
            </span>
          )}
          {activeOrder.customer?.phone && (
            <span className="text-base text-muted-foreground font-mono hidden md:inline">
              · {activeOrder.customer.phone}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Badge variant="outline" className="font-normal text-sm">Brova trial</Badge>
          {currentState.isEditing && (
            <Badge variant="outline" className="font-normal text-sm">Editing</Badge>
          )}
          {feedbackHistory.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2"
              onClick={() => setHistorySheetOpen(true)}
            >
              <History className="size-4" />
              Feedback history
              <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 tabular-nums">{feedbackHistory.length}</Badge>
            </Button>
          )}
        </div>
      </div>

      {/* FEEDBACK HISTORY SHEET — this garment's trips as an expand/collapse list.
          Each row opens to the full recorded decision (measurements, style,
          hashwa, attachments, signature, notes). Opened from the header button. */}
      <Sheet open={historySheetOpen} onOpenChange={setHistorySheetOpen}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-2xl">
          <SheetHeader className="shrink-0 border-b border-border pr-12">
            <SheetTitle className="text-base">Feedback history</SheetTitle>
            <SheetDescription className="flex items-center gap-2">
              {selectedGarmentId && <GarmentTagLabel tag={garmentLabel(selectedGarmentId)} />}
              <span>· {feedbackHistory.length} trip{feedbackHistory.length === 1 ? "" : "s"}, tap a trip to see every decision. Read only.</span>
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {feedbackHistory.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No feedback recorded yet.</p>
            ) : (
              feedbackHistory.map((fb, i) => (
                <PreviousFeedbackDetail key={fb.id} fb={fb} index={i} />
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

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
                        <span className="text-xs opacity-70">
                            {(() => {
                                const altNum = getAlterationNumber(garment.trip_number);
                                if (altNum !== null) return `Alt ${altNum}`;
                                if (garment.garment_type === 'brova') return "Brova";
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
                                <CardTitle className="text-base font-medium">Measurement feedback</CardTitle>
                            </div>
                            <div className="flex items-center gap-2">
                                {isMeasurementLoading ? (
                                    <Badge variant="outline" className="bg-background font-semibold text-sm h-6 px-2">LOADING…</Badge>
                                ) : measurementId ? (
                                    <Badge variant="outline" className="bg-background font-mono font-medium text-xs h-6 px-2" title="Measurement ID">
                                        M: {measurement?.measurement_id ?? (measurementId ? String(measurementId).slice(0, 8) : "-")}
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="bg-background font-semibold text-sm h-6 px-2">NO MEASUREMENT</Badge>
                                )}
                            </div>
                        </div>
                    </CardHeader>

                    <div className="p-3">
                        <div ref={measurementAreaRef}>
                        {isMeasurementLoading ? (
                            <div className="space-y-4">
                                <Skeleton className="h-40 w-full rounded-lg" />
                                <Skeleton className="h-40 w-full rounded-lg" />
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {MEASUREMENT_GROUPS.map((group) => {
                                    // Field columns stretch to fill the row's full width; when the
                                    // area is too narrow for all of them, the remainder wrap into a
                                    // stacked block below (the label column repeats) and keep the same
                                    // column width so they stay aligned under the row above. Until the
                                    // width is measured, keep all fields in one block at the min width.
                                    const available = measurementAreaWidth > 0 ? measurementAreaWidth - GROUP_BORDER_W : 0;
                                    const fit = Math.max(1, Math.floor((available - LABEL_COL_W) / FIELD_COL_W));
                                    const colsPerRow = available > 0 ? Math.min(fit, group.rows.length) : group.rows.length;
                                    const chunks = chunkArray(group.rows, colsPerRow);
                                    // Width that would exactly fill the row, then capped at the max so
                                    // few-column groups don't blow up. When capped, the row no longer
                                    // fills (left-aligned, explicit table width); otherwise it stretches.
                                    const idealColW = (available - LABEL_COL_W) / colsPerRow;
                                    const capped = available > 0 && idealColW > FIELD_COL_MAX_W;
                                    const fieldColW = available > 0 ? Math.min(idealColW, FIELD_COL_MAX_W) : FIELD_COL_W;
                                    return (
                                        <div key={group.title} className="rounded-lg border border-border/60 overflow-hidden">
                                            <div className="bg-muted/40 px-3 py-1.5 border-b border-border/60 text-xs font-medium text-muted-foreground">
                                                {group.title}
                                            </div>
                                            <div className="divide-y divide-border/60">
                                                {chunks.map((chunkRows, ci) => {
                                                    // A full chunk fills the whole row: w-full + columns with no
                                                    // explicit width, which table-fixed shares equally after the
                                                    // fixed label column. A partial last chunk gets an explicit
                                                    // width so its columns match (and align under) the rows above.
                                                    const isFull = chunkRows.length === colsPerRow;
                                                    // Stretch to fill the row only when it's full AND not width-capped;
                                                    // otherwise size columns explicitly and leave the row left-aligned.
                                                    const stretch = isFull && !capped;
                                                    return (
                                                    <div key={ci} className="relative overflow-x-auto">
                                                        <table
                                                            className={cn("border-collapse table-fixed", stretch && "w-full")}
                                                            style={!stretch && available > 0 ? { width: LABEL_COL_W + chunkRows.length * fieldColW } : undefined}
                                                        >
                                                            <thead className="bg-muted/30 border-b border-border/60">
                                                                <tr className="text-sm font-medium text-muted-foreground">
                                                                    <th className="text-left p-3 bg-muted/50 border-r border-border/60 sticky left-0 z-20" style={{ width: LABEL_COL_W }}>Label</th>
                                                                    {chunkRows.map((row) => (
                                                                        <th key={row.key} className="p-2 text-center border border-border/40" style={stretch ? undefined : { width: fieldColW }}>
                                                                            <div className="font-semibold text-xs leading-tight">{row.type}</div>
                                                                            <div className="font-medium text-xs text-muted-foreground leading-tight">{row.subType}</div>
                                                                        </th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {/* Current row */}
                                                                <tr className="border-b border-border/40">
                                                                    <td className="p-3 bg-muted/40 border-r border-border/60 text-sm font-medium text-muted-foreground sticky left-0 z-10">Current</td>
                                                                    {chunkRows.map((row) => {
                                                                        const orderValue = measurement ? (measurement[row.key as keyof Measurement] as number | null) : undefined;
                                                                        return (
                                                                            <td key={row.key} className="p-2 text-center border border-border/30 bg-muted/20">
                                                                                {orderValue != null ? (
                                                                                    <span className="font-semibold text-sm tabular-nums">{orderValue}</span>
                                                                                ) : (
                                                                                    <span className="text-muted-foreground/40 text-sm">·</span>
                                                                                )}
                                                                            </td>
                                                                        );
                                                                    })}
                                                                </tr>
                                                                {/* New row */}
                                                                <tr className="border-b border-border/40">
                                                                    <td className="p-3 bg-primary/5 border-r border-border/60 text-sm font-medium text-primary sticky left-0 z-10">New</td>
                                                                    {chunkRows.map((row) => {
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
                                                                    <td className="p-3 bg-muted/40 border-r border-border/60 text-sm font-medium text-muted-foreground sticky left-0 z-10">Delta</td>
                                                                    {chunkRows.map((row) => {
                                                                        const orderValue = measurement ? (measurement[row.key as keyof Measurement] as number | null) : undefined;
                                                                        const feedbackValue = currentState.feedbackMeasurements[row.key];
                                                                        const diff = getDifference(orderValue, feedbackValue);
                                                                        const status = getDiffStatus(diff);
                                                                        return (
                                                                            <td key={row.key} className="p-2 text-center border border-border/30">
                                                                                {diff !== null && (
                                                                                    <Badge variant="secondary" className={cn(
                                                                                        "font-semibold text-sm h-6 px-1.5",
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
                                                                    <td className="p-3 bg-muted/40 border-r border-border/60 text-sm font-medium text-muted-foreground sticky left-0 z-10">Reason</td>
                                                                    {chunkRows.map((row) => {
                                                                        const reasonValue = currentState.differenceReasons[row.key] || "";
                                                                        const selectedReason = DIFFERENCE_REASONS.find(r => r.label === reasonValue);
                                                                        return (
                                                                            <td key={row.key} className="p-0 border border-border/30">
                                                                                <Select value={reasonValue} onValueChange={(val) => handleDifferenceReasonChange(row.key, val)}>
                                                                                    <SelectTrigger
                                                                                        className="h-10 w-full text-sm font-medium border-none shadow-none rounded-none px-2 bg-transparent hover:bg-muted/30 transition-colors"
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
                                                                                            <SelectItem key={r.label} value={r.label} className="text-sm font-medium py-2">
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
                                                                    <td className="p-3 bg-muted/40 border-r border-border/60 text-sm font-medium text-muted-foreground sticky left-0 z-10">Notes</td>
                                                                    {chunkRows.map((row) => {
                                                                        const noteValue = currentState.measurementNotes[row.key] || "";
                                                                        return (
                                                                            <td key={row.key} className="p-1 border border-border/30">
                                                                                <BufferedNoteField
                                                                                    className="h-8 w-full text-xs font-medium border-none shadow-none focus-visible:ring-1 focus-visible:ring-primary bg-transparent px-1.5"
                                                                                    inputKey={row.key}
                                                                                    value={noteValue}
                                                                                    onCommit={handleMeasurementNoteChange}
                                                                                />
                                                                            </td>
                                                                        );
                                                                    })}
                                                                </tr>
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        </div>
                        {/* Shoulder slope — categorical correction. A spec-correcting
                            reason re-points the slope on the minted measurement, just
                            like the numeric rows above. */}
                        {!isMeasurementLoading && (
                            <div className="mt-4 rounded-lg border border-border/60 overflow-hidden">
                                <div className="bg-muted/40 px-3 py-1.5 border-b border-border/60 text-xs font-medium text-muted-foreground">
                                    Shoulder Slope
                                </div>
                                <div className="p-3 flex flex-wrap items-start gap-x-8 gap-y-3">
                                    <div className="space-y-1">
                                        <div className="text-sm font-medium text-muted-foreground">Current</div>
                                        <ShoulderSlopeDisplay value={(measurement?.shoulder_slope ?? null) as string | null} />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-sm font-medium text-primary">New</div>
                                        <ShoulderSlopeSelect
                                            value={currentState.shoulderSlopeNew || undefined}
                                            onChange={handleShoulderSlopeChange}
                                            disabled={isReadOnly}
                                        />
                                    </div>
                                    <div className="space-y-1 min-w-[170px]">
                                        <div className="text-sm font-medium text-muted-foreground">Reason</div>
                                        <Select
                                            value={currentState.differenceReasons["shoulder_slope"] || ""}
                                            onValueChange={(val) => handleDifferenceReasonChange("shoulder_slope", val)}
                                            disabled={isReadOnly}
                                        >
                                            <SelectTrigger className="h-9 w-full text-sm" aria-label="Reason for shoulder slope change">
                                                <SelectValue placeholder="·" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {DIFFERENCE_REASONS.map(r => (
                                                    <SelectItem key={r.label} value={r.label} className="text-sm font-medium py-2">
                                                        <span className="flex items-center gap-2">
                                                            <span className={cn("size-1.5 rounded-full", r.dot)} />
                                                            {r.label}
                                                        </span>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        )}
                        {/* Collar position — categorical correction, sits next to the
                            shoulder slope. A spec-correcting reason re-points it on the
                            minted measurement just like the slope. */}
                        {!isMeasurementLoading && (
                            <div className="mt-4 rounded-lg border border-border/60 overflow-hidden">
                                <div className="bg-muted/40 px-3 py-1.5 border-b border-border/60 text-xs font-medium text-muted-foreground">
                                    Collar Position
                                </div>
                                <div className="p-3 flex flex-wrap items-start gap-x-8 gap-y-3">
                                    <div className="space-y-1">
                                        <div className="text-sm font-medium text-muted-foreground">Current</div>
                                        <CollarPositionDisplay value={(measurement?.collar_position ?? null) as string | null} />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-sm font-medium text-primary">New</div>
                                        <CollarPositionSelect
                                            value={currentState.collarPositionNew || undefined}
                                            onChange={handleCollarPositionChange}
                                            disabled={isReadOnly}
                                        />
                                    </div>
                                    <div className="space-y-1 min-w-[170px]">
                                        <div className="text-sm font-medium text-muted-foreground">Reason</div>
                                        <Select
                                            value={currentState.differenceReasons["collar_position"] || ""}
                                            onValueChange={(val) => handleDifferenceReasonChange("collar_position", val)}
                                            disabled={isReadOnly}
                                        >
                                            <SelectTrigger className="h-9 w-full text-sm" aria-label="Reason for collar position change">
                                                <SelectValue placeholder="·" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {DIFFERENCE_REASONS.map(r => (
                                                    <SelectItem key={r.label} value={r.label} className="text-sm font-medium py-2">
                                                        <span className="flex items-center gap-2">
                                                            <span className={cn("size-1.5 rounded-full", r.dot)} />
                                                            {r.label}
                                                        </span>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        )}
                        {/* Measurement override folded into this card — the correction above
                            mints one new measurement; assign it to finals/siblings here.
                            Only renders once a change stages a measurement. */}
                        {isBrova && currentState.stagedMeasurement != null && (
                            <div className="mt-4 pt-4 border-t border-border">
                                <MeasurementOverrideSection
                                    targets={overrideTargets}
                                    sharedGroupIds={sharedGroupIds}
                                    staged={currentState.stagedMeasurement}
                                    measurementsInPlay={measurementsInPlay}
                                    measurementLabel={measurementLabel}
                                    garmentLabel={garmentLabel}
                                    garmentOverrides={currentState.garmentOverrides}
                                    readOnly={isReadOnly}
                                    onOpenSheet={() => setSheetOpen(true)}
                                    onSetMeasurement={setGarmentOverrideMeasurement}
                                    onApplyMeasurementToShared={applyMeasurementToShared}
                                />
                            </div>
                        )}
                    </div>
                </Card>

                <MeasurementSheet
                    open={sheetOpen}
                    onClose={() => setSheetOpen(false)}
                    measurementsInPlay={measurementsInPlay}
                    measurementLabel={measurementLabel}
                    garmentLabel={garmentLabel}
                />

                {/* STYLE feedback SECTION */}
                <Card className="border border-border rounded-md overflow-clip py-0 gap-0">
                    <CardHeader className="bg-muted/30 border-b px-4 py-3">
                        <div className="flex items-center gap-2.5">
                            <PenTool className="size-4 text-muted-foreground" />
                            <CardTitle className="text-base font-medium">Style feedback</CardTitle>
                            <Badge variant="secondary" className="ml-auto text-sm font-medium">
                                {optionRows.filter(o => currentState.optionChecks[`${o.id}-main`]).length}/{optionRows.length} Confirmed
                            </Badge>
                        </div>
                    </CardHeader>
                    {/* Muted canvas so each white style card floats above it (easier to scan than white-on-white) */}
                    <CardContent className="p-4 bg-muted/30">
                        {/* Two fixed columns (first half / second half). Each card
                            stays in one column for its lifetime, so rejecting a card
                            only pushes the cards below it in its OWN column — the other
                            column never moves and nothing teleports. (CSS `columns`
                            re-balanced and shuffled cards between columns on every
                            height change.) On mobile the columns stack, preserving
                            top-to-bottom order. */}
                        {(() => {
                            const renderOptionCard = (opt: (typeof optionRows)[number]) => {
                                const isConfirmed = currentState.optionChecks[`${opt.id}-main`] === true;
                                const isRejected = currentState.optionChecks[`${opt.id}-main`] === false;
                                const hashwaConfirmed = currentState.optionChecks[`${opt.id}-hashwa`] === true;
                                const hashwaRejected = currentState.optionChecks[`${opt.id}-hashwa`] === false;

                                const pickerList = STYLE_OPTION_LISTS[opt.id];
                                const newStyleValue = currentState.styleChanges[opt.id] || "";
                                const newStyleImage = pickerList ? findOptionImage(pickerList, newStyleValue) : null;
                                const newStyleText = pickerList ? findDisplayText(pickerList, newStyleValue) : newStyleValue;
                                const newHashwaValue = currentState.hashwaChanges[opt.id] || "";

                                // Select-type cards lay the brova feedback (left) and
                                // the per-final assignment grid (right) side by side so
                                // the full width is used and 5–6 finals wrap into a
                                // compact grid instead of one tall full-width column.
                                // Yes/No cards stay a single compact stack (they live in
                                // the outer 2-up grid). `items-start` keeps the two panes
                                // independent, so growing one never moves the other.
                                const isBool = isBoolOpt(opt.id);
                                const finalsBlock = isBrova && overrideFinals.length > 0 ? (
                                    <FinalsCardOverride
                                        optionId={opt.id}
                                        finals={overrideFinals}
                                        garmentOverrides={currentState.garmentOverrides}
                                        garmentLabel={garmentLabel}
                                        brovaStyle={brovaStyle}
                                        readOnly={isReadOnly}
                                        onSetFinalStyle={setFinalStyleField}
                                        layout={isBool ? "stacked" : "aside"}
                                    />
                                ) : null;

                                return (
                                    <div
                                        key={opt.id}
                                        className="rounded-md border border-border bg-card p-3 space-y-2.5 shadow-sm transition-[transform,box-shadow] duration-150 hover:scale-[1.01] hover:shadow-md"
                                    >
                                        <div className={isBool ? "space-y-2.5" : "flex flex-col md:flex-row gap-2.5 md:gap-4 md:items-start"}>
                                        <div className={isBool ? "space-y-2.5" : "space-y-2.5 md:w-[22rem] lg:w-[26rem] md:shrink-0"}>
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

                                            {/* Label + current value (hashwa shown in its own row below) */}
                                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                <p className="text-sm font-medium text-foreground">{opt.label}</p>
                                                <p className="text-sm text-muted-foreground truncate">{opt.displayText || opt.mainValue}</p>
                                            </div>

                                            {/* Confirm / Reject — horizontal; bool No-label is short ("Add"/"Remove") since the card title already names the option */}
                                            <div className="shrink-0 flex items-start gap-1.5">
                                                <button
                                                    onClick={() => handleCheck(`${opt.id}-main`, true)}
                                                    className={cn(
                                                        "flex items-center justify-center gap-1 px-3 h-8 rounded-md border text-sm font-medium transition-colors",
                                                        isConfirmed
                                                            ? "bg-emerald-600 border-emerald-600 text-white"
                                                            : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
                                                    )}
                                                >
                                                    <Check className="w-4 h-4" />
                                                    {isBoolOpt(opt.id) ? "Keep" : "OK"}
                                                </button>
                                                <button
                                                    onClick={() => handleCheck(`${opt.id}-main`, false)}
                                                    className={cn(
                                                        "flex items-center justify-center gap-1 px-3 h-8 rounded-md border text-sm font-medium transition-colors whitespace-nowrap",
                                                        // Booleans: green when reject = ADD, red when reject = REMOVE.
                                                        isRejected
                                                            ? (isBoolOpt(opt.id) && !getBoolCurrent(opt.id)
                                                                ? "bg-emerald-600 border-emerald-600 text-white"
                                                                : "bg-destructive border-destructive text-white")
                                                            : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
                                                    )}
                                                >
                                                    <X className="w-4 h-4" />
                                                    {isBoolOpt(opt.id)
                                                        ? (getBoolCurrent(opt.id) ? "Remove" : "Add")
                                                        : "No"}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Rejected → pick new main style */}
                                        {isRejected && pickerList && (
                                            <div className="space-y-2">
                                                {/* before → after confirmation once a replacement is chosen */}
                                                {newStyleValue && (
                                                    <div className="flex items-center gap-2 text-sm">
                                                        <span className="flex items-center gap-1.5 text-muted-foreground line-through min-w-0">
                                                            {opt.mainImage && <img src={opt.mainImage} alt="" className="h-6 w-6 object-contain shrink-0" />}
                                                            <span className="truncate">{opt.displayText || opt.mainValue}</span>
                                                        </span>
                                                        <ArrowRight className="size-3.5 text-muted-foreground shrink-0" />
                                                        <span className="flex items-center gap-1.5 font-medium text-foreground min-w-0">
                                                            {newStyleImage && <img src={newStyleImage} alt="" className="h-6 w-6 object-contain shrink-0" />}
                                                            <span className="truncate">{newStyleText}</span>
                                                        </span>
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm text-muted-foreground shrink-0">New →</span>
                                                    <Select value={newStyleValue} onValueChange={(v) => handleStyleChange(opt.id, v)}>
                                                        <SelectTrigger className="h-10 flex-1 bg-background border-border">
                                                            {newStyleValue ? (
                                                                <div className="flex items-center gap-2">
                                                                    {newStyleImage && <img src={newStyleImage} alt={newStyleText || ""} className="h-7 w-7 object-contain" />}
                                                                    <span className="text-sm font-medium">{newStyleText}</span>
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
                                                                            <span className="text-sm font-medium">{o.displayText}</span>
                                                                            {isCurrent && <span className="text-xs text-muted-foreground ml-1">(current)</span>}
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
                                                            <span className="text-sm text-muted-foreground shrink-0">Under Zipper →</span>
                                                            <Select value={secondaryValue} onValueChange={(v) => handleStyleChange("jabzour_2", v)}>
                                                                <SelectTrigger className="h-10 flex-1 bg-background border-border">
                                                                    {secondaryValue ? (
                                                                        <div className="flex items-center gap-2">
                                                                            {secondaryImage && <img src={secondaryImage} alt={secondaryText || ""} className="h-7 w-7 object-contain" />}
                                                                            <span className="text-sm font-medium">{secondaryText}</span>
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
                                                                                    <span className="text-sm font-medium">{o.displayText}</span>
                                                                                    {isCurrent && <span className="text-xs text-muted-foreground ml-1">(current)</span>}
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
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm text-muted-foreground shrink-0">New →</span>
                                                    <Badge
                                                        variant="outline"
                                                        className={cn(
                                                            "font-medium text-sm",
                                                            removing ? "text-destructive border-destructive/40" : "text-emerald-700 border-emerald-500/40"
                                                        )}
                                                    >
                                                        {removing ? `Remove ${BOOL_OPT_NAMES[opt.id]}` : `Add ${BOOL_OPT_NAMES[opt.id]}`}
                                                    </Badge>
                                                </div>
                                            );
                                        })()}

                                        {/* Hashwa row — value + confirm merged here (no separate badge) */}
                                        {opt.hashwaValue && (
                                            <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-2.5">
                                                <span className="text-sm text-muted-foreground shrink-0">
                                                    Hashwa: <span className="font-medium text-foreground">{opt.hashwaValue}</span>
                                                </span>
                                                <button
                                                    onClick={() => handleCheck(`${opt.id}-hashwa`, true)}
                                                    className={cn(
                                                        "flex items-center gap-1 px-3 h-7 rounded-md border text-sm font-medium transition-colors",
                                                        hashwaConfirmed
                                                            ? "bg-emerald-600 border-emerald-600 text-white"
                                                            : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
                                                    )}
                                                >
                                                    <Check className="w-4 h-4" /> OK
                                                </button>
                                                <button
                                                    onClick={() => handleCheck(`${opt.id}-hashwa`, false)}
                                                    className={cn(
                                                        "flex items-center gap-1 px-3 h-7 rounded-md border text-sm font-medium transition-colors",
                                                        hashwaRejected
                                                            ? "bg-destructive border-destructive text-white"
                                                            : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
                                                    )}
                                                >
                                                    <X className="w-4 h-4" /> No
                                                </button>
                                                {hashwaRejected && (
                                                    <Select value={newHashwaValue} onValueChange={(v) => handleHashwaChange(opt.id, v)}>
                                                        <SelectTrigger className="h-8 text-sm flex-1 bg-background border-border">
                                                            <SelectValue placeholder="New thickness..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {thicknessOptions.map((t) => {
                                                                const isCurrent = t.value === opt.hashwaValue;
                                                                return (
                                                                    <SelectItem key={t.value} value={t.value} disabled={isCurrent} className="text-sm font-medium">
                                                                        {t.value === "NO HASHWA" ? "No Hashwa" : t.value.charAt(0) + t.value.slice(1).toLowerCase()}
                                                                        {isCurrent && <span className="text-xs text-muted-foreground ml-1">(current)</span>}
                                                                    </SelectItem>
                                                                );
                                                            })}
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            </div>
                                        )}

                                        {/* Note + media evidence — divided from the verdicts above */}
                                        <div className="space-y-2.5 border-t border-border/40 pt-2.5">
                                        {/* Notes */}
                                        <div className="flex items-center gap-2 bg-muted/20 rounded px-2 border border-transparent focus-within:border-primary/30 focus-within:bg-background transition-all">
                                            <MessageSquare className="size-3.5 text-muted-foreground/40 shrink-0" />
                                            <BufferedNoteField
                                                className="border-none shadow-none focus-visible:ring-0 bg-transparent text-sm font-medium h-8 p-0"
                                                placeholder="Note (optional)…"
                                                inputKey={opt.id}
                                                value={currentState.optionNotes[opt.id] || ""}
                                                onCommit={handleOptionNoteChange}
                                            />
                                        </div>

                                        {/* Per-style attachments (photos + voice notes) */}
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <Camera className="size-3.5 text-muted-foreground/60 shrink-0" />
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 px-2 text-xs font-medium"
                                                    onClick={() => document.getElementById(`photo-input-${opt.id}`)?.click()}
                                                >
                                                    <Camera className="w-3 h-3 mr-1" /> Photo
                                                </Button>
                                                <Button
                                                    variant={recordingOptionId === opt.id ? "destructive" : "outline"}
                                                    size="sm"
                                                    className="h-7 px-2 text-xs font-medium"
                                                    disabled={recordingOptionId !== null && recordingOptionId !== opt.id}
                                                    onClick={() => (recordingOptionId === opt.id ? stopRecording() : startRecording(opt.id))}
                                                >
                                                    {recordingOptionId === opt.id ? (
                                                        <><MicOff className="w-3 h-3 mr-1" /> Stop</>
                                                    ) : (
                                                        <><Mic className="w-3 h-3 mr-1" /> Voice</>
                                                    )}
                                                </Button>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    id={`photo-input-${opt.id}`}
                                                    onChange={(e) => { handleAddOptionPhoto(opt.id, e.target.files?.[0] || null); e.target.value = ""; }}
                                                />
                                            </div>

                                            {recordingOptionId === opt.id && (
                                                <div className="flex items-center gap-2 p-1.5 rounded-md border border-destructive/30 bg-destructive/5">
                                                    <div className="size-1.5 rounded-full bg-destructive animate-pulse" />
                                                    <span className="text-xs font-medium text-destructive">Recording…</span>
                                                </div>
                                            )}

                                            {(currentState.optionPhotos[opt.id]?.length ?? 0) > 0 && (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {(currentState.optionPhotos[opt.id] ?? []).map((p, i) => (
                                                        <div key={i} className="relative group size-14 rounded-md overflow-hidden border border-border">
                                                            <img src={p.url} alt={`${opt.label} attachment ${i + 1}`} className="w-full h-full object-cover" />
                                                            <button
                                                                onClick={() => handleRemoveOptionPhoto(opt.id, i)}
                                                                className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                            >
                                                                <X className="size-3.5 text-white" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {(currentState.optionVoiceNotes[opt.id]?.length ?? 0) > 0 && (
                                                <div className="space-y-1.5">
                                                    {(currentState.optionVoiceNotes[opt.id] ?? []).map((url, i) => (
                                                        <VoiceNotePlayer
                                                            key={i}
                                                            url={url}
                                                            label={`${opt.label} voice ${i + 1}`}
                                                            onRemove={() => removeOptionVoiceNote(opt.id, i)}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        {/* end note + media evidence group */}
                                        </div>

                                        {/* end feedback (left) pane */}
                                        </div>

                                        {/* Per-final style override for this attribute (§2.5) —
                                            right pane for select cards, stacked under Yes/No cards */}
                                        {finalsBlock && (
                                            <div className={isBool ? undefined : "md:flex-1 md:min-w-0"}>
                                                {finalsBlock}
                                            </div>
                                        )}
                                        {/* end two-pane wrapper */}
                                        </div>
                                    </div>
                                );
                            };
                            // Select-type styles (collar, cuff, jabzour, position, …)
                            // need the full row width for their replacement picker +
                            // before→after + per-final dropdowns, so they stack one per
                            // row. The Yes/No accessory toggles are compact and uniform,
                            // so they pack into a 2-column grid (items-start keeps the
                            // tops of paired cards aligned).
                            const selectRows = optionRows.filter(o => !isBoolOpt(o.id));
                            const boolRows = optionRows.filter(o => isBoolOpt(o.id));
                            return (
                                <div className="space-y-3">
                                    {selectRows.map(renderOptionCard)}
                                    {boolRows.length > 0 && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                                            {boolRows.map(renderOptionCard)}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </CardContent>
                </Card>


                {/* EARLIER ATTACHMENTS — read-only media from feedback saved before
                    per-style attachments existed (no style to file them under). */}
                {(currentState.legacyPhotos.length > 0 || currentState.legacyVoiceNotes.length > 0) && (
                    <Card className="border border-border rounded-md overflow-clip py-0 gap-0">
                        <CardHeader className="bg-muted/30 border-b px-4 py-3">
                            <div className="flex items-center gap-2.5">
                                <Camera className="size-4 text-muted-foreground" />
                                <CardTitle className="text-base font-medium">Earlier attachments</CardTitle>
                                <span className="text-xs text-muted-foreground">from previous feedback, not filed under a style</span>
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 space-y-3">
                            {currentState.legacyPhotos.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {currentState.legacyPhotos.map((p, i) => (
                                        <div key={i} className="size-20 rounded-lg overflow-hidden border border-border">
                                            <img src={p.url} alt={`Earlier attachment ${i + 1}`} className="w-full h-full object-cover" />
                                        </div>
                                    ))}
                                </div>
                            )}
                            {currentState.legacyVoiceNotes.length > 0 && (
                                <div className="space-y-2">
                                    {currentState.legacyVoiceNotes.map((url, i) => (
                                        <audio key={i} src={url} controls preload="metadata" className="w-full h-9" />
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

            </TabsContent>
          </Tabs>

          {/* Read-only banner when editing is locked */}
          {isReadOnly && (
            <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-3">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                {orderLocked
                  ? "Finals are in production. Feedback editing is locked."
                  : !activeGarment
                  ? "No garment selected."
                  : "This garment has been dispatched to the workshop or is no longer at the shop. Showing read-only history."}
              </p>
            </div>
          )}

          {/* FINAL ACTIONS CONTROL PANEL — hidden when read-only */}
          {!isReadOnly && <>
          {/* CUSTOMER SENTIMENTS */}
          <Card className="border border-border rounded-md overflow-clip">
              <CardHeader className="bg-muted/30 border-b px-4 py-3">
                  <div className="flex items-center gap-2.5">
                      <User className="size-4 text-muted-foreground" />
                      <CardTitle className="text-base font-medium">Customer sentiments</CardTitle>
                  </div>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                  <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">Overall Satisfaction <span className="text-destructive">*</span></Label>
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
                                      <span className="text-xs text-muted-foreground">{level.label}</span>
                                  </Label>
                              </div>
                          ))}
                      </RadioGroup>
                  </div>

                  {/* Signature (Brova only) */}
                  {activeTab === "brova" && (
                      <div className="pt-3 border-t border-border/60 space-y-3">
                          <div className="flex items-center justify-between">
                              <Label className="text-sm font-medium text-muted-foreground">Customer Signature <span className="text-muted-foreground/50 font-medium">(optional)</span></Label>
                              {currentState.customerSignature && (
                                  <Badge variant="outline" className="text-emerald-700 border-emerald-500/50 text-sm font-medium">Signed</Badge>
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
                                      <span className="text-sm font-medium text-muted-foreground">Tap to Sign</span>
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
                      <CardTitle className="text-base font-medium">Garment action</CardTitle>
                  </div>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                  {/* Status */}
                  <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">Status <span className="text-destructive">*</span></Label>
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
                                          "flex items-center justify-center h-10 rounded-lg border border-border bg-card px-2 cursor-pointer transition-all font-medium text-sm text-center",
                                          opt.color
                                      )}
                                  >
                                      {opt.label}
                                  </Label>
                              </div>
                          ))}
                      </RadioGroup>
                  </div>

                  {/* Redo resolution (§2.5) — explicit required choice of outcome */}
                  {activeTab === "brova" && currentState.feedbackAction === "needs_redo" && (() => {
                      const parkedFinals = (activeOrder?.garments ?? []).filter(
                          g => g.garment_type === "final" && g.piece_stage === "waiting_for_acceptance"
                      );
                      // Show ALL catalogue fabrics, not just in-stock ones: a
                      // replacement cut from a short/empty fabric is valid —
                      // create_replacement_garment parks it (waiting_material)
                      // until the shop restocks. Hiding zero-stock fabrics made
                      // that fabric unpickable, blocking the redo entirely.
                      // In-stock first for usability.
                      const redoRequired = Number(activeGarment?.fabric_length ?? 0);
                      const fabrics = [...(redoFabricsData ?? [])].sort(
                          (a, b) => Number(b.shop_stock) - Number(a.shop_stock),
                      );
                      return (
                          <div className="space-y-3 p-3 rounded-md border border-border bg-muted/30">
                              <Label className="text-sm font-medium text-muted-foreground">
                                  How to redo? <span className="text-destructive">*</span>
                              </Label>
                              <RadioGroup
                                  value={currentState.redoOutcome ?? ""}
                                  onValueChange={(val) => updateGarmentState(selectedGarmentId, {
                                      redoOutcome: val as GarmentFeedbackState["redoOutcome"],
                                      redoReplacementFabricId: null,
                                      redoPromoteFinalId: null,
                                  })}
                                  className="grid gap-2"
                              >
                                  {[
                                      { value: "replacement_in", label: "Replacement: from our stock", hint: "We cut a fresh piece from shop stock." },
                                      { value: "replacement_out", label: "Replacement: customer's fabric", hint: "Customer brings the cloth; waits in dispatch until they do." },
                                      { value: "promote", label: "No replacement: promote a final", hint: "Discard this brova; one final becomes the new brova." },
                                  ].map((opt) => (
                                      <div key={opt.value} className="flex items-start gap-2">
                                          <RadioGroupItem value={opt.value} id={`redo-${opt.value}`} className="mt-0.5" />
                                          <Label htmlFor={`redo-${opt.value}`} className="flex-1 cursor-pointer font-normal">
                                              <span className="text-sm font-medium">{opt.label}</span>
                                              <span className="block text-xs text-muted-foreground">{opt.hint}</span>
                                          </Label>
                                      </div>
                                  ))}
                              </RadioGroup>

                              {/* Cross case: a customer-cloth original switched to our stock → pick the fabric to cut. */}
                              {currentState.redoOutcome === "replacement_in" && activeGarment?.fabric_source === "OUT" && (
                                  <div className="space-y-1.5">
                                      <Label className="text-xs text-muted-foreground">
                                          Fabric to cut <span className="text-destructive">*</span>
                                      </Label>
                                      <Select
                                          value={currentState.redoReplacementFabricId != null ? String(currentState.redoReplacementFabricId) : ""}
                                          onValueChange={(v) => updateGarmentState(selectedGarmentId, { redoReplacementFabricId: Number(v) })}
                                      >
                                          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select fabric…" /></SelectTrigger>
                                          <SelectContent>
                                              {fabrics.map(f => {
                                                  const stock = Number(f.shop_stock);
                                                  const willPark = redoRequired > 0 && stock < redoRequired;
                                                  return (
                                                      <SelectItem key={f.id} value={String(f.id)}>
                                                          {f.name} ({stock}m){willPark ? " - will wait for restock" : ""}
                                                      </SelectItem>
                                                  );
                                              })}
                                          </SelectContent>
                                      </Select>
                                  </div>
                              )}

                              {/* Promote: choose which parked final becomes the new brova. */}
                              {currentState.redoOutcome === "promote" && (
                                  parkedFinals.length > 0 ? (
                                      <div className="space-y-1.5">
                                          <Label className="text-xs text-muted-foreground">
                                              Which final becomes the brova? <span className="text-destructive">*</span>
                                          </Label>
                                          <Select
                                              value={currentState.redoPromoteFinalId ?? ""}
                                              onValueChange={(v) => updateGarmentState(selectedGarmentId, { redoPromoteFinalId: v })}
                                          >
                                              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select a parked final…" /></SelectTrigger>
                                              <SelectContent>
                                                  {parkedFinals.map(f => (
                                                      <SelectItem key={f.id} value={f.id}>{f.garment_id || f.id.slice(0, 8)}</SelectItem>
                                                  ))}
                                              </SelectContent>
                                          </Select>
                                      </div>
                                  ) : (
                                      <p className="text-xs text-muted-foreground">No parked final to promote. This brova will be discarded only.</p>
                                  )
                              )}

                              <p className="text-xs text-muted-foreground border-t border-border pt-2">
                                  The customer refund (if any) is taken at the cashier.
                              </p>
                          </div>
                      );
                  })()}

                  {/* Distribution */}
                  <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">Distribution <span className="text-destructive">*</span></Label>
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
                              <p className="text-sm text-destructive text-center">
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
              description={`You are about to submit feedback for garment ${activeGarment?.garment_id || activeGarment?.id || ""}. This will update its status and save the feedback record.${
                repricePreview?.changed
                  ? ` Order total changes from KWD ${repricePreview.oldOrderTotal.toFixed(3)} to KWD ${repricePreview.newOrderTotal.toFixed(3)} (${repricePreview.delta >= 0 ? "+" : ""}${repricePreview.delta.toFixed(3)}).`
                  : ""
              }`}
              confirmText="Submit Feedback"
              cancelText="Go Back"
          />
          </>}


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
