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
  Home,
  User,
  Package,
  Phone,
  ChevronDown,
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
import { getQcReturnStages } from "@repo/database";

// ── Customer feedback constants ────────────────────────────────

const SATISFACTION_LEVELS: Record<number, string> = {
  1: "Angry",
  2: "Unhappy",
  3: "Okay",
  4: "Happy",
  5: "Love it",
};

// Color only the verdicts that require manager action. Accepted/collected/delivered
// stay neutral — nothing to act on.
const FEEDBACK_ACTION_STYLE: Record<string, { label: string; cls: string }> = {
  accepted:              { label: "Accepted",          cls: "bg-muted text-foreground" },
  needs_repair_accepted: { label: "Accepted with fix", cls: "bg-[var(--status-warn-bg)] text-[var(--status-warn)]" },
  needs_repair_rejected: { label: "Rejected — repair", cls: "bg-[var(--status-warn-bg)] text-[var(--status-warn)]" },
  needs_repair:          { label: "Needs repair",      cls: "bg-[var(--status-warn-bg)] text-[var(--status-warn)]" },
  needs_redo:            { label: "Rejected — redo",   cls: "bg-[var(--status-bad-bg)] text-[var(--status-bad)]" },
  collected:             { label: "Collected",         cls: "bg-muted text-foreground" },
  delivered:             { label: "Delivered",         cls: "bg-muted text-foreground" },
};

const DIFF_REASON_STYLE: Record<string, string> = {
  customer_request: "bg-[var(--status-ok-bg)] text-[var(--status-ok)]",
  workshop_error:   "bg-[var(--status-bad-bg)] text-[var(--status-bad)]",
  shop_error:       "bg-muted text-muted-foreground",
};

function parseJson<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw !== "string") return raw as T;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

// ── Constants (shared) ──────────────────────────────────────────

const STYLE_FIELDS: { key: string; label: string; type: "text" | "boolean"; thicknessKey?: string }[] = [
  { key: "collar_type", label: "Collar", type: "text", thicknessKey: "collar_thickness" },
  { key: "collar_button", label: "Collar button", type: "text" },
  { key: "collar_position", label: "Collar position", type: "text" },
  { key: "cuffs_type", label: "Cuffs", type: "text", thicknessKey: "cuffs_thickness" },
  { key: "front_pocket_type", label: "Front pocket", type: "text", thicknessKey: "front_pocket_thickness" },
  { key: "wallet_pocket", label: "Wallet pocket", type: "boolean" },
  { key: "pen_holder", label: "Pen holder", type: "boolean" },
  { key: "small_tabaggi", label: "Small tabaggi", type: "boolean" },
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
  post_cutter: "Post-cutter",
  sewer: "Sewing unit",
  finisher: "Finisher",
  ironer: "Ironer",
  quality_checker: "QC inspector",
  soaking: "Soaking",
  cutting: "Cutting",
  post_cutting: "Post-cutting",
  sewing: "Sewing unit",
  finishing: "Finishing",
  ironing: "Ironing",
};

// ── Section title ──────────────────────────────────────────────

function SectionTitle({ children, count }: { children: React.ReactNode; count?: number | string }) {
  return (
    <div className="flex items-baseline gap-2">
      <h3 className="text-sm font-medium text-muted-foreground">{children}</h3>
      {count !== undefined && (
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
      )}
    </div>
  );
}

// ── Summary row (collapsible subsection with one-line summary) ─

