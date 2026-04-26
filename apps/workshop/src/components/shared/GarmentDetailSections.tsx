import { ProductionPipeline } from "@/components/shared/ProductionPipeline";
import { MeasurementGrid } from "@/components/shared/MeasurementGrid";
import { MeasurementValue } from "@/components/shared/MeasurementValue";
import { getMeasurementCorrections } from "@/lib/qc-corrections";
import { StageBadge, AlterationBadge, ExpressBadge, QcFixBadge } from "@/components/shared/StageBadge";
import { PIECE_STAGE_LABELS, PRODUCTION_STAGES } from "@/lib/constants";
import { cn, formatDate } from "@/lib/utils";
import { STYLE_IMAGE_MAP, THICKNESS_LABELS, ACCESSORY_ICONS } from "@/lib/style-images";
import { useState } from "react";
import {
  Check,
  Clock,
  Timer,
  Home,
  User,
  Package,
  Phone,
  ChevronDown,
  History,
  Star,
  X,
  RotateCcw,
  MessageSquare,
  Image as ImageIcon,
  Mic,
  Ruler,
  ListChecks,
  PlayCircle,
  ArrowRight,
} from "lucide-react";
import type { WorkshopGarment, ProductionPlan, WorkerHistory, TripHistoryEntry, GarmentFeedback } from "@repo/database";

// ── Customer feedback constants ────────────────────────────────

const SATISFACTION_LEVELS: Record<number, { label: string; emoji: string }> = {
  1: { label: "Angry",   emoji: "\u{1F621}" },
  2: { label: "Unhappy", emoji: "\u{1F61E}" },
  3: { label: "Okay",    emoji: "\u{1F636}" },
  4: { label: "Happy",   emoji: "\u{1F60A}" },
  5: { label: "Love It", emoji: "\u{1F929}" },
};

