import { ProductionPipeline } from "@/components/shared/ProductionPipeline";
import { MeasurementGrid } from "@/components/shared/MeasurementGrid";
import { StageBadge, AlterationBadge, ExpressBadge } from "@/components/shared/StageBadge";
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
} from "lucide-react";
import type { WorkshopGarment, ProductionPlan, WorkerHistory, TripHistoryEntry } from "@repo/database";

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
      </div>

      {/* Info + dates row */}
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
        {/* When showExtras is true, dates are editable via children — skip read-only display */}
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

      {/* Extra content (e.g. editable dates) */}
      {children}

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
      <MeasurementGrid measurement={garment.measurement} />
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