function SummaryRow({
  icon,
  label,
  summary,
  badge,
  defaultOpen = false,
  action,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  /** One-line at-a-glance text shown when collapsed. */
  summary: React.ReactNode;
  /** Optional status pill, rendered between summary and chevron. */
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  /** Optional trailing action (e.g. Edit plan) rendered inside expanded content header. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors cursor-pointer"
      >
        {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
        <span className="text-sm font-medium text-muted-foreground shrink-0">{label}</span>
        <span className="text-sm text-foreground min-w-0 truncate">{summary}</span>
        {badge && <span className="ml-auto shrink-0">{badge}</span>}
        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground shrink-0 transition-transform",
            !badge && "ml-auto",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="border-t border-border p-3 space-y-3">
          {action && <div className="flex justify-end">{action}</div>}
          {children}
        </div>
      )}
    </div>
  );
}

// ── Garment Header ──────────────────────────────────────────────
//
// Single source of truth for the identity strip used by both the assigned
// detail page and the terminal page. No decorative left-border (the brova/
// final distinction is conveyed by a labelled pill, not chrome). Children
// render inline on sm+ so edit-date controls can pin right.

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
    <div className="border border-border bg-card rounded-md p-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          {/* Identity row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-muted text-foreground capitalize">
              {garment.garment_type}
            </span>
            <span className="font-mono text-2xl tracking-tight">
              {garment.garment_id ?? garment.id.slice(0, 8)}
            </span>
            <StageBadge stage={garment.piece_stage} garmentType={garment.garment_type} inProduction={garment.in_production} location={garment.location} />
            {garment.express && <ExpressBadge />}
            <AlterationBadge tripNumber={garment.trip_number} garmentType={garment.garment_type} />
            <QcFixBadge tripNumber={garment.trip_number} tripHistory={garment.trip_history} />
          </div>

          {/* Customer / invoice / phone / delivery — all sentence case, muted */}
          <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {garment.customer_name && (
              <span className="flex items-center gap-1">
                <User className="w-3.5 h-3.5" aria-hidden="true" />
                {garment.customer_name}
              </span>
            )}
            {garment.invoice_number && (
              <span className="flex items-center gap-1 font-mono">
                <Package className="w-3.5 h-3.5" aria-hidden="true" />
                INV-{garment.invoice_number}
              </span>
            )}
            {showExtras && garment.customer_mobile && (
              <span className="flex items-center gap-1 font-mono">
                <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                {garment.customer_mobile}
              </span>
            )}
            {garment.home_delivery_order && (
              <span className="flex items-center gap-1 text-indigo-700">
                <Home className="w-3.5 h-3.5" aria-hidden="true" />
                Delivery
              </span>
            )}
            {!showExtras && garment.delivery_date_order && (
              <span>Delivery {formatDate(garment.delivery_date_order)}</span>
            )}
            {!showExtras && garment.assigned_date && (
              <span>Assigned {formatDate(garment.assigned_date)}</span>
            )}
          </div>
        </div>

        {children && <div className="sm:text-right shrink-0">{children}</div>}
      </div>

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

export function StyleSection({
  garment,
  embedded = false,
}: {
  garment: WorkshopGarment;
  /** When rendered inside an already-bordered wrapper, drop the local card chrome. */
  embedded?: boolean;
}) {
  const g = garment as any;
  const specs = STYLE_FIELDS.filter((f) => {
    const val = g[f.key];
    if (f.type === "boolean") return val === true;
    return val != null && val !== "";
  });

  return (
    <div className={cn("space-y-3", !embedded && "bg-card border border-border rounded-md p-4")}>
      {garment.style_image_url && (
        <div className="rounded-md overflow-hidden border border-border bg-muted">
          <img
            src={garment.style_image_url}
            alt={garment.style_name ?? "Style"}
            className="w-full h-auto max-h-48 object-contain"
          />
        </div>
      )}

      {!embedded && <SectionTitle>Style & fabric</SectionTitle>}

      <div className="space-y-0">
        <SpecRow label="Style" value={garment.style_name ?? garment.style ?? "—"} valueClass="capitalize" />
        <SpecRow
          label="Fabric"
          value={
            <>
              {garment.fabric_name ?? "—"}
              {garment.fabric_color && (
                <span className="text-muted-foreground ml-1">({garment.fabric_color})</span>
              )}
            </>
          }
        />
        {garment.soaking && (
          <SpecRow label="Soaking" value={<span className="text-[var(--status-info)]">Required</span>} />
        )}

        {specs.map((field) => {
          let lookupKey = String(g[field.key]);
          if (field.key === "jabzour_1") {
            lookupKey = g.jabzour_1 === "ZIPPER" ? "JAB_SHAAB" : String(g.jabzour_2 ?? "");
          }
          if (field.key === "jabzour_2" && g.jabzour_1 !== "ZIPPER") return null;
          const mapped = field.type === "text" ? STYLE_IMAGE_MAP[lookupKey] : null;
          const thickness = field.thicknessKey ? g[field.thicknessKey] : null;
          const thicknessLabel = thickness ? THICKNESS_LABELS[thickness] ?? thickness : null;
          const isBool = field.type === "boolean";
          const boolIcon = isBool && field.key === "wallet_pocket" ? ACCESSORY_ICONS.wallet
            : isBool && field.key === "pen_holder" ? ACCESSORY_ICONS.pen
            : isBool && field.key === "small_tabaggi" ? ACCESSORY_ICONS.smallTabaggi
            : null;

          return (
            <SpecRow
              key={field.key}
              label={field.label}
              value={
                <div className="flex items-center gap-2 justify-end">
                  {mapped?.image ? (
                    <img src={mapped.image} alt={mapped.label} className="h-9 w-9 object-contain rounded-md" title={mapped.label} />
                  ) : boolIcon ? (
                    <img src={boolIcon} alt={field.label} className="h-7 w-7 object-contain" />
                  ) : null}
                  <span>{isBool ? "Yes" : (mapped?.label ?? lookupKey)}</span>
                  {thicknessLabel && (
                    <span className="text-xs font-medium bg-muted text-muted-foreground px-1.5 py-0.5 rounded-md">
                      {thicknessLabel}
                    </span>
                  )}
                </div>
              }
            />
          );
        })}

        {specs.length === 0 && !garment.fabric_name && (
          <p className="text-sm text-muted-foreground italic py-1">No style specs recorded.</p>
        )}
      </div>
    </div>
  );
}

function SpecRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0 gap-3">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className={cn("text-base text-right min-w-0", valueClass)}>{value}</span>
    </div>
  );
}