// Only color the verdicts that drive a manager decision: rejection/redo = red,
// repair-with-fix = amber. Plain accepted/collected/delivered stay neutral —
// nothing for the manager to act on, so no need to attract the eye.
const FEEDBACK_ACTION_STYLE: Record<string, { label: string; cls: string }> = {
  accepted:              { label: "Accepted",          cls: "bg-muted text-foreground border-border" },
  needs_repair_accepted: { label: "Accepted with Fix", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  needs_repair_rejected: { label: "Rejected — Repair", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  needs_repair:          { label: "Needs Repair",      cls: "bg-amber-100 text-amber-800 border-amber-200" },
  needs_redo:            { label: "Rejected — Redo",   cls: "bg-red-100 text-red-800 border-red-200" },
  collected:             { label: "Collected",         cls: "bg-muted text-foreground border-border" },
  delivered:             { label: "Delivered",         cls: "bg-muted text-foreground border-border" },
};

// Reason chips stay semantic — they're the whole point of the diff table.
const DIFF_REASON_STYLE: Record<string, string> = {
  customer_request: "bg-emerald-50 text-emerald-700 border-emerald-200",
  workshop_error:   "bg-red-50 text-red-700 border-red-200",
  shop_error:       "bg-muted text-muted-foreground border-border",
};

function parseJson<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw !== "string") return raw as T;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

// ── Constants (shared) ──────────────────────────────────────────

const STYLE_FIELDS: { key: string; label: string; type: "text" | "boolean"; thicknessKey?: string }[] = [
  { key: "collar_type", label: "Collar", type: "text", thicknessKey: "collar_thickness" },
  { key: "collar_button", label: "Collar Button", type: "text" },
  { key: "cuffs_type", label: "Cuffs", type: "text", thicknessKey: "cuffs_thickness" },
  { key: "front_pocket_type", label: "Front Pocket", type: "text", thicknessKey: "front_pocket_thickness" },
  { key: "wallet_pocket", label: "Wallet Pocket", type: "boolean" },
  { key: "pen_holder", label: "Pen Holder", type: "boolean" },
  { key: "small_tabaggi", label: "Small Tabaggi", type: "boolean" },
  { key: "jabzour_1", label: "Jabzour 1", type: "text", thicknessKey: "jabzour_thickness" },
  { key: "jabzour_2", label: "Jabzour 2", type: "text" },
  { key: "lines", label: "Lines", type: "text" },
];

export const HISTORY_KEY_MAP: Record<string, string> = {
  soaking: "soaker",
  cutting: "cutter",
  post_cutting: "post_cutter",
  sewing: "sewer",
  finishing: "finisher",
  ironing: "ironer",
  quality_check: "quality_checker",
};

const WORKER_LABELS: Record<string, string> = {
  soaker: "Soaker",
  cutter: "Cutter",
  post_cutter: "Post-Cutter",
  sewer: "Sewer",
  finisher: "Finisher",
  ironer: "Ironer",
  quality_checker: "QC Inspector",
  soaking: "Soaking",
  cutting: "Cutting",
  post_cutting: "Post-Cutting",
  sewing: "Sewing",
  finishing: "Finishing",
  ironing: "Ironing",
};

// ── Garment Header ──────────────────────────────────────────────

export function GarmentHeader({
  garment,
  showExtras,
  children,
  reentryStage,
  qcFailCount,
}: {
  garment: WorkshopGarment;
  showExtras?: boolean;
  children?: React.ReactNode;
  reentryStage?: string | null;
  qcFailCount?: number;
}) {
  return (
    <div className={cn(
      "border rounded-xl p-4 shadow-sm",
      garment.garment_type === "brova"
        ? "bg-gradient-to-r from-purple-50/80 to-white border-purple-200"
        : "bg-gradient-to-r from-blue-50/80 to-white border-blue-200",
    )}>
      {/* Header body — info on left, children (dates) on right at sm+ */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Top row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-md border ${
                garment.garment_type === "brova"
                  ? "bg-purple-100 text-purple-800 border-purple-200"
                  : "bg-blue-100 text-blue-800 border-blue-200"
              }`}
            >
              {garment.garment_type}
            </span>
            <span className="font-mono font-black text-xl">
              {garment.garment_id ?? garment.id.slice(0, 8)}
            </span>
            <StageBadge stage={garment.piece_stage} garmentType={garment.garment_type} inProduction={garment.in_production} location={garment.location} />
            {garment.express && <ExpressBadge />}
            <AlterationBadge tripNumber={garment.trip_number} garmentType={garment.garment_type} />
            <QcFixBadge tripNumber={garment.trip_number} tripHistory={garment.trip_history} />
          </div>

          {/* Info row */}
          <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-2 text-sm">
            {garment.customer_name && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <User className="w-3.5 h-3.5" aria-hidden="true" />
                {garment.customer_name}
              </span>
            )}
            {garment.invoice_number && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Package className="w-3.5 h-3.5" aria-hidden="true" />
                #{garment.invoice_number}
              </span>
            )}
            {showExtras && garment.customer_mobile && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                {garment.customer_mobile}
              </span>
            )}
            {garment.home_delivery_order && (
              <span className="flex items-center gap-1 text-indigo-700 font-medium">
                <Home className="w-3.5 h-3.5" aria-hidden="true" />
                Delivery
              </span>
            )}
            {!showExtras && garment.delivery_date_order && (
              <span className="flex items-center gap-1 text-amber-700 font-medium">
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                {formatDate(garment.delivery_date_order)}
              </span>
            )}
            {!showExtras && garment.assigned_date && (
              <span className="flex items-center gap-1 text-violet-700 font-medium">
                <Timer className="w-3.5 h-3.5" aria-hidden="true" />
                {formatDate(garment.assigned_date)}
              </span>
            )}
          </div>
        </div>

        {/* Extra content (e.g. editable dates) — pinned right on sm+ */}
        {children && (
          <div className="sm:text-right shrink-0">{children}</div>
        )}
      </div>

      {/* Full pipeline */}
      <div className="mt-3">
        <ProductionPipeline
          currentStage={garment.piece_stage}
          hasSoaking={!!garment.soaking}
          reentryStage={(garment.trip_number ?? 1) > 1 ? reentryStage : undefined}
          qcFailCount={qcFailCount}
        />
      </div>
    </div>
  );
}

// ── Style Section ──────────────────────────────────────────────

export function StyleSection({ garment }: { garment: WorkshopGarment }) {
  const g = garment as any;
  const specs = STYLE_FIELDS.filter((f) => {
    const val = g[f.key];
    if (f.type === "boolean") return val === true;
    return val != null && val !== "";
  });

  return (
    <div className="bg-gradient-to-b from-amber-50/60 to-white border border-amber-200/60 rounded-xl p-4 shadow-sm space-y-2">
      {garment.style_image_url && (
        <div className="rounded-lg overflow-hidden border">
          <img
            src={garment.style_image_url}
            alt={garment.style_name ?? "Style"}
            className="w-full h-auto max-h-48 object-contain bg-zinc-50"
          />
        </div>
      )}

      <h3 className="text-sm font-bold uppercase tracking-wider text-amber-700">
        Style & Fabric
      </h3>

      <div className="space-y-0.5">
        <div className="flex items-center justify-between py-1.5 border-b border-dashed">
          <span className="text-sm text-muted-foreground">Style</span>
          <span className="text-sm font-semibold capitalize">
            {garment.style_name ?? garment.style ?? "—"}
          </span>
        </div>

        <div className="flex items-center justify-between py-1.5 border-b border-dashed">
          <span className="text-sm text-muted-foreground">Fabric</span>
          <span className="text-sm font-semibold">
            {garment.fabric_name ?? "—"}
            {garment.fabric_color && (
              <span className="text-muted-foreground ml-1">({garment.fabric_color})</span>
            )}
          </span>
        </div>

        {garment.soaking && (
          <div className="flex items-center justify-between py-1.5 border-b border-dashed">
            <span className="text-sm text-muted-foreground">Soaking</span>
            <span className="text-sm font-semibold text-blue-700">Required</span>
          </div>
        )}

        {specs.map((field) => {
          let lookupKey = String(g[field.key]);
          // jabzour_1 stores BUTTON/ZIPPER enum; actual style key is in jabzour_2
          // ZIPPER = Shaab (show JAB_SHAAB), BUTTON = jabzour_2 is the style
          if (field.key === "jabzour_1") {
            lookupKey = g.jabzour_1 === "ZIPPER" ? "JAB_SHAAB" : String(g.jabzour_2 ?? "");
          }
          // jabzour_2: when ZIPPER, show the sub-style; when BUTTON, jabzour_2 was already shown as jabzour_1
          if (field.key === "jabzour_2" && g.jabzour_1 !== "ZIPPER") {
            return null; // skip, already shown in jabzour_1 row
          }
          const mapped = field.type === "text" ? STYLE_IMAGE_MAP[lookupKey] : null;
          const thickness = field.thicknessKey ? g[field.thicknessKey] : null;
          const thicknessLabel = thickness ? THICKNESS_LABELS[thickness] ?? thickness : null;
          const isBool = field.type === "boolean";
          const boolIcon = isBool && field.key === "wallet_pocket" ? ACCESSORY_ICONS.wallet
            : isBool && field.key === "pen_holder" ? ACCESSORY_ICONS.pen
            : isBool && field.key === "small_tabaggi" ? ACCESSORY_ICONS.smallTabaggi
            : null;

          return (
            <div
              key={field.key}
              className="flex items-center justify-between py-2 border-b border-dashed last:border-0"
            >
              <span className="text-sm text-muted-foreground">{field.label}</span>
              <div className="flex items-center gap-2">
                {mapped?.image ? (
                  <img src={mapped.image} alt={mapped.label} className="h-10 w-10 object-contain rounded" title={mapped.label} />
                ) : boolIcon ? (
                  <img src={boolIcon} alt={field.label} className="h-7 w-7 object-contain" />
                ) : null}
                <span className="text-sm font-semibold">
                  {isBool ? "Yes" : (mapped?.label ?? lookupKey)}
                </span>
                {thicknessLabel && (
                  <span className="text-xs font-bold bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded">
                    {thicknessLabel}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {specs.length === 0 && !garment.fabric_name && (
          <p className="text-xs text-muted-foreground italic py-1">No style specs recorded</p>
        )}
      </div>
    </div>
  );
}

// ── Worker History ─────────────────────────────────────────────

export function WorkerHistorySection({
  garment,
  onEditPlan,
  reentryStage,
}: {
  garment: WorkshopGarment;
  onEditPlan?: () => void;
  reentryStage?: string | null;
}) {
  const plan = garment.production_plan as ProductionPlan | null;
  const history = garment.worker_history as WorkerHistory | null;
  const currentStage = garment.piece_stage ?? "";
  const isReturn = (garment.trip_number ?? 1) > 1;

  let stages = PRODUCTION_STAGES.filter(
    (s) => s !== "soaking" || garment.soaking,
  );

  // For re-entry garments, only show stages from re-entry point onward
  if (isReturn && reentryStage) {
    const reentryIdx = stages.indexOf(reentryStage as any);
    if (reentryIdx > 0) {
      stages = stages.slice(reentryIdx);
    }
  }

  const stageOrder = stages.map((s) => s);
  const currentIdx = stageOrder.indexOf(currentStage as any);

  return (
    <div className="bg-gradient-to-b from-teal-50/60 to-white border border-teal-200/60 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-teal-700">
          Production Team
        </h3>
        {onEditPlan && (
          <button
            onClick={onEditPlan}
            className="text-xs text-primary hover:underline cursor-pointer font-medium"
          >
            Edit Plan
          </button>
        )}
      </div>

      <div className="space-y-0.5">
        {stages.map((stage, i) => {
          const historyKey = HISTORY_KEY_MAP[stage] ?? stage;
          const planned = (plan as any)?.[historyKey] ?? null;
          const actual = (history as any)?.[historyKey] ?? null;
          const isDone = i < currentIdx;
          const isCurrent = i === currentIdx;
          const isPending = i > currentIdx;

          return (
            <div
              key={stage}
              className={`flex items-center justify-between py-2 px-3 rounded-lg text-sm ${
                isCurrent
                  ? "bg-blue-50 border border-blue-200"
                  : isDone
                    ? "bg-emerald-50/50"
                    : "bg-zinc-50/50"
              }`}
            >
              <div className="flex items-center gap-2">
                {isDone && <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />}
                {isCurrent && <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />}
                {isPending && <div className="w-2 h-2 rounded-full bg-zinc-300" />}
                <span className={`font-medium ${isPending ? "text-muted-foreground" : ""}`}>
                  {WORKER_LABELS[historyKey] ??
                    PIECE_STAGE_LABELS[stage as keyof typeof PIECE_STAGE_LABELS] ??
                    stage}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {actual ? (
                  <span className="font-semibold text-emerald-700">{actual}</span>
                ) : planned ? (
                  <span className="text-muted-foreground">{planned}</span>
                ) : (
                  <span className="text-zinc-300">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Measurements Section ──────────────────────────────────────

export function MeasurementsSection({ garment }: { garment: WorkshopGarment }) {
  return (
    <div className="bg-gradient-to-b from-sky-50/60 to-white border border-sky-200/60 rounded-xl p-4 shadow-sm">
      <h3 className="text-sm font-bold uppercase tracking-wider text-sky-700 mb-2">
        Measurements
      </h3>
      <MeasurementGrid
        measurement={garment.measurement}
        corrections={getMeasurementCorrections(garment.trip_history)}
      />
    </div>
  );
}

// ── Notes Section ─────────────────────────────────────────────

export function NotesSection({ notes }: { notes: string }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-1">
        Notes
      </h3>
      <p className="text-sm text-amber-900 whitespace-pre-wrap">{notes}</p>
    </div>
  );
}

// ── Trip History Section ──────────────────────────────────────

export function TripHistorySection({ tripHistory: rawHistory }: { tripHistory: TripHistoryEntry[] | string | null | undefined }) {
  const [open, setOpen] = useState(false);

  const tripHistory: TripHistoryEntry[] | null = !rawHistory
    ? null
    : typeof rawHistory === "string"
      ? JSON.parse(rawHistory)
      : Array.isArray(rawHistory)
        ? rawHistory
        : null;

  if (!tripHistory || tripHistory.length === 0) return null;

  return (
    <div className="border rounded-xl overflow-hidden mb-8">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-muted/30 transition-colors"
      >
        <History className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
        <span className="text-base font-bold uppercase tracking-wider text-muted-foreground">
          Production History
        </span>
        <span className="text-xs font-bold bg-muted text-muted-foreground px-2.5 py-1 rounded-full">
          {tripHistory.length} trip{tripHistory.length !== 1 ? "s" : ""}
        </span>
        <ChevronDown className={cn(
          "w-5 h-5 text-muted-foreground ml-auto transition-transform",
          open && "rotate-180",
        )} aria-hidden="true" />
      </button>

      {open && (
        <div className="border-t px-5 py-5 space-y-6 animate-fade-in">
          {tripHistory.map((entry, i) => (
            <div key={i}>
              {/* Trip header */}
              <div className="flex items-center gap-3 mb-3">
                <span className={cn(
                  "text-sm font-bold uppercase px-3 py-1 rounded-lg",
                  entry.trip === 1
                    ? "bg-blue-100 text-blue-700"
                    : entry.trip === 2
                      ? "bg-amber-100 text-amber-700"
                      : "bg-orange-100 text-orange-700",
                )}>
                  {entry.trip === 1 ? "Original" : entry.trip === 2 ? "Return" : `Alt ${entry.trip - 2}`}
                </span>
                {entry.reentry_stage && (
                  <span className="text-sm text-muted-foreground">
                    from <span className="font-medium">{PIECE_STAGE_LABELS[entry.reentry_stage as keyof typeof PIECE_STAGE_LABELS] ?? entry.reentry_stage}</span>
                  </span>
                )}
                {entry.assigned_date && (
                  <span className="text-sm text-muted-foreground ml-auto">
                    {formatDate(entry.assigned_date)}
                    {entry.completed_date && <span> → {formatDate(entry.completed_date)}</span>}
                  </span>
                )}
              </div>

              {/* Workers */}
              {entry.worker_history && Object.keys(entry.worker_history).length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {Object.entries(entry.worker_history).map(([key, name]) => (
                    <span key={key} className="inline-flex items-center gap-1.5 text-sm bg-muted/60 px-3 py-1.5 rounded-lg">
                      <span className="font-medium text-muted-foreground">{WORKER_LABELS[key] ?? key}:</span>
                      <span className="font-semibold">{name}</span>
                    </span>
                  ))}
                </div>
              )}

              {/* Production cycles — show flow with QC attempts */}
              {entry.qc_attempts?.length > 0 && (
                <div className="space-y-3 ml-3 border-l-2 border-muted pl-4">
                  {entry.qc_attempts.map((qc, j) => {
                    // Show the path this cycle took: re-entry/return stage → ... → QC
                    const cycleStart = j === 0
                      ? (entry.reentry_stage ?? "soaking")
                      : entry.qc_attempts[j - 1]?.return_stage ?? "soaking";
                    const startLabel = PIECE_STAGE_LABELS[cycleStart as keyof typeof PIECE_STAGE_LABELS] ?? cycleStart;

                    return (
                      <div key={j}>
                        {/* Cycle path label */}
                        {j > 0 && (
                          <div className="flex items-center gap-1.5 mb-1.5 text-xs text-orange-600 font-semibold">
                            <RotateCcw className="w-3 h-3" aria-hidden="true" />
                            Re-entered at {startLabel}
                          </div>
                        )}
                        <div className={cn(
                          "flex items-start gap-3 rounded-xl px-4 py-3",
                          qc.result === "pass" ? "bg-emerald-50" : "bg-red-50",
                        )}>
                          <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                            qc.result === "pass" ? "bg-emerald-500 text-white" : "bg-red-500 text-white",
                          )}>
                            {qc.result === "pass" ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <X className="w-3.5 h-3.5" aria-hidden="true" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold">
                                QC {qc.result === "pass" ? "Passed" : "Failed"}
                                {entry.qc_attempts.length > 1 && (
                                  <span className="text-muted-foreground font-normal ml-1">
                                    (attempt {j + 1}/{entry.qc_attempts.length})
                                  </span>
                                )}
                              </span>
                              {qc.inspector && (
                                <span className="text-sm text-muted-foreground">by {qc.inspector}</span>
                              )}
                              {qc.date && (
                                <span className="text-sm text-muted-foreground ml-auto">{formatDate(qc.date)}</span>
                              )}
                            </div>
                            {qc.result === "fail" && qc.fail_reason && (
                              <p className="text-sm text-red-700 mt-1">{qc.fail_reason}</p>
                            )}
                            {qc.result === "fail" && qc.return_stage && (
                              <div className="flex items-center gap-1.5 mt-1 text-sm text-red-600">
                                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Sent back to {PIECE_STAGE_LABELS[qc.return_stage as keyof typeof PIECE_STAGE_LABELS] ?? qc.return_stage}</span>
                              </div>
                            )}
                            {qc.result === "pass" && qc.ratings && (
                              <div className="flex flex-wrap gap-3 mt-2">
                                {Object.entries(qc.ratings).map(([cat, score]) => (
                                  <span key={cat} className="inline-flex items-center gap-1 text-sm text-emerald-700">
                                    <span className="capitalize">{cat}</span>
                                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" aria-hidden="true" />
                                    <span className="font-bold">{score}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Separator between trips */}
              {i < tripHistory.length - 1 && <hr className="mt-5 border-dashed" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Trip Cycles Section (manager view — hero) ─────────────────
//
// Bundles each trip with the customer feedback it produced. Newest cycle
// first (current trip pinned at top labelled "Current Cycle"), older trips
// fully expanded so the manager can scan the lifecycle without clicking.

function feedbackTripKey(fb: GarmentFeedback): number {
  // trip_number on garment_feedback = trip the garment was on when feedback
  // was given. The feedback is what produced the next trip.
  return fb.trip_number ?? 1;
}

interface MeasurementDiffRow {
  field?: string;
  original_value?: string | number | null;
  actual_value?: string | number | null;
  difference?: string | number | null;
  reason?: string | null;
}

interface OptionsChecklistRow {
  option_name?: string;
  expected_value?: string | null;
  actual_correct?: boolean;
  rejected?: boolean;
  new_value?: string | null;
  hashwa_correct?: boolean | null;
  hashwa_rejected?: boolean | null;
  hashwa_new_value?: string | null;
  notes?: string | null;
}

const OPTION_NAME_LABELS: Record<string, string> = {
  collar: "Collar",
  collarBtn: "Collar Button",
  frontPocket: "Front Pocket",
  cuff: "Cuffs",
  jabzour: "Jabzour",
  smallTabaggi: "Small Tabaggi",
};

function StyleOptionValue({ styleKey, fallback }: { styleKey: string | null | undefined; fallback?: string }) {
  const key = String(styleKey ?? "");
  const mapped = key ? STYLE_IMAGE_MAP[key] : null;
  const label = mapped?.label ?? key ?? fallback ?? "—";
  return (
    <span className="inline-flex items-center gap-1.5">
      {mapped?.image ? (
        <img
          src={mapped.image}
          alt={label}
          title={label}
          className="h-9 w-9 object-contain rounded bg-white border border-border"
        />
      ) : null}
      <span className="font-medium">{label}</span>
    </span>
  );
}

function CustomerFeedbackPanel({ fb }: { fb: GarmentFeedback }) {
  const action = fb.action ? FEEDBACK_ACTION_STYLE[fb.action] : null;
  const sat = fb.satisfaction_level ? SATISFACTION_LEVELS[fb.satisfaction_level] : null;
  const diffs = parseJson<MeasurementDiffRow[]>(fb.measurement_diffs) ?? [];
  const checklist = parseJson<OptionsChecklistRow[]>(fb.options_checklist) ?? [];
  const photoRaw = parseJson<unknown>(fb.photo_urls);
  const voiceRaw = parseJson<unknown>(fb.voice_note_urls);
  const photos = Array.isArray(photoRaw)
    ? (photoRaw as any[]).map((p) => (typeof p === "string" ? p : p?.url)).filter(Boolean) as string[]
    : [];
  const voices = Array.isArray(voiceRaw)
    ? (voiceRaw as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  const failedOptions = checklist.filter(
    (c) => c.rejected === true || c.hashwa_rejected === true,
  );

  return (
    <div className="border-t pt-3 space-y-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <MessageSquare className="w-3.5 h-3.5" />
          Customer Feedback
        </span>
        <span className="text-[11px] text-muted-foreground">
          {fb.feedback_type?.replace(/_/g, " ")}
        </span>
        {action && (
          <span className={cn("text-xs font-bold uppercase px-2 py-0.5 rounded border", action.cls)}>
            {action.label}
          </span>
        )}
        {sat && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded">
            <span className="text-base leading-none">{sat.emoji}</span>
            <span className="text-muted-foreground">{sat.label}</span>
          </span>
        )}
        {fb.created_at && (
          <span className="text-xs text-muted-foreground ml-auto">
            {formatDate(String(fb.created_at))}
          </span>
        )}
      </div>

      {fb.notes && (
        <p className="text-sm bg-card border border-border rounded p-2 whitespace-pre-wrap">
          {fb.notes}
        </p>
      )}

      {diffs.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
            <Ruler className="w-3.5 h-3.5" />
            Measurement Changes ({diffs.length})
          </div>
          <div className="rounded border border-border overflow-hidden bg-card">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left px-2 py-1 font-semibold">Field</th>
                  <th className="text-left px-2 py-1 font-semibold">Was</th>
                  <th className="text-left px-2 py-1 font-semibold">Now</th>
                  <th className="text-left px-2 py-1 font-semibold">Δ</th>
                  <th className="text-left px-2 py-1 font-semibold">Reason</th>
                </tr>
              </thead>
              <tbody>
                {diffs.map((d, i) => {
                  const reasonKey = (d.reason ?? "").toLowerCase().replace(/\s+/g, "_");
                  const reasonCls = DIFF_REASON_STYLE[reasonKey] ?? "bg-muted text-muted-foreground border-border";
                  return (
                    <tr key={i} className="border-t border-border">
                      <td className="px-2 py-1 font-medium capitalize">{(d.field ?? "—").replace(/_/g, " ")}</td>
                      <td className="px-2 py-1 tabular-nums text-muted-foreground">
                        <MeasurementValue raw={d.original_value} />
                      </td>
                      <td className="px-2 py-1 tabular-nums font-semibold">
                        <MeasurementValue raw={d.actual_value} />
                      </td>
                      <td className="px-2 py-1 tabular-nums">
                        <MeasurementValue raw={d.difference} />
                      </td>
                      <td className="px-2 py-1">
                        {d.reason && (
                          <span className={cn("inline-block text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border", reasonCls)}>
                            {d.reason.replace(/_/g, " ")}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {failedOptions.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-red-700 mb-1">
            <ListChecks className="w-3.5 h-3.5" />
            Style Options to Fix ({failedOptions.length})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {failedOptions.map((o, i) => {
              const rawName = o.option_name ?? "";
              const label = OPTION_NAME_LABELS[rawName] ?? rawName.replace(/_/g, " ");
              const mainChanged = o.rejected === true;
              const hashwaChanged = o.hashwa_rejected === true;
              // Non-style-key options (boolean toggles / accessories) render as text, not images.
              const isToggleOption =
                rawName === "smallTabaggi" ||
                rawName === "walletPocket" ||
                rawName === "penHolder";
              const toggleLabels: Record<string, { yes: string; no: string }> = {
                smallTabaggi: { yes: "Button", no: "No Button" },
                walletPocket: { yes: "Wallet Pocket", no: "No Wallet Pocket" },
                penHolder: { yes: "Pen Holder", no: "No Pen Holder" },
              };
              const toggleText = (v: string | null | undefined) => {
                const t = toggleLabels[rawName];
                if (!t) return v ?? "—";
                return v === "Yes" ? t.yes : v === "No" ? t.no : (v ?? "—");
              };
              const flippedFromExpected = (v: string | null | undefined) =>
                v === "Yes" ? "No" : v === "No" ? "Yes" : null;
              return (
                <div
                  key={i}
                  className="text-xs bg-red-50 text-red-900 border border-red-200 rounded p-2 space-y-1.5"
                >
                  <div className="flex items-center gap-1.5">
                    <X className="w-3 h-3 shrink-0 text-red-600" />
                    <span className="font-bold uppercase tracking-wider">{label}</span>
                  </div>
                  {mainChanged && (
                    <div className="flex items-center gap-2 flex-wrap pl-4">
                      {isToggleOption ? (
                        <>
                          <span className="font-medium">{toggleText(o.expected_value)}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-red-600 shrink-0" />
                          <span className="font-medium">
                            {toggleText(o.new_value ?? flippedFromExpected(o.expected_value))}
                          </span>
                        </>
                      ) : (
                        <>
                          <StyleOptionValue styleKey={o.expected_value} />
                          <ArrowRight className="w-3.5 h-3.5 text-red-600 shrink-0" />
                          {o.new_value ? (
                            <StyleOptionValue styleKey={o.new_value} />
                          ) : (
                            <span className="italic text-red-600/80">customer to decide</span>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  {hashwaChanged && (
                    <div className="flex items-center gap-2 flex-wrap pl-4">
                      <span className="text-[10px] font-bold uppercase text-red-600/80">Thickness →</span>
                      <span className="font-medium">
                        {o.hashwa_new_value
                          ? (THICKNESS_LABELS[o.hashwa_new_value] ?? o.hashwa_new_value)
                          : <span className="italic text-red-600/80">customer to decide</span>}
                      </span>
                    </div>
                  )}
                  {o.notes && (
                    <p className="pl-4 text-red-700/90 italic">{o.notes}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {photos.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
            <ImageIcon className="w-3.5 h-3.5" />
            Photos ({photos.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {photos.map((src, i) => (
              <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="block">
                <img
                  src={src}
                  alt={`Feedback photo ${i + 1}`}
                  className="h-20 w-20 object-cover rounded border border-border hover:opacity-80 transition-opacity"
                />
              </a>
            ))}
          </div>
        </div>
      )}

      {voices.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
            <Mic className="w-3.5 h-3.5" />
            Voice Notes ({voices.length})
          </div>
          <div className="space-y-1">
            {voices.map((src, i) => (
              <audio key={i} controls src={src} className="w-full max-w-md h-8" />
            ))}
          </div>
        </div>
      )}

      {fb.customer_signature && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Signature</span>
          <img
            src={fb.customer_signature}
            alt="Customer signature"
            className="h-12 bg-card border border-border rounded px-2"
          />
        </div>
      )}

      {!fb.notes && diffs.length === 0 && failedOptions.length === 0 && photos.length === 0 && voices.length === 0 && !fb.customer_signature && (
        <p className="text-xs italic text-muted-foreground">No additional notes recorded.</p>
      )}
    </div>
  );
}

function TripCycleCard({
  entry,
  feedback,
  isCurrent,
  garment,
  onEditPlan,
}: {
  entry: TripHistoryEntry | null;
  feedback: GarmentFeedback | null;
  isCurrent: boolean;
  garment: WorkshopGarment;
  onEditPlan?: () => void;
}) {
  // For the current (in-progress) trip, fall back to the live garment fields
  // since trip_history entries are written when the trip closes.
  const trip = entry?.trip ?? garment.trip_number ?? 1;
  const workers = entry?.worker_history ?? (isCurrent ? (garment.worker_history as Record<string, string> | null) : null) ?? {};
  const plan = isCurrent ? (garment.production_plan as Record<string, string> | null) ?? {} : entry?.production_plan ?? {};
  const reentryStage = entry?.reentry_stage ?? null;
  const assignedDate = entry?.assigned_date ?? (isCurrent ? garment.assigned_date : null);
  const completedDate = entry?.completed_date ?? null;
  const qcAttempts = entry?.qc_attempts ?? [];

  const tripLabel = trip === 1
    ? "Original"
    : trip === 2
      ? "Return"
      : `Alt ${trip - 2}`;

  const workerEntries = Object.entries(workers as Record<string, string>).filter(([, v]) => !!v);
  const planEntries = Object.entries(plan as Record<string, string>).filter(([, v]) => !!v);
  const showPlanFallback = workerEntries.length === 0 && planEntries.length > 0;
  const teamSource = showPlanFallback ? planEntries : workerEntries;

  return (
    <div className="bg-card border rounded-xl p-3 shadow-sm space-y-3">
      {/* Cycle meta row — flat, inline, no header band */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-muted text-foreground">
          {tripLabel}
        </span>
        {isCurrent && (
          <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-foreground text-background">
            <PlayCircle className="w-3 h-3" />
            Current
          </span>
        )}
        {reentryStage && (
          <span className="text-xs text-muted-foreground">
            re-entered at <span className="font-semibold text-foreground">
              {PIECE_STAGE_LABELS[reentryStage as keyof typeof PIECE_STAGE_LABELS] ?? reentryStage}
            </span>
          </span>
        )}
        <div className="ml-auto text-xs text-muted-foreground tabular-nums">
          {assignedDate && <span>{formatDate(assignedDate)}</span>}
          {completedDate && <span> → {formatDate(completedDate)}</span>}
          {!completedDate && isCurrent && assignedDate && <span> → in progress</span>}
        </div>
      </div>

      {/* Production Team — primary content, edit button when current and editable */}
      {(teamSource.length > 0 || (isCurrent && onEditPlan)) && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {showPlanFallback ? "Planned Team" : "Production Team"}
            </span>
            {isCurrent && onEditPlan && (
              <button
                onClick={onEditPlan}
                className="text-xs text-primary hover:underline cursor-pointer font-medium"
              >
                Edit Plan
              </button>
            )}
          </div>
          {teamSource.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {teamSource.map(([key, name]) => (
                <span key={key} className="inline-flex items-center gap-1 text-xs bg-muted text-foreground px-2 py-1 rounded">
                  <span className="text-muted-foreground">{WORKER_LABELS[key] ?? key}:</span>
                  <span className="font-semibold">{name}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs italic text-muted-foreground">No team assigned yet.</p>
          )}
        </div>
      )}

      {/* QC attempts */}
      {qcAttempts.length > 0 && (
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
            QC {qcAttempts.length === 1 ? "Result" : `Attempts (${qcAttempts.length})`}
          </div>
          <div className="space-y-1.5">
            {qcAttempts.map((qc, j) => {
              const cycleStart = j === 0
                ? (reentryStage ?? "soaking")
                : qcAttempts[j - 1]?.return_stage ?? "soaking";
              const startLabel = PIECE_STAGE_LABELS[cycleStart as keyof typeof PIECE_STAGE_LABELS] ?? cycleStart;
              return (
                <div key={j}>
                  {j > 0 && (
                    <div className="flex items-center gap-1.5 mb-1 text-xs text-muted-foreground font-medium">
                      <RotateCcw className="w-3 h-3" />
                      Re-entered at {startLabel}
                    </div>
                  )}
                  <div className="flex items-start gap-2 text-sm">
                    {qc.result === "pass" ? (
                      <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <X className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">
                          QC {qc.result === "pass" ? "Passed" : "Failed"}
                          {qcAttempts.length > 1 && (
                            <span className="text-muted-foreground font-normal ml-1">
                              (attempt {j + 1}/{qcAttempts.length})
                            </span>
                          )}
                        </span>
                        {qc.inspector && (
                          <span className="text-xs text-muted-foreground">by {qc.inspector}</span>
                        )}
                        {qc.date && (
                          <span className="text-xs text-muted-foreground ml-auto">{formatDate(qc.date)}</span>
                        )}
                      </div>
                      {qc.result === "fail" && qc.fail_reason && (
                        <p className="text-xs text-red-700 mt-0.5">{qc.fail_reason}</p>
                      )}
                      {qc.result === "fail" && qc.return_stage && (
                        <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                          <RotateCcw className="w-3 h-3" />
                          Sent back to {PIECE_STAGE_LABELS[qc.return_stage as keyof typeof PIECE_STAGE_LABELS] ?? qc.return_stage}
                        </div>
                      )}
                      {qc.result === "pass" && qc.ratings && (
                        <div className="flex flex-wrap gap-2 mt-1">
                          {Object.entries(qc.ratings).map(([cat, score]) => (
                            <span key={cat} className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                              <span className="capitalize">{cat}</span>
                              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                              <span className="font-bold text-foreground">{score}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Customer feedback for this trip */}
      {feedback ? (
        <CustomerFeedbackPanel fb={feedback} />
      ) : isCurrent ? (
        <p className="text-xs italic text-muted-foreground">
          Customer feedback not yet recorded for this cycle.
        </p>
      ) : (
        <p className="text-xs italic text-muted-foreground">
          No customer feedback was recorded for this trip.
        </p>
      )}
    </div>
  );
}

export function TripCyclesSection({
  garment,
  feedbackHistory,
  isLoadingFeedback,
  onEditCurrentPlan,
}: {
  garment: WorkshopGarment;
  feedbackHistory: GarmentFeedback[];
  isLoadingFeedback?: boolean;
  /** Open the plan-edit dialog. Wired only into the current-cycle card. */
  onEditCurrentPlan?: () => void;
}) {
  const rawHistory = garment.trip_history;
  const tripEntries: TripHistoryEntry[] = !rawHistory
    ? []
    : typeof rawHistory === "string"
      ? JSON.parse(rawHistory)
      : Array.isArray(rawHistory)
        ? (rawHistory as TripHistoryEntry[])
        : [];

  const currentTripNum = garment.trip_number ?? 1;

  // Latest feedback per trip (newest by created_at wins; list comes in desc order)
  const feedbackByTrip = new Map<number, GarmentFeedback>();
  for (const fb of feedbackHistory) {
    const k = feedbackTripKey(fb);
    if (!feedbackByTrip.has(k)) feedbackByTrip.set(k, fb);
  }

  // Build cycle list — union of trips seen in trip_history + current garment trip
  const tripNumbers = new Set<number>();
  for (const e of tripEntries) tripNumbers.add(e.trip);
  tripNumbers.add(currentTripNum);
  for (const t of feedbackByTrip.keys()) tripNumbers.add(t);

  const sortedTrips = [...tripNumbers].sort((a, b) => b - a); // newest first

  if (sortedTrips.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <History className="w-5 h-5 text-foreground" />
        <h2 className="text-base font-bold uppercase tracking-wider">
          Trip History
        </h2>
        <span className="text-xs font-bold bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
          {sortedTrips.length} cycle{sortedTrips.length !== 1 ? "s" : ""}
        </span>
        {isLoadingFeedback && (
          <span className="text-xs text-muted-foreground italic">loading feedback…</span>
        )}
      </div>

      <div className="space-y-3">
        {sortedTrips.map((tripNum) => {
          const entry = tripEntries.find((e) => e.trip === tripNum) ?? null;
          const feedback = feedbackByTrip.get(tripNum) ?? null;
          const isCurrent = tripNum === currentTripNum && garment.piece_stage !== "completed";
          return (
            <TripCycleCard
              key={tripNum}
              entry={entry}
              feedback={feedback}
              isCurrent={isCurrent}
              garment={garment}
              onEditPlan={isCurrent ? onEditCurrentPlan : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Collapsible Specs Section ─────────────────────────────────
//
// Wraps Style + Production Team + Measurements into one collapsible panel
// that's secondary to the trip-cycle hero section above.

export function CollapsibleSpecsSection({
  garment,
  defaultOpen = false,
}: {
  garment: WorkshopGarment;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/30 transition-colors cursor-pointer"
      >
        <Package className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Garment Specs
        </span>
        <span className="text-xs text-muted-foreground/80">
          Style · Measurements
        </span>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground ml-auto transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="border-t p-3 space-y-3">
          <StyleSection garment={garment} />
          <MeasurementsSection garment={garment} />
        </div>
      )}
    </div>
  );
}
