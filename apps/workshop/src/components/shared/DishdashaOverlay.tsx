import type React from "react";
import templateSvg from "@/assets/print/template.svg";
import { STYLE_IMAGE_MAP, ACCESSORY_ICONS } from "@/lib/style-images";
import {
  qualityCheckTemplateFields,
  type QualityTemplateFieldId,
} from "../print/quality-check-field-layout";
import { parseMeasurementParts } from "@repo/database";
import type { WorkshopGarment, Measurement } from "@repo/database";
import { MeasurementValue } from "./MeasurementValue";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui/tooltip";
import type {
  AlterationFilter,
  AlterationStyleSection,
  OptionChange,
} from "@/lib/alteration-filter";
import {
  ALTERATION_REASON_CELL_CLASS,
  OPTION_CHANGE_KIND_CLASS,
  OPTION_CHANGE_KIND_SYMBOL,
} from "@/lib/alteration-filter";
import { getMeasurementCorrections, QC_OPTION_TO_SECTION } from "@/lib/qc-corrections";
import { hasBasmaMeasurements, QC_MEASUREMENTS, QC_OPTIONS } from "@/lib/qc-spec";
import { cn } from "@/lib/utils";

const QC_LABEL_BY_KEY: Record<string, string> = Object.fromEntries(
  QC_MEASUREMENTS.map((m) => [m.key, m.label]),
);

function qcLabel(key: keyof Measurement): string | undefined {
  return QC_LABEL_BY_KEY[key as string];
}

// ── Measurement helpers ──────────────────────────────────────────

// Body template field → measurements column. Per PDF, "ARMHOLE FULL" is
// removed from QC; the body's ARMHOLE cell now shows armhole_front (#6 ARMHOLE F).
const FIELD_MAP: Record<QualityTemplateFieldId, keyof Measurement> = {
  collar: "collar_width",
  wk1: "collar_height",
  lengthFront: "length_front",
  lengthBack: "length_back",
  elbow: "elbow",
  shoulder: "shoulder",
  sideUpper: "side_pocket_distance",
  sleeves: "sleeve_length",
  armhole: "armhole_front",
  width: "sleeve_width",
  sideLower: "side_pocket_opening",
  upperChest: "chest_upper",
  chest: "chest_front",
  halfChest: "chest_back",
  waistFront: "waist_front",
  waistBack: "waist_back",
  bottom: "bottom",
  sleeveHem: "sleeve_hemming",
  bottomHem: "bottom_hemming",
};

function fmtThick(v: string | null | undefined): string {
  if (!v) return "—";
  const n = v.trim().toUpperCase();
  if (n === "S" || n === "SINGLE") return "SINGLE";
  if (n === "D" || n === "DOUBLE") return "DOUBLE";
  if (n === "T" || n === "TRIPLE") return "TRIPLE";
  if (n === "N" || n === "NO HASHWA") return "NO HASHWA";
  return n;
}

// ── Shared sub-components ────────────────────────────────────────

function StyleImage({
  image,
  alt,
  fallback,
}: {
  image: string | null | undefined;
  alt: string;
  fallback: string;
}) {
  if (image) {
    return (
      <img
        src={image}
        alt={alt}
        className="h-14 w-full rounded-md border border-zinc-200 bg-white object-contain"
      />
    );
  }
  return (
    <div className="h-14 w-full rounded-md border border-zinc-200 bg-white flex items-center justify-center text-[10px] font-semibold tracking-wide text-zinc-400 uppercase">
      {fallback}
    </div>
  );
}

const VALUE_BOX_INTERACTIVE =
  "cursor-pointer transition-transform duration-100 hover:scale-110 hover:ring-2 hover:ring-blue-400 hover:shadow-md hover:z-10 active:scale-105";