// ── Worker / Production Team ───────────────────────────────────

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

  let stages: string[] = [...PRODUCTION_STAGES];
  if (isReturn && reentryStage) {
    const reentryIdx = stages.indexOf(reentryStage as any);
    if (reentryIdx > 0) stages = stages.slice(reentryIdx);
  }
  const currentIdx = stages.indexOf(currentStage as any);

  return (
    <div className="bg-card border border-border rounded-md p-4">
      <div className="flex items-center justify-between mb-2">
        <SectionTitle>Production team</SectionTitle>
        {onEditPlan && (
          <button
            onClick={onEditPlan}
            className="text-sm font-medium text-primary hover:underline cursor-pointer"
          >
            Edit plan
          </button>
        )}
      </div>

      <div>
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
              className="flex items-center justify-between py-2 border-b border-border last:border-0"
            >
              <div className="flex items-center gap-2">
                {isDone && <Check className="w-3.5 h-3.5 text-[var(--status-ok)]" aria-hidden="true" />}
                {isCurrent && <div className="w-2 h-2 rounded-full bg-[var(--status-info)] animate-pulse" />}
                {isPending && <div className="w-2 h-2 rounded-full bg-muted-foreground/40" />}
                <span className={cn("text-sm", isPending && "text-muted-foreground")}>
                  {WORKER_LABELS[historyKey] ??
                    PIECE_STAGE_LABELS[stage as keyof typeof PIECE_STAGE_LABELS] ??
                    stage}
                </span>
              </div>

              <span className="text-base text-right">
                {actual ? actual : planned ? <span className="text-muted-foreground">{planned}</span> : <span className="text-muted-foreground/50">—</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Measurements Section ──────────────────────────────────────

export function MeasurementsSection({
  garment,
  embedded = false,
}: {
  garment: WorkshopGarment;
  embedded?: boolean;
}) {
  return (
    <div className={cn("space-y-2", !embedded && "bg-card border border-border rounded-md p-4")}>
      {!embedded && <SectionTitle>Measurements</SectionTitle>}
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
    <div className="bg-[var(--status-warn-bg)] border border-border rounded-md p-3 space-y-1">
      <h3 className="text-sm font-medium text-[var(--status-warn)]">Notes</h3>
      <p className="text-base text-foreground whitespace-pre-wrap">{notes}</p>
    </div>
  );
}

// ── Trip cycle internals ──────────────────────────────────────

function feedbackTripKey(fb: GarmentFeedback): number {
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
  collarBtn: "Collar button",
  frontPocket: "Front pocket",
  cuff: "Cuffs",
  jabzour: "Jabzour",
  smallTabaggi: "Small tabaggi",
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
          className="h-9 w-9 object-contain rounded-md bg-card border border-border"
        />
      ) : null}
      <span>{label}</span>
    </span>
  );
}

