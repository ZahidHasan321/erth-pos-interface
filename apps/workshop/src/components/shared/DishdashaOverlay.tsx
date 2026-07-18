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
import { OPTION_CHANGE_KIND_SYMBOL } from "@/lib/alteration-filter";
import {
  collarTypes,
  collarButtons,
  cuffTypes,
  jabzourTypes,
  topPocketTypes,
} from "@/components/forms/add-garment/constants";
import { SHOULDER_SLOPE_UI } from "@repo/ui/shoulder-slope";
import { getMeasurementCorrections, QC_OPTION_TO_SECTION } from "@/lib/qc-corrections";
import {
  hasBasmaMeasurements,
  QC_MEASUREMENTS,
  QC_OPTIONS,
  QC_QUALITY,
  QC_QUALITY_THRESHOLD,
} from "@/lib/qc-spec";
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
  rotate,
}: {
  image: string | null | undefined;
  alt: string;
  fallback: string;
  /** Rotate the artwork 90 clockwise (open side on top). Uses a square box so
   * object-contain refits the rotated image without overflowing. */
  rotate?: boolean;
}) {
  if (image) {
    return (
      <img
        src={image}
        alt={alt}
        className={cn(
          "h-14 rounded-md border border-border bg-card object-contain",
          rotate ? "w-14 mx-auto rotate-90" : "w-full",
        )}
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
  rotateImage,
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
  rotateImage?: boolean;
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
      {/* Portrait columns are narrow, so extras drop BELOW the image instead of
          into a side column (a side column would make the strip tall). */}
      <div className="flex gap-2">
        {/* Left col: image + rotated height, width below */}
        <div className="space-y-1.5 shrink-0">
          <div className="flex items-stretch gap-1.5">
            <div className="w-20 shrink-0">
              <StyleImage image={image} alt={imageAlt} fallback={imageFallback} rotate={rotateImage} />
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
        {/* Right col: extras stacked vertically. Portrait flows them two-up so a
            section with several extras (front pocket) doesn't drive the strip tall. */}
        {extras && (
          <div className="flex-1 flex flex-col gap-1.5 min-w-0">
            {extras}
          </div>
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
    <span className="shrink-0 rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
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
  /** QC-fail option defects in this section: the spec value, then what QC found. */
  defects?: Array<{ key: string; label: string; expectedText: string; actualText: string }>;
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
        <h4 className="text-xs font-medium text-muted-foreground leading-tight">{title}</h4>
        {thickness !== undefined && <ThicknessBadge value={thickness} />}
      </div>
      <StyleSectionAttachments attachments={attachments} />
      {children}
      {/* Both callouts sit below the part they describe, in the same box, with
          the same chip shape — a QC defect and a customer change are the same
          kind of statement ("build this, not that") and should read alike. */}
      {changes && changes.length > 0 && (
        <SectionCallout title="Change this trip">
          {changes.map((c, i) => (
            <FlagChip
              key={i}
              label={[
                OPTION_CHANGE_KIND_SYMBOL[c.kind],
                c.kind === "add" ? "Add" : c.kind === "remove" ? "Remove" : "",
                c.label,
              ]
                .filter(Boolean)
                .join(" ")}
              // add/remove is an instruction, not a value pair - the label says
              // it all, so the value slot stays empty rather than echoing it.
              value={c.kind === "add" || c.kind === "remove" ? null : c.toText}
              wrong={c.kind === "change" ? c.fromText : null}
            />
          ))}
        </SectionCallout>
      )}
      {defects && defects.length > 0 && (
        <SectionCallout title="QC found">
          {defects.map((d) => (
            <FlagChip
              key={d.key}
              label={d.label}
              value={d.expectedText}
              wrong={d.actualText}
            />
          ))}
        </SectionCallout>
      )}
    </div>
  );
}

/** One box for anything a section needs fixing for, whatever raised it. */
function SectionCallout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-2 rounded-md border border-border bg-card p-1.5">
      <div className="text-[10px] font-medium text-muted-foreground mb-1">{title}</div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

/** One chip shape for every flagged option: what to build, then in red what
 *  not to. Mirrors the measurement cells so the page speaks once. */
function FlagChip({
  label,
  value,
  wrong,
}: {
  label: string;
  value?: React.ReactNode;
  wrong?: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium",
        FLAGGED_TINT,
      )}
    >
      <span className="opacity-70">
        {label}
        {(value != null || wrong != null) && ":"}
      </span>
      {value}
      {wrong != null && wrong !== "" && <WrongMark scale={1}>{wrong}</WrongMark>}
    </span>
  );
}

const QC_OPTION_LABELS: Record<string, string> = Object.fromEntries(
  QC_OPTIONS.map((o) => [o.key, o.label]),
);

const QC_QUALITY_LABELS: Record<string, string> = Object.fromEntries(
  QC_QUALITY.map((q) => [q.key, q.label]),
);

/** Marks a cell as needing work, in every case alike. Deliberately not red:
 *  red is reserved for the wrong value printed inside the cell. */
export const FLAGGED_TINT = "border-sky-600 bg-sky-50 text-zinc-900";

/** Shoulder slope as a short label, reusing the single source of truth in
 *  @repo/ui so this page can't drift from the QC form and measurement grid. */
function formatSlopeLabel(value: unknown): string {
  if (value == null || value === "") return "-";
  return SHOULDER_SLOPE_UI.find((o) => o.value === value)?.label ?? String(value);
}

/** The one way this UI says "not this": red, struck through, sitting with the
 *  plain value that IS correct. Used for measurements, options, lines — every
 *  wrong value on the page renders through here so they all read alike. */
function WrongMark({
  children,
  scale = 0.7,
}: {
  children: React.ReactNode;
  scale?: number;
}) {
  return (
    <span
      className="text-red-600 font-medium leading-none line-through decoration-red-600/50"
      style={{ fontSize: `${scale}em` }}
    >
      {children}
    </span>
  );
}

/** Measurement-shaped wrong value (parses fractions/degrees). */
function WrongValue({ raw, scale = 0.7 }: { raw: unknown; scale?: number }) {
  return (
    <WrongMark scale={scale}>
      <MeasurementValue raw={raw} degree={0} />
    </WrongMark>
  );
}

/** Style values are stored as catalog codes (COL_TABBAGI); the worker reads the
 *  display name (Tabbagi). One lookup across every option list so a defect chip
 *  never leaks a raw enum. */
const STYLE_VALUE_LABELS: Record<string, string> = Object.fromEntries(
  [...collarTypes, ...collarButtons, ...cuffTypes, ...jabzourTypes, ...topPocketTypes].map(
    (o) => [o.value, o.displayText],
  ),
);

function formatOptionActual(key: string, val: unknown): string {
  if (val == null || val === "") return "missing";
  const spec = QC_OPTIONS.find((o) => o.key === key);
  if (spec?.type === "boolean") return val ? "present" : "missing";
  const raw = String(val);
  return STYLE_VALUE_LABELS[raw] ?? fmtThick(raw);
}

function buildSectionDefects(
  optionActuals: Map<string, unknown> | null | undefined,
  section: AlterationStyleSection,
  /** Garment row — carries the spec value each defect should be corrected to.
   *  Without it the chip could only say what was wrong, never what is right. */
  spec: Record<string, unknown>,
): Array<{ key: string; label: string; expectedText: string; actualText: string }> {
  if (!optionActuals || optionActuals.size === 0) return [];
  const out: Array<{ key: string; label: string; expectedText: string; actualText: string }> = [];
  for (const [k, v] of optionActuals) {
    if (QC_OPTION_TO_SECTION[k] !== section) continue;
    out.push({
      key: k,
      label: QC_OPTION_LABELS[k] ?? k,
      expectedText: formatOptionActual(k, spec[k]),
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
  /** QC fails on options that belong to no style section (lines, shoulder_slope).
   *  Rendered in the meta strip — without this they have nowhere to appear and
   *  the fail reads as an empty overlay. */
  qcFailMetaActuals?: Map<string, unknown> | null;
  /** Workmanship aspects rated below the QC threshold, with the score. These
   *  have no spec value to sit beside, so they get their own panel. */
  qcFailQuality?: Map<string, number> | null;
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
  qcFailMetaActuals,
  qcFailQuality,
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

  // One error language across every case (QC fail, feedback alteration,
  // alteration-out): RED is the value that is wrong — the reading QC took, or
  // the number this cell supersedes. The plain value is always what to build.
  // Cause never rides on colour; it is stated in words in the tooltip and the
  // legend, because red was already spoken for by the wrong value.
  const wrongValueFor = (key: string): unknown => {
    const wrong =
      qcFailActuals?.get(key) ??
      alterationFilter?.fieldPrevious?.get(key) ??
      // A QC pass that recorded a correction supersedes the original reading.
      corrections.get(key)?.original ??
      undefined;
    if (wrong === undefined || wrong === null || wrong === "") return undefined;
    // Never print the same number twice. If the "wrong" value matches what the
    // spec now says, nothing was superseded and the red line would be a lie.
    const current = m?.[key as keyof Measurement];
    if (current != null && Number(current) === Number(wrong)) return undefined;
    return wrong;
  };

  // A field needs work when something flagged it, whether or not a superseded
  // value exists — a reason-only feedback flag (SPEC §2.5) has no number to
  // show in red but still has to be re-checked.
  const isFlagged = (key: string): boolean =>
    corrections.has(key) ||
    !!qcFailActuals?.has(key) ||
    !!alterationFilter?.measurementKeys.has(key);

  /** Cause in words for a flagged field. Per-field reason wins, else the
   *  filter-wide label ("QC found" / "Customer request"). */
  const causeFor = (key: string): string | null =>
    alterationFilter?.fieldReasons.get(key) ??
    alterationFilter?.causeLabel ??
    (corrections.has(key) ? "Workshop Error" : null);

  const titleFor = (key: string): string | undefined => {
    const label = qcLabel(key as keyof Measurement);
    if (!isFlagged(key)) return label || undefined;
    const cause = causeFor(key);
    const wrong = wrongValueFor(key);
    const tail = wrong !== undefined ? `not ${wrong}` : "re-check";
    return [label, cause, tail].filter(Boolean).join(" - ");
  };

  const tintForKey = (key: string): string =>
    isFlagged(key) ? FLAGGED_TINT : "";

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
    const wrong = wrongValueFor(key as string);
    if (wrong === undefined) {
      return <MeasurementValue raw={m[key]} degree={0} correction={correction} />;
    }
    return (
      <span className="inline-flex flex-col items-center justify-center gap-0.5">
        <MeasurementValue raw={m[key]} degree={0} correction={correction} />
        <WrongValue raw={wrong} />
      </span>
    );
  };

  const styleLabel = sentenceCase(String(g.style ?? "kuwaiti"));
  // Lines read as a number on the floor ("line 1" / "line 2"), not Single/Double,
  // and each carries its own colour so the sewer can spot it at a glance.
  // Neither colour may be red: a correct Line 2 is not an error, and red on
  // this page means exactly one thing.
  const lineCount = String(g.lines ?? 1);
  const lineTone =
    lineCount === "1"
      ? "border-blue-500 bg-blue-50 text-blue-800"
      : lineCount === "2"
        ? "border-violet-500 bg-violet-50 text-violet-800"
        : null;

  // Meta cells are spec values like any other, so a narrowed view shows them
  // only when flagged — an untouched "Line 1" must not compete with the thing
  // that actually needs work. Fabric is the exception: it identifies the cloth
  // rather than asserting a spec, and appears nowhere else on the page.
  const narrowed = !!alterationFilter?.hideUnchanged;
  const metaChangeFor = (name: string) =>
    metaChanges.find((c) => c.label.toLowerCase() === name);

  type MetaCell = {
    key: string;
    label: string;
    title: string;
    tone?: string | null;
    flagged: boolean;
    wrong?: string | null;
  };
  const rawMetaCells: MetaCell[] = [];
  /** Same rule the measurement cells follow: a "wrong" value identical to the
   *  one being built supersedes nothing, so it must not be drawn. */
  const metaCells = (): MetaCell[] =>
    rawMetaCells.map((c) => (c.wrong === c.label ? { ...c, wrong: null } : c));

  const styleChange = metaChangeFor("style");
  if (!narrowed || styleChange) {
    rawMetaCells.push({
      key: "style",
      label: styleLabel,
      title: styleChange?.fromText
        ? `Style - changed, not ${styleChange.fromText}`
        : `Style: ${styleLabel}`,
      flagged: !!styleChange,
      wrong: styleChange?.fromText ?? null,
    });
  }

  const linesChange = metaChangeFor("lines");
  const linesQc = qcFailMetaActuals?.get("lines");
  const linesFlagged = !!linesChange || linesQc !== undefined;
  if (!narrowed || linesFlagged) {
    rawMetaCells.push({
      key: "lines",
      label: `Line ${lineCount}`,
      title: linesQc !== undefined
        ? `Lines - QC found ${linesQc}`
        : linesChange?.fromText
          ? `Lines - changed, not ${linesChange.fromText}`
          : `Lines: ${lineCount}`,
      tone: lineTone,
      flagged: linesFlagged,
      wrong:
        linesQc !== undefined
          ? `Line ${linesQc}`
          : linesChange?.fromText
            ? `Line ${linesChange.fromText}`
            : null,
    });
  }

  // Shoulder slope lives on the measurement and has no cell of its own; it only
  // needs a home when QC failed it, which previously rendered nowhere at all.
  const slopeQc = qcFailMetaActuals?.get("shoulder_slope");
  if (slopeQc !== undefined) {
    rawMetaCells.push({
      key: "shoulder_slope",
      label: `Slope: ${formatSlopeLabel(m?.shoulder_slope)}`,
      title: `Shoulder Slope - QC found ${formatSlopeLabel(slopeQc)}`,
      flagged: true,
      wrong: formatSlopeLabel(slopeQc),
    });
  }

  const fabricLabel = g.fabric_name
    ? `${g.fabric_name}${g.fabric_color ? ` · ${g.fabric_color}` : ""}`
    : "Outside fabric";
  rawMetaCells.push({
    key: "fabric",
    label: fabricLabel,
    title: fabricLabel,
    flagged: false,
  });
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
      // Pinned to the viewport in both orientations so the terminal never
      // scrolls the page - the style panel scrolls inside itself instead.
      // (Sizing to content in portrait was worse: the five stacked sections
      // became the tallest thing on screen and pushed the card past the
      // viewport, clipping the last one.)
      className="bg-card border border-border rounded-md overflow-hidden text-foreground flex flex-row h-[calc(100dvh-205px)] max-h-[calc(100dvh-205px)]"
    >
      {/* Diagram column. Side by side in BOTH orientations: on an Android
          tablet held portrait, stacking the style sections under the frame
          squeezed them into a five-across strip nothing could be read in.
          The frame fits whichever axis runs out first (height in landscape,
          width in portrait) via aspect-ratio + max-w-full. */}
      <div className="flex-1 min-w-0 flex flex-col border-r border-border">
        {/* Notes sit above the diagram, at the top of the reading column, so a
            standing instruction is seen before the numbers rather than after
            five style boxes. */}
        {notes && (
          <div className="shrink-0 border-b border-[color:var(--status-warn)]/30 bg-[var(--status-warn-bg)] px-3 py-2">
            <h4 className="text-xs font-medium text-[var(--status-warn)] mb-0.5">Notes</h4>
            <p className="text-sm text-foreground whitespace-pre-wrap leading-snug line-clamp-2">
              {notes}
            </p>
          </div>
        )}

        {/* Clip only in portrait, where the frame deliberately overshoots the
            column. Landscape fits exactly, so clipping there would only ever
            hide a grown bottom cell. */}
        <div className="flex-1 min-h-0 flex items-center justify-center p-1.5 portrait:overflow-hidden">
        {/* The frame must stay EXACTLY on aspect: the measurement cells are
            positioned in percentages of this box, while the template SVG keeps
            its own preserveAspectRatio. Let the box distort and the artwork
            letterboxes inside it while the cells do not - numbers drift off the
            garment. So drive it from whichever axis is scarce (width in
            portrait, height in landscape) and never clamp the other. */}
        {/* Portrait is width-bound, so a plain fit leaves a tall empty band
            above and below the garment. The template carries ~25% dead margin
            on each side (cells span 18.8%-74.9% across but 8.6%-97.6% down),
            so overshooting the column width spends that margin on the garment
            instead of the gap. 1.35x keeps the artwork clear of both edges;
            the wrapper clips only empty template margin. */}
        <div
          // shrink-0 matters: as a flex item it would otherwise shrink straight
          // back to the container width and the overshoot would do nothing.
          className="relative w-[135%] shrink-0 landscape:w-auto landscape:h-full"
          style={{ aspectRatio: "952.512 / 1122.5601" }}
        >
          {/* Container query root: cell font size scales with the frame's WIDTH
              via cqw. (It used to be `clamp(16px, 2.8%, 22px)` — but a % in
              font-size resolves against the parent's font-size, not the width,
              so it silently pinned every cell to the 16px floor.) */}
          <div
            className="relative w-full h-full"
            style={{ containerType: "inline-size" }}
          >
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
            const wrong = wrongValueFor(key as string);
            const hasWrong = wrong !== undefined;
            const effectiveRaw = correction ? correction.corrected : (m ? m[key] : null);
            const parts = parseMeasurementParts(effectiveRaw, correction ? 0 : degree);
            if (!parts) return null;
            const isVertical =
              "orientation" in field && field.orientation === "vertical";
            const tintClass = isFlagged(key as string)
              ? `border ${FLAGGED_TINT}`
              : "bg-yellow-100/90 border border-yellow-500 text-zinc-900";
            const cellTitle = titleFor(key as string);
            return (
              <Tooltip key={field.id}>
                <TooltipTrigger asChild>
                  <div
                    className={`absolute flex ${hasWrong && !isVertical ? "flex-col" : ""} items-center justify-center font-medium leading-none cursor-pointer transition-all duration-100 hover:z-20 hover:scale-125 active:scale-110 ${tintClass}`}
                    style={{
                      left: `${field.left}%`,
                      top: `${field.top}%`,
                      width: `${field.width}%`,
                      // The template pins a cell's size, but a flagged cell
                      // carries a second line (the red superseded value) that
                      // does not fit - measured at 6-13px of overflow on EVERY
                      // flagged cell, spilling onto the artwork. Only those
                      // cells get to grow: applying a floor to all of them
                      // pushes the two collar cells into each other, because
                      // the template heights sit just under the single-line
                      // content to begin with.
                      ...(hasWrong
                        ? { minHeight: `${field.height}%` }
                        : { height: `${field.height}%` }),
                      fontSize: "clamp(19px, 4cqw, 30px)",
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
                    {hasWrong && <WrongValue raw={wrong} scale={0.5} />}
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
        </div>
      </div>

      {/* Style panel: a scrollable column beside the frame in both
          orientations. Portrait gets a narrower fixed share and stacks the
          sections one per row, which is what makes them legible. */}
        <div className="w-[46%] portrait:w-[34%] max-w-[560px] shrink-0 flex flex-col min-w-0 min-h-0 overflow-y-auto">
          {/* Meta row. Style and Line are spec values like any other: in a
              narrowed view they appear only when flagged, so an untouched
              "Line 1" stops competing with the thing that actually needs work.
              Fabric always shows — it identifies the cloth, it is not a check. */}
          {/* Wraps rather than forcing three columns: in a narrow portrait
              panel a fixed third truncated every chip to "Fabric ...". */}
          <div className="flex flex-wrap gap-1.5 p-2 border-b border-border shrink-0">
            {metaCells().map((meta) => (
              <span
                key={meta.key}
                title={meta.title}
                className={cn(
                  "grow basis-[8rem] portrait:basis-full truncate rounded-md border px-2 py-1 text-center text-sm font-medium",
                  meta.flagged ? FLAGGED_TINT : (meta.tone ?? "border-border bg-card text-foreground"),
                )}
              >
                {meta.label}
                {meta.wrong != null && (
                  <span className="ml-1">
                    <WrongMark scale={0.85}>{meta.wrong}</WrongMark>
                  </span>
                )}
              </span>
            ))}
          </div>

          {/* Sections. Portrait lays all five across one row so the panel stays
              a short strip; landscape keeps the roomier 2-up column. */}
          {/* One section per row in portrait: a tablet held upright has the
              height for it, and five across was unreadable. */}
          <div className="p-2 grid grid-cols-2 gap-2 auto-rows-min portrait:grid-cols-1">
            {/* Front Pocket */}
            {(!alterationFilter?.hideUnchanged || alterationFilter.visibleSections.has("frontPocket")) && (
            <StyleSection title="Front Pocket" thickness={g.front_pocket_thickness} defects={buildSectionDefects(qcFailOptionActuals, "frontPocket", g)} changes={sectionChanges("frontPocket")} attachments={sectionMedia("frontPocket")}>
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
                  <>
                    <MeasureRow
                      label="Pocket Dist"
                      value={measureVal("top_pocket_distance")}
                      tooltip={qcLabel("top_pocket_distance")}
                      tintClass={tintForKey("top_pocket_distance")}
                    />
                    {hasVal("pen_pocket_length") && (
                      <MeasureRow
                        label="Pen Pocket L"
                        value={measureVal("pen_pocket_length")}
                        tooltip={qcLabel("pen_pocket_length")}
                        tintClass={tintForKey("pen_pocket_length")}
                      />
                    )}
                    {hasVal("pen_pocket_width") && (
                      <MeasureRow
                        label="Pen Pocket W"
                        value={measureVal("pen_pocket_width")}
                        tooltip={qcLabel("pen_pocket_width")}
                        tintClass={tintForKey("pen_pocket_width")}
                      />
                    )}
                  </>
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
            <StyleSection title="Jabzour" thickness={g.jabzour_thickness} defects={buildSectionDefects(qcFailOptionActuals, "jabzour", g)} changes={sectionChanges("jabzour")} attachments={sectionMedia("jabzour")}>
              <MeasureLayout
                image={jabzourMain?.image}
                imageAlt={jabzourMain?.label ?? "Jabzour"}
                imageFallback="JAB"
                rotateImage
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
            <StyleSection title="Side Pocket" defects={buildSectionDefects(qcFailOptionActuals, "sidePocket", g)} changes={sectionChanges("sidePocket")} attachments={sectionMedia("sidePocket")}>
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
            <StyleSection title="Cuffs" thickness={g.cuffs_thickness} defects={buildSectionDefects(qcFailOptionActuals, "cuffs", g)} changes={sectionChanges("cuffs")} attachments={sectionMedia("cuffs")}>
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
            <StyleSection title="Collar" thickness={g.collar_thickness} defects={buildSectionDefects(qcFailOptionActuals, "collar", g)} changes={sectionChanges("collar")} attachments={sectionMedia("collar")}>
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

            {/* Workmanship fails have no spec cell to sit beside - they are a
                score, not a value - so they get their own panel. Without it a
                quality-only QC fail rendered a completely blank overlay. */}
            {qcFailQuality && qcFailQuality.size > 0 && (
              <div className="col-span-2">
                <SectionCallout title="QC found: workmanship below standard">
                  {[...qcFailQuality].map(([key, score]) => (
                    <FlagChip
                      key={key}
                      label={QC_QUALITY_LABELS[key] ?? key}
                      value={`needs ${QC_QUALITY_THRESHOLD}/5`}
                      wrong={`${score}/5`}
                    />
                  ))}
                </SectionCallout>
              </div>
            )}

          </div>
        </div>
    </div>
  );
}
