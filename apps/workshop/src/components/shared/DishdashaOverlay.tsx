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
  SectionAttachments,
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
  // Cell ids are legacy/positional: the left "chest" cell is Back Chest, the
  // right "halfChest" cell is Front Chest (the old "HALF CHEST" label was the
  // alteration-sheet name for chest_front). Mapping matches the spec pdfOrder
  // (#8 Front Chest, #14 Back Chest).
  chest: "chest_back",
  halfChest: "chest_front",
  waistFront: "waist_front",
  waistBack: "waist_back",
  bottom: "bottom",
  sleeveHem: "sleeve_hemming",
  bottomHem: "bottom_hemming",
};

function fmtThick(v: string | null | undefined): string {
  if (!v) return "-";
  const n = v.trim().toUpperCase();
  if (n === "S" || n === "SINGLE") return "Single";
  if (n === "D" || n === "DOUBLE") return "Double";
  if (n === "T" || n === "TRIPLE") return "Triple";
  if (n === "N" || n === "NO HASHWA") return "No hashwa";
  return sentenceCase(n);
}

/** Domain labels arrive as ALL-CAPS literals; the workshop type rule is
 *  sentence case (acronyms excepted). One place to normalize them. */
function sentenceCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
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
        className="h-14 w-full rounded-md border border-border bg-card object-contain"
      />
    );
  }
  return (
    <div className="h-14 w-full rounded-md border border-border bg-card flex items-center justify-center text-[10px] font-medium text-muted-foreground">
      {sentenceCase(fallback)}
    </div>
  );
}