function HoverValueBox({
  label,
  children,
  className,
}: {
  label?: string;
  children: React.ReactNode;
  className: string;
}) {
  const box = <div className={`${className} ${VALUE_BOX_INTERACTIVE}`}>{children}</div>;
  if (!label) return box;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{box}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function MeasureLayout({
  image,
  imageAlt,
  imageFallback,
  height,
  heightLabel,
  heightTintClass,
  width,
  widthLabel,
  widthTintClass,
  extras,
  accessories,
}: {
  image: string | null | undefined;
  imageAlt: string;
  imageFallback: string;
  height: React.ReactNode;
  heightLabel?: string;
  /** Tailwind class string applied to the height value box. Empty = default white. */
  heightTintClass?: string;
  width?: React.ReactNode;
  widthLabel?: string;
  widthTintClass?: string;
  /** Optional secondary measurements stacked on the right side of the section. */
  extras?: React.ReactNode;
  accessories?: React.ReactNode;
}) {
  const heightBase =
    "inline-flex h-14 w-8 items-center justify-center rounded-md border text-base font-semibold";
  const widthBase =
    "flex items-center justify-center rounded-md border px-1 py-1 text-center text-sm font-semibold";
  const heightDefault = "border-zinc-200 bg-white text-zinc-700";
  const widthDefault = "border-zinc-200 bg-white text-zinc-700";
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {/* Left col: image + rotated height, width below */}
        <div className="space-y-1.5 shrink-0">
          <div className="flex items-stretch gap-1.5">
            <div className="w-20 shrink-0">
              <StyleImage image={image} alt={imageAlt} fallback={imageFallback} />
            </div>
            <HoverValueBox
              label={heightLabel}
              className={cn(heightBase, heightTintClass || heightDefault)}
            >
              <span className="inline-block rotate-90 whitespace-nowrap">{height ?? "—"}</span>
            </HoverValueBox>
          </div>
          {width !== undefined && (
            <div className="w-[7.5rem]">
              <HoverValueBox
                label={widthLabel}
                className={cn(widthBase, widthTintClass || widthDefault)}
              >
                {width ?? "—"}
              </HoverValueBox>
            </div>
          )}
        </div>
        {/* Right col: extras stacked vertically */}
        {extras && (
          <div className="flex-1 flex flex-col gap-1.5 min-w-0">{extras}</div>
        )}
      </div>
      {/* Accessories span full section width to avoid clipping when many pills present */}
      {accessories && (
        <div className="flex flex-wrap gap-1">{accessories}</div>
      )}
    </div>
  );
}

const THICKNESS_COLORS: Record<string, string> = {
  SINGLE: "bg-blue-100 border-blue-300 text-blue-800",
  DOUBLE: "bg-emerald-100 border-emerald-300 text-emerald-800",
  TRIPLE: "bg-orange-100 border-orange-300 text-orange-800",
  "NO HASHWA": "bg-zinc-100 border-zinc-300 text-zinc-500",
};

function ThicknessBadge({ value }: { value: string | null | undefined }) {
  const v = fmtThick(value);
  const color = THICKNESS_COLORS[v] ?? "bg-zinc-100 border-zinc-300 text-zinc-700";
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide uppercase ${color}`}>
      {v}
    </span>
  );
}

const PILL_COLORS: Record<string, string> = {
  PEN: "bg-amber-100 border-amber-300 text-amber-800",
  MOBILE: "bg-sky-100 border-sky-300 text-sky-800",
  WALLET: "bg-emerald-100 border-emerald-300 text-emerald-800",
  ZIPPER: "bg-violet-100 border-violet-300 text-violet-800",
  TABBAGI: "bg-rose-100 border-rose-300 text-rose-800",
  "SMALL TABAGGI": "bg-teal-100 border-teal-300 text-teal-800",
  ZARRAR: "bg-indigo-100 border-indigo-300 text-indigo-800",
  "ARAVI ZARRAR": "bg-indigo-100 border-indigo-300 text-indigo-800",
  "ZARRAR + TABBAGI": "bg-fuchsia-100 border-fuchsia-300 text-fuchsia-800",
};

function AccessoryPill({
  icon,
  label,
  rotate,
}: {
  icon?: string;
  label: string;
  rotate?: boolean;
}) {
  const color = PILL_COLORS[label.toUpperCase()] ?? "bg-zinc-100 border-zinc-300 text-zinc-700";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold uppercase ${color}`}>
      {icon && (
        <img src={icon} alt="" className={`h-4 w-auto object-contain ${rotate ? "-rotate-90" : ""}`} />
      )}
      {label}
    </span>
  );
}