export function CustomerFeedbackPanel({
  fb,
  /** When the panel is already nested under a row that surfaces the action label,
   *  pass `compact` to drop redundant header chrome. */
  compact = false,
}: {
  fb: GarmentFeedback;
  compact?: boolean;
}) {
  const action = fb.action ? FEEDBACK_ACTION_STYLE[fb.action] : null;
  const satLabel = fb.satisfaction_level ? SATISFACTION_LEVELS[fb.satisfaction_level] : null;
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
  const mediaCount = photos.length + voices.length + (fb.customer_signature ? 1 : 0);

  return (
    <div className={cn("space-y-3", !compact && "border-t border-border pt-3")}>
      {!compact && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground">
            <MessageSquare className="w-3.5 h-3.5" />
            Customer feedback
          </span>
          {fb.feedback_type && (
            <span className="text-xs text-muted-foreground capitalize">
              {fb.feedback_type.replace(/_/g, " ")}
            </span>
          )}
          {action && (
            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-md", action.cls)}>
              {action.label}
            </span>
          )}
          {satLabel && fb.satisfaction_level && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <span className="inline-flex">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      "w-3.5 h-3.5",
                      i < (fb.satisfaction_level ?? 0)
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground/30",
                    )}
                  />
                ))}
              </span>
              {satLabel}
            </span>
          )}
          {fb.created_at && (
            <span className="text-xs text-muted-foreground ml-auto tabular-nums">
              {formatDate(String(fb.created_at))}
            </span>
          )}
        </div>
      )}

      {/* In compact mode the panel is nested under a row that already shows the
          verdict + change counts, so we omit satisfaction/date/type chrome and
          only render the actual change requests below. */}

      {fb.notes && (
        <p className="text-base bg-muted rounded-md p-2.5 whitespace-pre-wrap">
          {fb.notes}
        </p>
      )}

      {diffs.length > 0 && (
        <div className="space-y-1.5">
          <SectionTitle count={diffs.length}>
            <span className="inline-flex items-center gap-1.5">
              <Ruler className="w-3.5 h-3.5" />
              Measurement changes
            </span>
          </SectionTitle>
          <div className="rounded-md border border-border overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left px-2 py-1.5 text-sm font-medium text-muted-foreground">Field</th>
                  <th className="text-left px-2 py-1.5 text-sm font-medium text-muted-foreground">Was</th>
                  <th className="text-left px-2 py-1.5 text-sm font-medium text-muted-foreground">Now</th>
                  <th className="text-left px-2 py-1.5 text-sm font-medium text-muted-foreground">Δ</th>
                  <th className="text-left px-2 py-1.5 text-sm font-medium text-muted-foreground">Reason</th>
                </tr>
              </thead>
              <tbody>
                {diffs.map((d, i) => {
                  const reasonKey = (d.reason ?? "").toLowerCase().replace(/\s+/g, "_");
                  const reasonCls = DIFF_REASON_STYLE[reasonKey] ?? "bg-muted text-muted-foreground";
                  return (
                    <tr key={i} className="border-t border-border">
                      <td className="px-2 py-1.5 capitalize">{(d.field ?? "—").replace(/_/g, " ")}</td>
                      <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                        <MeasurementValue raw={d.original_value} />
                      </td>
                      <td className="px-2 py-1.5 tabular-nums">
                        <MeasurementValue raw={d.actual_value} />
                      </td>
                      <td className="px-2 py-1.5 tabular-nums">
                        <MeasurementValue raw={d.difference} />
                      </td>
                      <td className="px-2 py-1.5">
                        {d.reason && (
                          <span className={cn("inline-block text-xs font-medium px-1.5 py-0.5 rounded-md", reasonCls)}>
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
        <div className="space-y-1.5">
          <SectionTitle count={failedOptions.length}>
            <span className="inline-flex items-center gap-1.5 text-[var(--status-bad)]">
              <ListChecks className="w-3.5 h-3.5" />
              Style options to fix
            </span>
          </SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {failedOptions.map((o, i) => {
              const rawName = o.option_name ?? "";
              const label = OPTION_NAME_LABELS[rawName] ?? rawName.replace(/_/g, " ");
              const mainChanged = o.rejected === true;
              const hashwaChanged = o.hashwa_rejected === true;
              const isToggleOption =
                rawName === "smallTabaggi" ||
                rawName === "walletPocket" ||
                rawName === "penHolder";
              const toggleLabels: Record<string, { yes: string; no: string }> = {
                smallTabaggi: { yes: "Button", no: "No button" },
                walletPocket: { yes: "Wallet pocket", no: "No wallet pocket" },
                penHolder: { yes: "Pen holder", no: "No pen holder" },
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
                  className="text-sm bg-[var(--status-bad-bg)] text-[var(--status-bad)] rounded-md p-2.5 space-y-1.5"
                >
                  <div className="flex items-center gap-1.5">
                    <X className="w-3.5 h-3.5 shrink-0" />
                    <span className="font-medium">{label}</span>
                  </div>
                  {mainChanged && (
                    <div className="flex items-center gap-2 flex-wrap pl-5 text-foreground">
                      {isToggleOption ? (
                        <>
                          <span>{toggleText(o.expected_value)}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-[var(--status-bad)] shrink-0" />
                          <span>
                            {toggleText(o.new_value ?? flippedFromExpected(o.expected_value))}
                          </span>
                        </>
                      ) : (
                        <>
                          <StyleOptionValue styleKey={o.expected_value} />
                          <ArrowRight className="w-3.5 h-3.5 text-[var(--status-bad)] shrink-0" />
                          {o.new_value ? (
                            <StyleOptionValue styleKey={o.new_value} />
                          ) : (
                            <span className="italic text-muted-foreground">customer to decide</span>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  {hashwaChanged && (
                    <div className="flex items-center gap-2 flex-wrap pl-5 text-foreground">
                      <span className="text-xs text-[var(--status-bad)]">Thickness →</span>
                      <span>
                        {o.hashwa_new_value
                          ? (THICKNESS_LABELS[o.hashwa_new_value] ?? o.hashwa_new_value)
                          : <span className="italic text-muted-foreground">customer to decide</span>}
                      </span>
                    </div>
                  )}
                  {o.notes && (
                    <p className="pl-5 italic text-muted-foreground">{o.notes}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {mediaCount > 0 && (
        <FeedbackMediaToggle photos={photos} voices={voices} signature={fb.customer_signature ?? null} />
      )}

      {!fb.notes && diffs.length === 0 && failedOptions.length === 0 && mediaCount === 0 && (
        <p className="text-sm italic text-muted-foreground">
          {compact ? "No changes requested." : "No additional notes recorded."}
        </p>
      )}
    </div>
  );
}

function FeedbackMediaToggle({
  photos,
  voices,
  signature,
}: {
  photos: string[];
  voices: string[];
  signature: string | null;
}) {
  const [open, setOpen] = useState(false);
  const parts: string[] = [];
  if (photos.length > 0) parts.push(`${photos.length} photo${photos.length !== 1 ? "s" : ""}`);
  if (voices.length > 0) parts.push(`${voices.length} voice note${voices.length !== 1 ? "s" : ""}`);
  if (signature) parts.push("signature");

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors cursor-pointer"
      >
        <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Media</span>
        <span className="text-sm text-foreground">{parts.join(" · ")}</span>
        <ChevronDown
          className={cn("w-4 h-4 text-muted-foreground ml-auto transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="border-t border-border p-3 space-y-3">
          {photos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {photos.map((src, i) => (
                <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="block">
                  <img
                    src={src}
                    alt={`Feedback photo ${i + 1}`}
                    className="h-20 w-20 object-cover rounded-md border border-border hover:opacity-80 transition-opacity"
                  />
                </a>
              ))}
            </div>
          )}
          {voices.length > 0 && (
            <div className="space-y-1">
              {voices.map((src, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Mic className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <audio controls src={src} className="w-full max-w-md h-8" />
                </div>
              ))}
            </div>
          )}
          {signature && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Signature</span>
              <img
                src={signature}
                alt="Customer signature"
                className="h-12 bg-card border border-border rounded-md px-2"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Trip cycle card (used by CurrentCycle + PastTrips) ────────

function tripLabel(trip: number) {
  return trip === 1 ? "Original" : trip === 2 ? "Return" : `Alteration ${trip - 2}`;
}

// ── QC labels ──────────────────────────────────────────────────

const QC_MEASUREMENT_LABELS: Record<string, string> = {
  collar_width: "Collar width",
  collar_height: "Collar height",
  shoulder: "Shoulder",
  chest_full: "Chest (full)",
  chest_upper: "Chest (upper)",
  chest_front: "Chest (front)",
  chest_back: "Chest (back)",
  sleeve_length: "Sleeve length",
  sleeve_width: "Sleeve width",
  elbow: "Elbow",
  armhole: "Armhole",
  armhole_front: "Armhole (front)",
  waist_full: "Waist (full)",
  waist_front: "Waist (front)",
  waist_back: "Waist (back)",
  length_front: "Length (front)",
  length_back: "Length (back)",
  bottom: "Bottom",
  top_pocket_length: "Top pocket length",
  top_pocket_width: "Top pocket width",
  top_pocket_distance: "Top pocket distance",
  side_pocket_length: "Side pocket length",
  side_pocket_width: "Side pocket width",
  side_pocket_distance: "Side pocket distance",
  side_pocket_opening: "Side pocket opening",
  jabzour_length: "Jabzour length",
  jabzour_width: "Jabzour width",
};

const QC_OPTION_LABELS: Record<string, string> = {
  collar_type: "Collar",
  collar_button: "Collar button",
  collar_position: "Collar position",
  collar_thickness: "Collar thickness",
  cuffs_type: "Cuffs",
  cuffs_thickness: "Cuffs thickness",
  front_pocket_type: "Front pocket",
  front_pocket_thickness: "Front pocket thickness",
  jabzour_1: "Jabzour",
  jabzour_2: "Jabzour style",
  jabzour_thickness: "Jabzour thickness",
  small_tabaggi: "Small tabaggi",
  wallet_pocket: "Wallet pocket",
  pen_holder: "Pen holder",
  mobile_pocket: "Mobile pocket",
};

const QC_STYLE_KEY_OPTIONS = new Set([
  "collar_type", "collar_button", "collar_position",
  "cuffs_type", "front_pocket_type", "jabzour_1", "jabzour_2",
]);

function qcMeasurementLabel(key: string): string {
  return QC_MEASUREMENT_LABELS[key] ?? key.replace(/_/g, " ");
}

function qcOptionLabel(key: string): string {
  return QC_OPTION_LABELS[key] ?? key.replace(/_/g, " ");
}

function formatOptionValue(key: string, value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const thickness = key.endsWith("_thickness");
  if (thickness && typeof value === "string") return THICKNESS_LABELS[value] ?? value;
  return String(value);
}

function QcFailureDetails({
  qc,
  garment,
}: {
  qc: NonNullable<TripHistoryEntry["qc_attempts"]>[number];
  garment: WorkshopGarment;
}) {
  const g = garment as unknown as Record<string, unknown>;
  const measurement = (garment.measurement ?? null) as Record<string, number> | null;
  const failedMeasurements = qc.failed_measurements ?? [];
  const failedOptions = qc.failed_options ?? [];
  const failedQuality = qc.failed_quality ?? [];
  const qualityRatings = qc.quality_ratings ?? qc.ratings ?? null;
  const returnStages = getQcReturnStages(qc);

  const hasAny =
    failedMeasurements.length > 0 ||
    failedOptions.length > 0 ||
    failedQuality.length > 0 ||
    !!qc.fail_reason;

  return (
    <div className="space-y-2.5">
      {failedMeasurements.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-sm font-medium text-[var(--status-bad)]">
            <Ruler className="w-3.5 h-3.5" />
            Measurements out of tolerance
            <span className="text-xs text-muted-foreground font-normal tabular-nums">
              {failedMeasurements.length}
            </span>
          </div>
          <div className="rounded-md border border-border overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left px-2 py-1.5 text-sm font-medium text-muted-foreground">Field</th>
                  <th className="text-left px-2 py-1.5 text-sm font-medium text-muted-foreground">Expected</th>
                  <th className="text-left px-2 py-1.5 text-sm font-medium text-muted-foreground">Recorded</th>
                </tr>
              </thead>
              <tbody>
                {failedMeasurements.map((key) => {
                  const expected = measurement?.[key] ?? null;
                  const recorded = qc.measurements?.[key] ?? null;
                  return (
                    <tr key={key} className="border-t border-border">
                      <td className="px-2 py-1.5">{qcMeasurementLabel(key)}</td>
                      <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                        <MeasurementValue raw={expected} />
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-[var(--status-bad)]">
                        <MeasurementValue raw={recorded} />
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
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-sm font-medium text-[var(--status-bad)]">
            <ListChecks className="w-3.5 h-3.5" />
            Options that didn&apos;t match
            <span className="text-xs text-muted-foreground font-normal tabular-nums">
              {failedOptions.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {failedOptions.map((key) => {
              const expected = g[key];
              const recorded = qc.options?.[key];
              const isStyleKey = QC_STYLE_KEY_OPTIONS.has(key);
              return (
                <div key={key} className="text-sm bg-[var(--status-bad-bg)] rounded-md p-2.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[var(--status-bad)]">
                    <X className="w-3.5 h-3.5 shrink-0" />
                    <span className="font-medium">{qcOptionLabel(key)}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap pl-5 text-foreground">
                    {isStyleKey ? (
                      <>
                        <StyleOptionValue styleKey={expected as string} />
                        <ArrowRight className="w-3.5 h-3.5 text-[var(--status-bad)] shrink-0" />
                        <StyleOptionValue styleKey={recorded as string} />
                      </>
                    ) : (
                      <>
                        <span>{formatOptionValue(key, expected)}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-[var(--status-bad)] shrink-0" />
                        <span className="text-[var(--status-bad)]">{formatOptionValue(key, recorded)}</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {failedQuality.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-sm font-medium text-[var(--status-bad)]">
            <Star className="w-3.5 h-3.5" />
            Quality aspects below threshold
            <span className="text-xs text-muted-foreground font-normal tabular-nums">
              {failedQuality.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {failedQuality.map((aspect) => {
              const score = qualityRatings?.[aspect];
              return (
                <span
                  key={aspect}
                  className="inline-flex items-center gap-1 text-sm bg-[var(--status-bad-bg)] text-[var(--status-bad)] px-2 py-1 rounded-md"
                >
                  <span className="capitalize">{aspect.replace(/_/g, " ")}</span>
                  {typeof score === "number" && (
                    <>
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      <span>{score}</span>
                    </>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {qc.fail_reason && (
        <p className="text-sm bg-muted rounded-md p-2.5 whitespace-pre-wrap">
          {qc.fail_reason}
        </p>
      )}

      {returnStages.length > 0 && (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <RotateCcw className="w-3.5 h-3.5" />
          Sent back to{" "}
          <span className="text-foreground">
            {returnStages
              .map((s) => PIECE_STAGE_LABELS[s as keyof typeof PIECE_STAGE_LABELS] ?? s)
              .join(" → ")}
          </span>
        </div>
      )}

      {!hasAny && returnStages.length === 0 && (
        <p className="text-sm italic text-muted-foreground">No specific defects recorded.</p>
      )}
    </div>
  );
}

function QcAttemptList({
  qcAttempts,
  reentryStage,
  garment,
}: {
  qcAttempts: NonNullable<TripHistoryEntry["qc_attempts"]>;
  reentryStage: string | null;
  garment: WorkshopGarment;
}) {
  return (
    <div className="space-y-3">
      {qcAttempts.map((qc, j) => {
        const prevReturnStages = j === 0 ? [] : getQcReturnStages(qcAttempts[j - 1]);
        const cycleStart = j === 0 ? (reentryStage ?? "soaking") : prevReturnStages[0] ?? "soaking";
        const startLabel = PIECE_STAGE_LABELS[cycleStart as keyof typeof PIECE_STAGE_LABELS] ?? cycleStart;

        return (
          <div key={j} className="space-y-2">
            {j > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <RotateCcw className="w-3 h-3" />
                Re-entered at {startLabel}
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              {qc.result === "pass" ? (
                <Check className="w-4 h-4 text-[var(--status-ok)] shrink-0" />
              ) : (
                <X className="w-4 h-4 text-[var(--status-bad)] shrink-0" />
              )}
              <span className="text-sm font-medium">
                {qc.result === "pass" ? "Passed" : "Failed"}
                {qcAttempts.length > 1 && (
                  <span className="text-muted-foreground font-normal ml-1">
                    (attempt {j + 1}/{qcAttempts.length})
                  </span>
                )}
              </span>
              {qc.inspector && (
                <span className="text-sm text-muted-foreground">by {qc.inspector}</span>
              )}
              {qc.date && (
                <span className="text-xs text-muted-foreground ml-auto tabular-nums">{formatDate(qc.date)}</span>
              )}
            </div>
            {qc.result === "fail" && <QcFailureDetails qc={qc} garment={garment} />}
          </div>
        );
      })}
    </div>
  );
}

function TripCycleBody({
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
  const workers = entry?.worker_history ?? (isCurrent ? (garment.worker_history as Record<string, string> | null) : null) ?? {};
  const plan = isCurrent ? (garment.production_plan as Record<string, string> | null) ?? {} : entry?.production_plan ?? {};
  const reentryStage = entry?.reentry_stage ?? null;
  const qcAttempts = entry?.qc_attempts ?? [];

  const workerEntries = Object.entries(workers as Record<string, string>).filter(([, v]) => !!v);
  const planEntries = Object.entries(plan as Record<string, string>).filter(([, v]) => !!v);
  const showPlanFallback = workerEntries.length === 0 && planEntries.length > 0;
  const teamSource = showPlanFallback ? planEntries : workerEntries;
  const teamCount = teamSource.length;

  const lastQc = qcAttempts.length > 0 ? qcAttempts[qcAttempts.length - 1] : null;
  const failedCount = qcAttempts.filter((a) => a.result === "fail").length;

  // Build one-line summaries
  const teamSummary: React.ReactNode =
    teamCount === 0
      ? <span className="text-muted-foreground italic">no team assigned</span>
      : showPlanFallback
        ? `${teamCount} planned`
        : `${teamCount} assigned`;

  const qcSummary: React.ReactNode =
    !lastQc
      ? <span className="text-muted-foreground italic">not started</span>
      : lastQc.result === "pass"
        ? <>Passed{lastQc.inspector && <span className="text-muted-foreground"> by {lastQc.inspector}</span>}</>
        : <>Failed{failedCount > 1 && <span className="text-muted-foreground"> × {failedCount}</span>}{lastQc.fail_reason && <span className="text-muted-foreground"> — {lastQc.fail_reason}</span>}</>;

  const qcBadge = !lastQc ? null : (
    <span className={cn(
      "text-xs font-medium px-2 py-0.5 rounded-md",
      lastQc.result === "pass"
        ? "bg-[var(--status-ok-bg)] text-[var(--status-ok)]"
        : "bg-[var(--status-bad-bg)] text-[var(--status-bad)]",
    )}>
      {lastQc.result === "pass" ? "Pass" : "Fail"}
    </span>
  );

  const { summary: customerSummary, badge: customerBadge } = buildCustomerSummary(feedback, isCurrent);

  return (
    <div className="space-y-2">
      <SummaryRow
        label="Team"
        summary={teamSummary}
        defaultOpen={false}
        action={
          isCurrent && onEditPlan ? (
            <button
              onClick={onEditPlan}
              className="text-sm font-medium text-primary hover:underline cursor-pointer"
            >
              Edit plan
            </button>
          ) : null
        }
      >
        {teamSource.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {teamSource.map(([key, name]) => (
              <span key={key} className="inline-flex items-center gap-1 text-sm bg-muted px-2 py-1 rounded-md">
                <span className="text-muted-foreground">{WORKER_LABELS[key] ?? key}:</span>
                <span>{name}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm italic text-muted-foreground">No team assigned yet.</p>
        )}
      </SummaryRow>

      <SummaryRow
        label="QC"
        summary={qcSummary}
        badge={qcBadge}
        defaultOpen={!!lastQc && lastQc.result === "fail"}
      >
        {qcAttempts.length > 0 ? (
          <QcAttemptList qcAttempts={qcAttempts} reentryStage={reentryStage} garment={garment} />
        ) : (
          <p className="text-sm italic text-muted-foreground">No quality check yet.</p>
        )}
      </SummaryRow>

      <SummaryRow
        label="Customer"
        summary={customerSummary}
        badge={customerBadge}
        defaultOpen={!!feedback}
      >
        {feedback ? (
          <CustomerFeedbackPanel fb={feedback} compact />
        ) : (
          <p className="text-sm italic text-muted-foreground">
            {isCurrent ? "Customer feedback not yet recorded for this cycle." : "No customer feedback was recorded for this trip."}
          </p>
        )}
      </SummaryRow>
    </div>
  );
}

function buildCustomerSummary(
  fb: GarmentFeedback | null,
  isCurrent: boolean,
): { summary: React.ReactNode; badge: React.ReactNode } {
  if (!fb) {
    return {
      summary: <span className="text-muted-foreground italic">{isCurrent ? "no feedback yet" : "not recorded"}</span>,
      badge: null,
    };
  }
  const action = fb.action ? FEEDBACK_ACTION_STYLE[fb.action] : null;
  const diffs = parseJson<MeasurementDiffRow[]>(fb.measurement_diffs) ?? [];
  const checklist = parseJson<OptionsChecklistRow[]>(fb.options_checklist) ?? [];
  const failedOptions = checklist.filter((c) => c.rejected === true || c.hashwa_rejected === true);

  const parts: string[] = [];
  if (diffs.length > 0) parts.push(`${diffs.length} measurement change${diffs.length !== 1 ? "s" : ""}`);
  if (failedOptions.length > 0) parts.push(`${failedOptions.length} style fix${failedOptions.length !== 1 ? "es" : ""}`);

  const summary = parts.length > 0
    ? parts.join(" · ")
    : fb.notes
      ? <span className="text-muted-foreground">notes only</span>
      : <span className="text-muted-foreground italic">no details</span>;

  const badge = action ? (
    <span className={cn("text-xs font-medium px-2 py-0.5 rounded-md", action.cls)}>
      {action.label}
    </span>
  ) : null;

  return { summary, badge };
}

function TripCycleMeta({
  trip,
  isCurrent,
  reentryStage,
  assignedDate,
  completedDate,
}: {
  trip: number;
  isCurrent: boolean;
  reentryStage: string | null;
  assignedDate: string | null;
  completedDate: string | null;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm font-medium px-2 py-0.5 rounded-md bg-muted text-foreground">
        {tripLabel(trip)}
      </span>
      {isCurrent && (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md bg-foreground text-background">
          <PlayCircle className="w-3 h-3" />
          Current
        </span>
      )}
      {reentryStage && (
        <span className="text-sm text-muted-foreground">
          re-entered at{" "}
          <span className="text-foreground">
            {PIECE_STAGE_LABELS[reentryStage as keyof typeof PIECE_STAGE_LABELS] ?? reentryStage}
          </span>
        </span>
      )}
      <div className="ml-auto text-xs text-muted-foreground tabular-nums">
        <TripDateRange assignedDate={assignedDate} completedDate={completedDate} isCurrent={isCurrent} />
      </div>
    </div>
  );
}

/** "Assigned 5 May · Closed 11 May" / "Assigned 5 May · in progress" / "Assigned 5 May". */
function TripDateRange({
  assignedDate,
  completedDate,
  isCurrent,
}: {
  assignedDate: string | null;
  completedDate: string | null;
  isCurrent: boolean;
}) {
  if (!assignedDate && !completedDate) return null;
  const parts: React.ReactNode[] = [];
  if (assignedDate) parts.push(<span key="a">Assigned {formatDate(assignedDate)}</span>);
  if (completedDate) {
    parts.push(<span key="c">Closed {formatDate(completedDate)}</span>);
  } else if (isCurrent && assignedDate) {
    parts.push(<span key="p" className="text-[var(--status-info)]">in progress</span>);
  }
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="mx-1">·</span>}
          {p}
        </span>
      ))}
    </>
  );
}

// ── Trip Cycle Card (middle column — renders the selected trip) ─

export function TripCycleCard({
  garment,
  tripNum,
  feedback,
  onEditPlan,
  isLoadingFeedback,
}: {
  garment: WorkshopGarment;
  /** Which trip to render. Defaults to the garment's current trip_number. */
  tripNum?: number;
  feedback: GarmentFeedback | null;
  onEditPlan?: () => void;
  isLoadingFeedback?: boolean;
}) {
  const tripEntries = parseTripHistory(garment.trip_history);
  const currentTripNum = garment.trip_number ?? 1;
  const renderTrip = tripNum ?? currentTripNum;
  const entry = tripEntries.find((e) => e.trip === renderTrip) ?? null;
  const isCurrent = renderTrip === currentTripNum && garment.piece_stage !== "completed";

  // Only allow edit-plan on the live current trip (past trips are read-only).
  const editPlan = isCurrent ? onEditPlan : undefined;

  return (
    <div className="bg-card border border-border rounded-md p-4 space-y-3">
      <TripCycleMeta
        trip={renderTrip}
        isCurrent={isCurrent}
        reentryStage={entry?.reentry_stage ?? null}
        assignedDate={entry?.assigned_date ?? (isCurrent ? garment.assigned_date ?? null : null)}
        completedDate={entry?.completed_date ?? null}
      />
      {isLoadingFeedback ? (
        <p className="text-sm italic text-muted-foreground">Loading feedback…</p>
      ) : (
        <TripCycleBody
          entry={entry}
          feedback={feedback}
          isCurrent={isCurrent}
          garment={garment}
          onEditPlan={editPlan}
        />
      )}
    </div>
  );
}

// ── Trip list panel (right column — selectable list of all trips) ─

export function TripListPanel({
  garment,
  feedbackHistory,
  selectedTrip,
  onSelect,
}: {
  garment: WorkshopGarment;
  feedbackHistory: GarmentFeedback[];
  selectedTrip: number;
  onSelect: (trip: number) => void;
}) {
  const tripEntries = parseTripHistory(garment.trip_history);
  const currentTripNum = garment.trip_number ?? 1;

  const feedbackByTrip = new Map<number, GarmentFeedback>();
  for (const fb of feedbackHistory) {
    const k = feedbackTripKey(fb);
    if (!feedbackByTrip.has(k)) feedbackByTrip.set(k, fb);
  }

  const tripNumbers = new Set<number>();
  for (const e of tripEntries) tripNumbers.add(e.trip);
  for (const t of feedbackByTrip.keys()) tripNumbers.add(t);
  tripNumbers.add(currentTripNum);

  const sortedTrips = [...tripNumbers].sort((a, b) => b - a); // newest first

  return (
    <div className="bg-card border border-border rounded-md overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <SectionTitle count={sortedTrips.length}>Trips</SectionTitle>
      </div>
      <ul role="listbox" aria-label="Trip history" className="divide-y divide-border">
        {sortedTrips.map((tripNum) => {
          const entry = tripEntries.find((e) => e.trip === tripNum) ?? null;
          const feedback = feedbackByTrip.get(tripNum) ?? null;
          const isCurrent = tripNum === currentTripNum && garment.piece_stage !== "completed";
          const isSelected = tripNum === selectedTrip;
          const action = feedback?.action ? FEEDBACK_ACTION_STYLE[feedback.action] : null;

          return (
            <li key={tripNum}>
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelect(tripNum)}
                className={cn(
                  "w-full text-left px-4 py-3 transition-colors cursor-pointer",
                  isSelected ? "bg-accent" : "hover:bg-muted/40",
                )}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{tripLabel(tripNum)}</span>
                  {isCurrent && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-md bg-foreground text-background">
                      <PlayCircle className="w-3 h-3" />
                      Current
                    </span>
                  )}
                  {action && (
                    <span className={cn("text-xs font-medium px-2 py-0.5 rounded-md ml-auto", action.cls)}>
                      {action.label}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                  <TripDateRange
                    assignedDate={entry?.assigned_date ?? (isCurrent ? garment.assigned_date ?? null : null)}
                    completedDate={entry?.completed_date ?? null}
                    isCurrent={isCurrent}
                  />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function parseTripHistory(raw: WorkshopGarment["trip_history"]): TripHistoryEntry[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as TripHistoryEntry[]; } catch { return []; }
  }
  return Array.isArray(raw) ? (raw as TripHistoryEntry[]) : [];
}