const VALUE_BOX_INTERACTIVE =
  "cursor-pointer transition-transform duration-100 hover:scale-110 hover:z-10 active:scale-105";

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
    "inline-flex h-14 min-w-[2.75rem] px-1.5 items-center justify-center rounded-md border text-lg font-medium";
  const widthBase =
    "flex items-center justify-center rounded-md border px-1 py-1 text-center text-base font-medium";
  const heightDefault = "border-border bg-card text-foreground";
  const widthDefault = "border-border bg-card text-foreground";
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
              <span className="whitespace-nowrap">{height ?? "-"}</span>
            </HoverValueBox>
          </div>
          {width !== undefined && (
            <div className="w-[7.5rem]">
              <HoverValueBox
                label={widthLabel}
                className={cn(widthBase, widthTintClass || widthDefault)}
              >
                {width ?? "-"}
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

function ThicknessBadge({ value }: { value: string | null | undefined }) {
  return (
    <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
      {fmtThick(value)}
    </span>
  );
}

function AccessoryPill({
  icon,
  label,
  rotate,
}: {
  icon?: string;
  label: string;
  rotate?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium text-foreground">
      {icon && (
        <img src={icon} alt="" className={`h-4 w-auto object-contain ${rotate ? "-rotate-90" : ""}`} />
      )}
      {sentenceCase(label)}
    </span>
  );
}

function StyleSectionAttachments({ attachments }: { attachments?: SectionAttachments }) {
  if (!attachments || (attachments.photos.length === 0 && attachments.voices.length === 0)) {
    return null;
  }
  return (
    <div className="mb-2 rounded-md border border-border bg-card p-1.5 space-y-1.5">
      <div className="text-[10px] font-medium text-muted-foreground">
        Customer reference
      </div>
      {attachments.photos.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {attachments.photos.map((src, i) => (
            <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="block">
              <img
                src={src}
                alt={`Reference ${i + 1}`}
                className="h-12 w-12 rounded-md border border-border object-cover transition-opacity hover:opacity-80"
              />
            </a>
          ))}
        </div>
      )}
      {attachments.voices.length > 0 && (
        <div className="space-y-1">
          {attachments.voices.map((src, i) => (
            <audio key={i} controls src={src} className="h-8 w-full" />
          ))}
        </div>
      )}
    </div>
  );
}

function StyleSection({
  title,
  thickness,
  defects,
  changes,
  attachments,
  children,
}: {
  title: string;
  thickness?: string | null;
  /** QC-fail option defects in this section — rendered as red "QC saw" badges. */
  defects?: Array<{ key: string; label: string; actualText: string }>;
  /** Customer-feedback option changes in this section — sewer's to-do list:
   *  add/remove/change a style. Green=add, red=remove, amber=change. */
  changes?: OptionChange[];
  /** Customer reference photos/voice notes the shop attached to a style in this
   *  section at feedback time — shown next to the style they describe. */
  attachments?: SectionAttachments;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-border pb-1">
        <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>
        {thickness !== undefined && <ThicknessBadge value={thickness} />}
      </div>
      {changes && changes.length > 0 && (
        <div className="mb-2 rounded-md border border-border bg-card p-1.5">
          <div className="text-[10px] font-medium text-muted-foreground mb-1">
            Changes this trip
          </div>
          <div className="flex flex-wrap gap-1">
            {changes.map((c, i) => (
              <span
                key={i}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium",
                  OPTION_CHANGE_KIND_CLASS[c.kind],
                )}
              >
                <span className="font-medium">{OPTION_CHANGE_KIND_SYMBOL[c.kind]}</span>
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
      <StyleSectionAttachments attachments={attachments} />
      {children}
      {defects && defects.length > 0 && (
        <div className="mt-2 rounded-md border border-red-300 bg-red-50 p-1.5">
          <div className="text-[10px] font-medium text-red-700 mb-1">
            QC defect: fix to spec
          </div>
          <div className="flex flex-wrap gap-1">
            {defects.map((d) => (
              <span
                key={d.key}
                className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-card px-2 py-0.5 text-[10px] font-medium text-red-800"
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
        tintClass || "border-border bg-card",
      )}
    >
      <span className={cn(
        "text-[10px] font-medium leading-tight",
        tintClass ? "" : "text-muted-foreground",
      )}>
        {label}
      </span>
      <span className={cn(
        "text-base font-medium tabular-nums leading-tight",
        tintClass ? "" : "text-foreground",
      )}>
        {value ?? "-"}
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
  /** Customer reference photos/voice notes grouped by style section, shown
   *  inside the section they describe (collar refs in Collar, etc.). */
  sectionAttachments?: Map<AlterationStyleSection, SectionAttachments>;
  notes?: string | null;
}

export function DishdashaOverlay({
  garment,
  measurement,
  alterationFilter,
  qcFailActuals,
  qcFailOptionActuals,
  optionChanges,
  sectionAttachments,
  notes,
}: DishdashaOverlayProps) {
  const g = garment as any;
  const m = measurement;
  const degree = m?.degree ? Number(m.degree) : 0;

  const corrections = getMeasurementCorrections(garment.trip_history);

  const sectionChanges = (section: AlterationStyleSection): OptionChange[] =>
    (optionChanges ?? []).filter((c) => c.section === section);
  const metaChanges = (optionChanges ?? []).filter((c) => c.section === "meta");
  const sectionMedia = (section: AlterationStyleSection): SectionAttachments | undefined =>
    sectionAttachments?.get(section);

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
          className="text-red-600 font-medium leading-none"
          style={{ fontSize: "0.7em" }}
          title={`QC measured ${qcActual}`}
        >
          <MeasurementValue raw={qcActual} degree={0} />
        </span>
      </span>
    );
  };

  const styleLabel = sentenceCase(String(g.style ?? "kuwaiti"));
  const lineCount = String(g.lines ?? 1);
  const lineLabel =
    lineCount === "1" ? "Single" : lineCount === "2" ? "Double" : lineCount;
  const frontPocket = g.front_pocket_type
    ? STYLE_IMAGE_MAP[g.front_pocket_type]
    : null;
  const collarType = g.collar_type ? STYLE_IMAGE_MAP[g.collar_type] : null;
  const collarButton = g.collar_button
    ? STYLE_IMAGE_MAP[g.collar_button]
    : null;
  const cuffsEntry = g.cuffs_type ? STYLE_IMAGE_MAP[g.cuffs_type] : null;
  const cuffsType = cuffsEntry?.image ? cuffsEntry : null;

  // Jabzour DB model (mirrors feedback.$orderId.tsx): jabzour_1 = "ZIPPER"
  // → Shaab, a top zipper piece whose MAIN style sits in jabzour_2.
  // jabzour_1 = "BUTTON" → no shaab; the MAIN style is still in jabzour_2
  // ("Button" is just the jabzour_1 designation). Any other jabzour_1 value
  // is a legacy row where jabzour_1 itself holds the style.
  const isShaab = g.jabzour_1 === "ZIPPER";
  const isButtonJabzour = g.jabzour_1 === "BUTTON";
  const jabzourMainKey =
    isShaab || isButtonJabzour ? g.jabzour_2 : g.jabzour_1;
  const jabzourMain = jabzourMainKey
    ? STYLE_IMAGE_MAP[jabzourMainKey]
    : null;
  const shaabImage = isShaab ? STYLE_IMAGE_MAP["JAB_SHAAB"] : null;

  const sidePocket = STYLE_IMAGE_MAP["SID_MUDAWWAR_SIDE_POCKET"];

  const basma = hasBasmaMeasurements(m as unknown as Record<string, unknown> | null);

  return (
    <div
      className="bg-card border border-border rounded-md overflow-hidden text-foreground flex flex-col landscape:flex-row landscape:h-[calc(100vh-180px)] landscape:max-h-[calc(100vh-180px)]"
    >
        {/* Template frame with measurement cells.
            Landscape: height-driven (fits viewport vertically).
            Portrait: width-driven (full width, stacks above panel). */}
        <div
          className="relative shrink-0 border-b landscape:border-b-0 landscape:border-r border-border w-full landscape:w-auto landscape:h-full"
          style={{ aspectRatio: "952.512 / 1122.5601" }}
        >
          <div className="relative w-full h-full">
          <img
            src={templateSvg}
            alt="Measurement template"
            className="absolute inset-0 w-full h-full object-fill"
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
              ? `${fieldLabel}: QC measured ${qcActual}`
              : fieldLabel;
            return (
              <Tooltip key={field.id}>
                <TooltipTrigger asChild>
                  <div
                    className={`absolute flex ${hasQcActual && !isVertical ? "flex-col" : ""} items-center justify-center font-medium leading-none cursor-pointer transition-all duration-100 hover:z-20 hover:scale-125 active:scale-110 ${tintClass}`}
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
                        className="text-red-600 font-medium"
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
              <span className="text-sm text-muted-foreground italic">
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
          <div className="grid grid-cols-3 gap-1.5 p-2 border-b border-border shrink-0">
            {([
              { label: styleLabel, optName: "style" as const },
              { label: `Line ${lineLabel}`, optName: "lines" as const },
              {
                // Type lives in the page header strip — duplicating it here
                // wastes the cell. Fabric is the one thing the worker needs
                // and it appears nowhere else on this page.
                label: g.fabric_name
                  ? `${g.fabric_name}${g.fabric_color ? ` · ${g.fabric_color}` : ""}`
                  : "Outside fabric",
                optName: null,
              },
            ]).map((meta, i) => {
              const change = meta.optName
                ? metaChanges.find((c) => c.label.toLowerCase() === meta.optName)
                : undefined;
              const tone = change ? "border-amber-500 bg-amber-50 text-amber-900" : "border-border bg-card text-foreground";
              return (
                <span
                  key={i}
                  title={meta.label}
                  className={cn(
                    "block truncate rounded-md border px-2 py-1 text-center text-xs font-medium",
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
            <StyleSection title="Front Pocket" thickness={g.front_pocket_thickness} defects={buildSectionDefects(qcFailOptionActuals, "frontPocket")} changes={sectionChanges("frontPocket")} attachments={sectionMedia("frontPocket")}>
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
            <StyleSection title="Jabzour" thickness={g.jabzour_thickness} defects={buildSectionDefects(qcFailOptionActuals, "jabzour")} changes={sectionChanges("jabzour")} attachments={sectionMedia("jabzour")}>
              <MeasureLayout
                image={jabzourMain?.image}
                imageAlt={jabzourMain?.label ?? "Jabzour"}
                imageFallback="JAB"
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
                    {isShaab && (
                      <AccessoryPill
                        icon={shaabImage?.image}
                        label="Zipper"
                      />
                    )}
                    {isButtonJabzour && <AccessoryPill label="Button" />}
                  </>
                }
              />
            </StyleSection>
            )}

            {/* Side Pocket */}
            {(!alterationFilter?.hideUnchanged || alterationFilter.visibleSections.has("sidePocket")) && (
            <StyleSection title="Side Pocket" defects={buildSectionDefects(qcFailOptionActuals, "sidePocket")} changes={sectionChanges("sidePocket")} attachments={sectionMedia("sidePocket")}>
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
            <StyleSection title="Cuffs" thickness={g.cuffs_thickness} defects={buildSectionDefects(qcFailOptionActuals, "cuffs")} changes={sectionChanges("cuffs")} attachments={sectionMedia("cuffs")}>
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
            <StyleSection title="Collar" thickness={g.collar_thickness} defects={buildSectionDefects(qcFailOptionActuals, "collar")} changes={sectionChanges("collar")} attachments={sectionMedia("collar")}>
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
                    {m?.collar_position === "up" ? (
                      <AccessoryPill label="COLLAR UP" />
                    ) : m?.collar_position === "down" ? (
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
              <div className="col-span-2 rounded-md border border-[color:var(--status-warn)]/30 bg-[var(--status-warn-bg)] p-2">
                <h4 className="text-xs font-medium text-[var(--status-warn)] mb-1">
                  Notes
                </h4>
                <p className="text-xs text-foreground whitespace-pre-wrap leading-snug">{notes}</p>
              </div>
            )}
          </div>
        </div>
    </div>
  );
}