function StyleSection({
  title,
  thickness,
  defects,
  changes,
  children,
}: {
  title: string;
  thickness?: string | null;
  /** QC-fail option defects in this section — rendered as red "QC saw" badges. */
  defects?: Array<{ key: string; label: string; actualText: string }>;
  /** Customer-feedback option changes in this section — sewer's to-do list:
   *  add/remove/change a style. Green=add, red=remove, amber=change. */
  changes?: OptionChange[];
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-300 bg-zinc-50 p-2 shadow-sm">
      <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-zinc-200 pb-1">
        <h4 className="text-[11px] font-bold tracking-wide text-zinc-700 uppercase">{title}</h4>
        {thickness !== undefined && <ThicknessBadge value={thickness} />}
      </div>
      {changes && changes.length > 0 && (
        <div className="mb-2 rounded-md border border-zinc-300 bg-white p-1.5">
          <div className="text-[9px] font-black uppercase tracking-wider text-zinc-700 mb-1">
            Changes this trip
          </div>
          <div className="flex flex-wrap gap-1">
            {changes.map((c, i) => (
              <span
                key={i}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold",
                  OPTION_CHANGE_KIND_CLASS[c.kind],
                )}
              >
                <span className="font-black">{OPTION_CHANGE_KIND_SYMBOL[c.kind]}</span>
                {c.kind === "change"
                  ? <>{c.label}: {c.fromText} → {c.toText}</>
                  : c.kind === "hashwa"
                    ? <>{c.label}: {c.toText}</>
                    : <>{c.kind === "add" ? "Add" : "Remove"} {c.label}</>}
              </span>
            ))}
          </div>
        </div>
      )}
      {children}
      {defects && defects.length > 0 && (
        <div className="mt-2 rounded-md border border-red-300 bg-red-50 p-1.5">
          <div className="text-[9px] font-black uppercase tracking-wider text-red-700 mb-1">
            QC defect — fix to spec
          </div>
          <div className="flex flex-wrap gap-1">
            {defects.map((d) => (
              <span
                key={d.key}
                className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-white px-2 py-0.5 text-[10px] font-bold text-red-800"
              >
                <span className="opacity-70">{d.label}:</span> {d.actualText}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const QC_OPTION_LABELS: Record<string, string> = Object.fromEntries(
  QC_OPTIONS.map((o) => [o.key, o.label]),
);

function formatOptionActual(key: string, val: unknown): string {
  if (val == null || val === "") return "missing";
  const spec = QC_OPTIONS.find((o) => o.key === key);
  if (spec?.type === "boolean") return val ? "present" : "missing";
  return String(val);
}

function buildSectionDefects(
  optionActuals: Map<string, unknown> | null | undefined,
  section: AlterationStyleSection,
): Array<{ key: string; label: string; actualText: string }> {
  if (!optionActuals || optionActuals.size === 0) return [];
  const out: Array<{ key: string; label: string; actualText: string }> = [];
  for (const [k, v] of optionActuals) {
    if (QC_OPTION_TO_SECTION[k] !== section) continue;
    out.push({
      key: k,
      label: QC_OPTION_LABELS[k] ?? k,
      actualText: formatOptionActual(k, v),
    });
  }
  return out;
}

// Small label/value row used inside StyleSection for secondary measurements
// (e.g. top pocket distance, 2nd button distance, basma, hems).
function MeasureRow({
  label,
  value,
  tooltip,
  tintClass,
}: {
  label: string;
  value: React.ReactNode;
  tooltip?: string;
  /** Tailwind class for the row's background/border/text — overrides default
   *  white when set (used to tint alteration-changed cells). */
  tintClass?: string;
}) {
  return (
    <HoverValueBox
      label={tooltip}
      className={cn(
        "flex flex-col items-center justify-center rounded-md border px-2 py-1 text-center",
        tintClass || "border-zinc-200 bg-white",
      )}
    >
      <span className={cn(
        "text-[8px] font-bold tracking-wide uppercase leading-tight",
        tintClass ? "" : "text-zinc-500",
      )}>
        {label}
      </span>
      <span className={cn(
        "text-sm font-semibold tabular-nums leading-tight",
        tintClass ? "" : "text-zinc-700",
      )}>
        {value ?? "—"}
      </span>
    </HoverValueBox>
  );
}

// ── Main component ───────────────────────────────────────────────

interface DishdashaOverlayProps {
  garment: WorkshopGarment;
  measurement: Measurement | null | undefined;
  /** On alterations, narrows the view to only measurements/sections that changed. */
  alterationFilter?: AlterationFilter | null;
  /** Operator-recorded values from the last QC fail. Rendered in red beside the
   *  expected value so the worker knows what to correct. */
  qcFailActuals?: Map<string, number> | null;
  /** Operator-recorded option values from the last QC fail. Rendered as red
   *  defect badges inside the relevant style section. */
  qcFailOptionActuals?: Map<string, unknown> | null;
  /** Customer-feedback option changes (add/remove/change/hashwa) the sewer
   *  must apply this trip. Rendered as a per-section banner. */
  optionChanges?: OptionChange[];
  notes?: string | null;
}

export function DishdashaOverlay({
  garment,
  measurement,
  alterationFilter,
  qcFailActuals,
  qcFailOptionActuals,
  optionChanges,
  notes,
}: DishdashaOverlayProps) {
  const g = garment as any;
  const m = measurement;
  const degree = m?.degree ? Number(m.degree) : 0;

  const corrections = getMeasurementCorrections(garment.trip_history);

  const sectionChanges = (section: AlterationStyleSection): OptionChange[] =>
    (optionChanges ?? []).filter((c) => c.section === section);
  const metaChanges = (optionChanges ?? []).filter((c) => c.section === "meta");

  // Sidebar measurement tint priority: QC correction > QC fail actual > alteration reason > default.
  // Mirrors body-template tinting so the sewer sees a consistent visual signal
  // for cells that need work regardless of which surface they're rendered on.
  const tintForKey = (key: string): string => {
    if (corrections.has(key)) return "border-red-500 bg-red-50 text-red-700";
    if (qcFailActuals?.has(key)) return "border-red-500 bg-red-50 text-zinc-900";
    const reason = alterationFilter?.fieldReasons.get(key);
    if (reason) return ALTERATION_REASON_CELL_CLASS[reason];
    return "";
  };

  // Optional measurements should hide entirely when blank (per spec: 2nd Bottom
  // Dist, Basma, Sleeve/Bottom Hem, Pen Pocket — all skip if no value).
  const hasVal = (key: keyof Measurement) => {
    if (!m) return false;
    const v = m[key];
    return v != null && v !== "" && Number(v) > 0;
  };

  // Sidebar style measurements (pocket sizes, jabzour, collar dims) are absolute
  // style dimensions — degree is a body-posture offset that applies only to the
  // main body measurements shown on the SVG template, not to these.
  const measureVal = (key: keyof Measurement) => {
    if (!m) return null;
    const correction = corrections.get(key as string) ?? null;
    const qcActual = qcFailActuals?.get(key as string);
    if (qcActual === undefined) {
      return <MeasurementValue raw={m[key]} degree={0} correction={correction} />;
    }
    return (
      <span className="inline-flex flex-col items-center justify-center gap-0.5">
        <MeasurementValue raw={m[key]} degree={0} correction={correction} />
        <span
          className="text-red-600 font-black leading-none"
          style={{ fontSize: "0.7em" }}
          title={`QC measured ${qcActual}`}
        >
          <MeasurementValue raw={qcActual} degree={0} />
        </span>
      </span>
    );
  };

  const styleLabel = String(g.style ?? "kuwaiti").toUpperCase();
  const lineCount = String(g.lines ?? 1);
  const lineLabel =
    lineCount === "1" ? "SINGLE" : lineCount === "2" ? "DOUBLE" : lineCount;
  const frontPocket = g.front_pocket_type
    ? STYLE_IMAGE_MAP[g.front_pocket_type]
    : null;
  const collarType = g.collar_type ? STYLE_IMAGE_MAP[g.collar_type] : null;
  const collarButton = g.collar_button
    ? STYLE_IMAGE_MAP[g.collar_button]
    : null;
  const cuffsEntry = g.cuffs_type ? STYLE_IMAGE_MAP[g.cuffs_type] : null;
  const cuffsType = cuffsEntry?.image ? cuffsEntry : null;

  const isShaab = g.jabzour_1 === "ZIPPER";
  const jabzourPrimary = isShaab
    ? STYLE_IMAGE_MAP["JAB_SHAAB"]
    : g.jabzour_2
      ? STYLE_IMAGE_MAP[g.jabzour_2]
      : null;
  const jabzourSecondary =
    isShaab && g.jabzour_2 ? STYLE_IMAGE_MAP[g.jabzour_2] : null;

  const sidePocket = STYLE_IMAGE_MAP["SID_MUDAWWAR_SIDE_POCKET"];

  const basma = hasBasmaMeasurements(m as unknown as Record<string, unknown> | null);

  return (
    <div
      className="bg-white border border-zinc-300 rounded-xl overflow-hidden text-zinc-900 flex flex-col landscape:flex-row landscape:h-[calc(100vh-180px)] landscape:max-h-[calc(100vh-180px)]"
    >
        {/* Template frame with measurement cells.
            Landscape: height-driven (fits viewport vertically).
            Portrait: width-driven (full width, stacks above panel). */}
        <div
          className="relative shrink-0 border-b landscape:border-b-0 landscape:border-r border-zinc-200 w-full landscape:w-auto landscape:h-full"
          style={{ aspectRatio: "793.76001 / 1122.5601" }}
        >
          <div className="relative w-full h-full">
          <img
            src={templateSvg}
            alt="Measurement template"
            className="absolute inset-0 w-full h-full object-contain"
          />

          {qualityCheckTemplateFields.map((field) => {
            const key = FIELD_MAP[field.id as QualityTemplateFieldId];
            // Alteration mode (hideUnchanged): hide cells that aren't flagged.
            // measurementKeys covers both feedback alteration diffs AND QC-fail
            // actuals (see buildQcFailContext) — single check suffices.
            if (
              alterationFilter?.hideUnchanged &&
              !alterationFilter.measurementKeys.has(key as string)
            ) {
              return null;
            }
            const correction = corrections.get(key as string) ?? null;
            const qcActual = qcFailActuals?.get(key as string);
            const hasQcActual = qcActual !== undefined;
            const effectiveRaw = correction ? correction.corrected : (m ? m[key] : null);
            const parts = parseMeasurementParts(effectiveRaw, correction ? 0 : degree);
            if (!parts) return null;
            const isVertical =
              "orientation" in field && field.orientation === "vertical";
            const reason = alterationFilter?.fieldReasons.get(key as string);
            const tintClass = correction
              ? "bg-red-50 border border-red-500 text-red-700"
              : hasQcActual
                ? "bg-red-50 border border-red-500 text-zinc-900"
                : reason
                  ? `border ${ALTERATION_REASON_CELL_CLASS[reason]}`
                  : "bg-yellow-100/90 border border-yellow-500 text-zinc-900";
            const fieldLabel = qcLabel(key);
            const cellTitle = hasQcActual && fieldLabel
              ? `${fieldLabel} — QC measured ${qcActual}`
              : fieldLabel;
            return (
              <Tooltip key={field.id}>
                <TooltipTrigger asChild>
                  <div
                    className={`absolute flex ${hasQcActual && !isVertical ? "flex-col" : ""} items-center justify-center font-black leading-none cursor-pointer transition-all duration-100 hover:z-20 hover:scale-125 hover:ring-2 hover:ring-blue-500 hover:shadow-lg active:scale-110 active:ring-blue-700 ${tintClass}`}
                    style={{
                      left: `${field.left}%`,
                      top: `${field.top}%`,
                      width: `${field.width}%`,
                      height: `${field.height}%`,
                      fontSize: "clamp(16px, 2.8%, 22px)",
                      writingMode: isVertical ? "vertical-rl" : undefined,
                      borderRadius: "4px",
                      boxSizing: "content-box",
                      padding: isVertical ? "8px 3px" : "4px 5px",
                      marginLeft: isVertical ? "-3px" : "-5px",
                      marginTop: isVertical ? "-8px" : "-4px",
                    }}
                  >
                    <MeasurementValue
                      raw={m ? m[key] : null}
                      degree={degree}
                      correction={correction}
                    />
                    {hasQcActual && (
                      <span
                        className="text-red-600 font-black"
                        style={{ fontSize: "0.62em", lineHeight: 1 }}
                      >
                        <MeasurementValue raw={qcActual} degree={0} />
                      </span>
                    )}
                  </div>
                </TooltipTrigger>
                {cellTitle && <TooltipContent>{cellTitle}</TooltipContent>}
              </Tooltip>
            );
          })}

          {!m && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm text-zinc-300 italic font-medium">
                No measurements
              </span>
            </div>
          )}
          </div>
        </div>

        {/* Style panel */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto">
          {/* Meta row — tints when the underlying option (style / lines) changed
              this trip, with a small "(changed from X)" hint so the sewer
              doesn't miss a meta-level spec change. */}
          <div className="grid grid-cols-3 gap-1.5 p-2 border-b border-zinc-200 shrink-0">
            {([
              { label: styleLabel, optName: "style" as const },
              { label: `LINE ${lineLabel}`, optName: "lines" as const },
              { label: (g.garment_type ?? "FINAL").toUpperCase(), optName: null },
            ]).map((meta, i) => {
              const change = meta.optName
                ? metaChanges.find((c) => c.label.toLowerCase() === meta.optName)
                : undefined;
              const tone = change ? "border-amber-500 bg-amber-50 text-amber-900" : "border-zinc-800 bg-white text-zinc-900";
              return (
                <span
                  key={i}
                  className={cn(
                    "rounded-lg border px-2 py-1 text-center text-[11px] font-bold tracking-wide uppercase",
                    tone,
                  )}
                >
                  {meta.label}
                  {change && change.kind === "change" && change.fromText && (
                    <span className="ml-1 text-[9px] font-medium opacity-80">
                      (was {change.fromText})
                    </span>
                  )}
                </span>
              );
            })}
          </div>

          {/* Sections */}
          <div className="p-2 grid grid-cols-2 gap-2 auto-rows-min">
            {/* Front Pocket */}
            {(!alterationFilter?.hideUnchanged || alterationFilter.visibleSections.has("frontPocket")) && (
            <StyleSection title="Front Pocket" thickness={g.front_pocket_thickness} defects={buildSectionDefects(qcFailOptionActuals, "frontPocket")} changes={sectionChanges("frontPocket")}>
              <MeasureLayout
                image={frontPocket?.image}
                imageAlt={frontPocket?.label ?? "Front pocket"}
                imageFallback="POCKET"
                height={measureVal("top_pocket_length")}
                heightLabel={qcLabel("top_pocket_length")}
                heightTintClass={tintForKey("top_pocket_length")}
                width={measureVal("top_pocket_width")}
                widthLabel={qcLabel("top_pocket_width")}
                widthTintClass={tintForKey("top_pocket_width")}
                extras={
                  <MeasureRow
                    label="Pocket Dist"
                    value={measureVal("top_pocket_distance")}
                    tooltip={qcLabel("top_pocket_distance")}
                    tintClass={tintForKey("top_pocket_distance")}
                  />
                }
                accessories={
                  g.pen_holder ? (
                    <AccessoryPill icon={ACCESSORY_ICONS.pen} label="PEN" rotate />
                  ) : null
                }
              />
            </StyleSection>
            )}

            {/* Jabzour */}
            {(!alterationFilter?.hideUnchanged || alterationFilter.visibleSections.has("jabzour")) && (
            <StyleSection title="Jabzour" thickness={g.jabzour_thickness} defects={buildSectionDefects(qcFailOptionActuals, "jabzour")} changes={sectionChanges("jabzour")}>
              <MeasureLayout
                image={jabzourPrimary?.image}
                imageAlt="Jabzour"
                imageFallback={isShaab ? "JAB SHAAB" : "JAB"}
                height={measureVal("jabzour_width")}
                heightLabel={qcLabel("jabzour_width")}
                heightTintClass={tintForKey("jabzour_width")}
                width={measureVal("jabzour_length")}
                widthLabel={qcLabel("jabzour_length")}
                widthTintClass={tintForKey("jabzour_length")}
                extras={
                  hasVal("second_button_distance") ? (
                    <MeasureRow
                      label="2nd Bottom Dist"
                      value={measureVal("second_button_distance")}
                      tooltip={qcLabel("second_button_distance")}
                      tintClass={tintForKey("second_button_distance")}
                    />
                  ) : null
                }
                accessories={
                  <>
                    {isShaab && <AccessoryPill label="ZIPPER" />}
                    {jabzourSecondary?.image && (
                      <img
                        src={jabzourSecondary.image}
                        alt=""
                        className="h-8 w-14 rounded-md border border-zinc-200 bg-white object-contain"
                      />
                    )}
                  </>
                }
              />
            </StyleSection>
            )}

            {/* Side Pocket */}
            {(!alterationFilter?.hideUnchanged || alterationFilter.visibleSections.has("sidePocket")) && (
            <StyleSection title="Side Pocket" defects={buildSectionDefects(qcFailOptionActuals, "sidePocket")} changes={sectionChanges("sidePocket")}>
              <MeasureLayout
                image={sidePocket?.image}
                imageAlt="Side pocket"
                imageFallback="SIDE"
                height={measureVal("side_pocket_length")}
                heightLabel={qcLabel("side_pocket_length")}
                heightTintClass={tintForKey("side_pocket_length")}
                width={measureVal("side_pocket_width")}
                widthLabel={qcLabel("side_pocket_width")}
                widthTintClass={tintForKey("side_pocket_width")}
                accessories={
                  (g.wallet_pocket || g.mobile_pocket) ? (
                    <>
                      {g.wallet_pocket && <AccessoryPill icon={ACCESSORY_ICONS.wallet} label="WALLET" />}
                      {g.mobile_pocket && <AccessoryPill icon={ACCESSORY_ICONS.phone} label="MOBILE" />}
                    </>
                  ) : null
                }
              />
            </StyleSection>
            )}

            {/* Cuffs */}
            {(!alterationFilter?.hideUnchanged || alterationFilter.visibleSections.has("cuffs")) && (
            <StyleSection title="Cuffs" thickness={g.cuffs_thickness} defects={buildSectionDefects(qcFailOptionActuals, "cuffs")} changes={sectionChanges("cuffs")}>
              <div className="flex gap-2">
                <div className="w-20 shrink-0">
                  <StyleImage
                    image={cuffsType?.image}
                    alt={cuffsType?.label ?? "Cuffs"}
                    fallback="NO CUFF"
                  />
                </div>
                {basma && (hasVal("basma_length") || hasVal("basma_width")) && (
                  <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                    {hasVal("basma_length") && (
                      <MeasureRow
                        label="Basma L"
                        value={measureVal("basma_length")}
                        tooltip={qcLabel("basma_length")}
                        tintClass={tintForKey("basma_length")}
                      />
                    )}
                    {hasVal("basma_width") && (
                      <MeasureRow
                        label="Basma W"
                        value={measureVal("basma_width")}
                        tooltip={qcLabel("basma_width")}
                        tintClass={tintForKey("basma_width")}
                      />
                    )}
                  </div>
                )}
              </div>
            </StyleSection>
            )}

            {/* Collar */}
            {(!alterationFilter?.hideUnchanged || alterationFilter.visibleSections.has("collar")) && (
            <StyleSection title="Collar" thickness={g.collar_thickness} defects={buildSectionDefects(qcFailOptionActuals, "collar")} changes={sectionChanges("collar")}>
              <MeasureLayout
                image={collarType?.image}
                imageAlt={collarType?.label ?? "Collar"}
                imageFallback="COLLAR"
                height={measureVal("collar_height")}
                heightLabel={qcLabel("collar_height")}
                heightTintClass={tintForKey("collar_height")}
                width={measureVal("collar_width")}
                widthLabel={qcLabel("collar_width")}
                widthTintClass={tintForKey("collar_width")}
                accessories={
                  <>
                    {collarButton && (
                      <AccessoryPill icon={collarButton.image ?? undefined} label={collarButton.label} />
                    )}
                    {g.small_tabaggi && (
                      <AccessoryPill icon={ACCESSORY_ICONS.smallTabaggi} label="SMALL TABAGGI" />
                    )}
                    {g.collar_position === "up" ? (
                      <AccessoryPill label="COLLAR UP" />
                    ) : g.collar_position === "down" ? (
                      <AccessoryPill label="COLLAR DOWN" />
                    ) : (
                      <AccessoryPill label="COLLAR STANDARD" />
                    )}
                  </>
                }
              />
            </StyleSection>
            )}

            {notes && (
              <div className="col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
                <h4 className="text-[11px] font-bold tracking-wide text-amber-700 uppercase mb-1">
                  Notes
                </h4>
                <p className="text-xs text-amber-900 whitespace-pre-wrap leading-snug">{notes}</p>
              </div>
            )}
          </div>
        </div>
    </div>
  );
}
