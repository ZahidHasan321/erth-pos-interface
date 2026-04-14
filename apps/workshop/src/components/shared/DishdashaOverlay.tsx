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
import type { AlterationFilter } from "@/lib/alteration-filter";
import { ALTERATION_REASON_CELL_CLASS } from "@/lib/alteration-filter";

// ── Measurement helpers ──────────────────────────────────────────

const FIELD_MAP: Record<QualityTemplateFieldId, keyof Measurement> = {
  collar: "collar_width",
  wk1: "collar_height",
  lengthFront: "length_front",
  lengthBack: "length_back",
  elbow: "elbow",
  shoulder: "shoulder",
  sideUpper: "side_pocket_distance",
  sleeves: "sleeve_length",
  armhole: "armhole",
  width: "sleeve_width",
  sideLower: "side_pocket_opening",
  upperChest: "chest_upper",
  chest: "chest_front",
  halfChest: "chest_back",
  waistFront: "waist_front",
  waistBack: "waist_back",
  bottom: "bottom",
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
        className="h-20 w-full rounded-md border border-zinc-200 bg-white object-contain"
      />
    );
  }
  return (
    <div className="h-20 w-full rounded-md border border-zinc-200 bg-white flex items-center justify-center text-xs font-semibold tracking-wide text-zinc-400 uppercase">
      {fallback}
    </div>
  );
}

function MeasureLayout({
  image,
  imageAlt,
  imageFallback,
  height,
  width,
  accessories,
}: {
  image: string | null | undefined;
  imageAlt: string;
  imageFallback: string;
  height: React.ReactNode;
  width?: React.ReactNode;
  accessories?: React.ReactNode;
}) {
  return (
    <div>
      <div className="grid grid-cols-[6rem_auto] items-start gap-1.5">
        <StyleImage image={image} alt={imageAlt} fallback={imageFallback} />
        <div className="flex items-center justify-start">
          <span className="inline-flex items-center justify-center w-9 h-20 rounded-md border border-zinc-200 bg-white text-base font-semibold text-zinc-700">
            <span className="inline-block rotate-90 whitespace-nowrap">{height ?? "—"}</span>
          </span>
        </div>
      </div>
      {width !== undefined && (
        <div className="mt-1.5 w-24 inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-center text-base font-semibold text-zinc-700">
          {width ?? "—"}
        </div>
      )}
      {accessories && (
        <div className="mt-2 flex flex-wrap justify-end gap-1">{accessories}</div>
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
  children,
}: {
  title: string;
  thickness?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-300 bg-zinc-50 p-2 shadow-sm">
      <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-zinc-200 pb-1">
        <h4 className="text-[11px] font-bold tracking-wide text-zinc-700 uppercase">{title}</h4>
        {thickness !== undefined && <ThicknessBadge value={thickness} />}
      </div>
      {children}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────

interface DishdashaOverlayProps {
  garment: WorkshopGarment;
  measurement: Measurement | null | undefined;
  /** On alterations, narrows the view to only measurements/sections that changed. */
  alterationFilter?: AlterationFilter | null;
  notes?: string | null;
}

export function DishdashaOverlay({
  garment,
  measurement,
  alterationFilter,
  notes,
}: DishdashaOverlayProps) {
  const g = garment as any;
  const m = measurement;
  const degree = m?.degree ? Number(m.degree) : 0;

  // Sidebar style measurements (pocket sizes, jabzour, collar dims) are absolute
  // style dimensions — degree is a body-posture offset that applies only to the
  // main body measurements shown on the SVG template, not to these.
  const measureVal = (key: keyof Measurement) =>
    m ? <MeasurementValue raw={m[key]} degree={0} /> : null;

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

  return (
    <div
      className="bg-white border border-zinc-300 rounded-xl overflow-hidden text-zinc-900 flex"
      style={{ height: "calc(100vh - 180px)", maxHeight: "calc(100vh - 180px)" }}
    >
        {/* Template frame with measurement cells — height-driven so it always fits viewport */}
        <div
          className="relative shrink-0 border-r border-zinc-200 h-full"
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
            if (alterationFilter && !alterationFilter.measurementKeys.has(key as string)) {
              return null;
            }
            const parts = m ? parseMeasurementParts(m[key], degree) : null;
            if (!parts) return null;
            const isVertical =
              "orientation" in field && field.orientation === "vertical";
            const reason = alterationFilter?.fieldReasons.get(key as string);
            const tintClass = reason
              ? ALTERATION_REASON_CELL_CLASS[reason]
              : "bg-white/95 border-zinc-500 text-zinc-900";
            return (
              <div
                key={field.id}
                className={`absolute flex items-center justify-center border-2 font-black leading-none ${tintClass}`}
                style={{
                  left: `${field.left}%`,
                  top: `${field.top}%`,
                  width: `${field.width}%`,
                  height: `${field.height}%`,
                  fontSize: "clamp(14px, 2.8%, 20px)",
                  writingMode: isVertical ? "vertical-rl" : undefined,
                  borderRadius: "1.5px",
                }}
              >
                <MeasurementValue raw={m![key]} degree={degree} />
              </div>
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
          {/* Meta row */}
          <div className="grid grid-cols-3 gap-1.5 p-2 border-b border-zinc-200 shrink-0">
            {[
              styleLabel,
              `LINE ${lineLabel}`,
              (g.garment_type ?? "FINAL").toUpperCase(),
            ].map((v, i) => (
              <span
                key={i}
                className="rounded-lg border border-zinc-800 bg-white px-2 py-1 text-center text-[11px] font-bold tracking-wide text-zinc-900 uppercase"
              >
                {v}
              </span>
            ))}
          </div>

          {/* Sections */}
          <div className="p-2 grid grid-cols-2 gap-2 auto-rows-min">
            {/* Front Pocket */}
            {(!alterationFilter || alterationFilter.visibleSections.has("frontPocket")) && (
            <StyleSection title="Front Pocket" thickness={g.front_pocket_thickness}>
              <MeasureLayout
                image={frontPocket?.image}
                imageAlt={frontPocket?.label ?? "Front pocket"}
                imageFallback="POCKET"
                height={measureVal("top_pocket_length")}
                width={measureVal("top_pocket_width")}
                accessories={
                  g.pen_holder ? (
                    <AccessoryPill icon={ACCESSORY_ICONS.pen} label="PEN" rotate />
                  ) : null
                }
              />
            </StyleSection>
            )}

            {/* Jabzour */}
            {(!alterationFilter || alterationFilter.visibleSections.has("jabzour")) && (
            <StyleSection title="Jabzour" thickness={g.jabzour_thickness}>
              <MeasureLayout
                image={jabzourPrimary?.image}
                imageAlt="Jabzour"
                imageFallback={isShaab ? "JAB SHAAB" : "JAB"}
                height={measureVal("jabzour_length")}
                width={measureVal("jabzour_width")}
                accessories={
                  isShaab ? (
                    <AccessoryPill label="ZIPPER" />
                  ) : null
                }
              />
              {jabzourSecondary?.image && (
                <img
                  src={jabzourSecondary.image}
                  alt=""
                  className="mt-1 h-10 w-[4.5rem] rounded-md border border-zinc-200 bg-white object-contain"
                />
              )}
            </StyleSection>
            )}

            {/* Side Pocket */}
            {(!alterationFilter || alterationFilter.visibleSections.has("sidePocket")) && (
            <StyleSection title="Side Pocket">
              <MeasureLayout
                image={sidePocket?.image}
                imageAlt="Side pocket"
                imageFallback="SIDE"
                height={measureVal("side_pocket_length")}
                width={measureVal("side_pocket_width")}
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
            {(!alterationFilter || alterationFilter.visibleSections.has("cuffs")) && (
            <StyleSection title="Cuffs" thickness={g.cuffs_thickness}>
              <div className="w-24">
                <StyleImage
                  image={cuffsType?.image}
                  alt={cuffsType?.label ?? "Cuffs"}
                  fallback="NO CUFF"
                />
              </div>
            </StyleSection>
            )}

            {/* Collar */}
            {(!alterationFilter || alterationFilter.visibleSections.has("collar")) && (
            <StyleSection title="Collar" thickness={g.collar_thickness}>
              <MeasureLayout
                image={collarType?.image}
                imageAlt={collarType?.label ?? "Collar"}
                imageFallback="COLLAR"
                height={measureVal("collar_height")}
                width={measureVal("collar_width")}
                accessories={
                  (collarButton || g.small_tabaggi) ? (
                    <>
                      {collarButton && (
                        <AccessoryPill icon={collarButton.image ?? undefined} label={collarButton.label} />
                      )}
                      {g.small_tabaggi && (
                        <AccessoryPill icon={ACCESSORY_ICONS.smallTabaggi} label="SMALL TABAGGI" />
                      )}
                    </>
                  ) : null
                }
              />
            </StyleSection>
            )}

            {g.lines && g.lines > 1 ? (
              <div className="col-span-2 flex items-center justify-center py-1.5 rounded-lg border border-zinc-200 text-[11px] font-black uppercase tracking-wide text-zinc-700">
                {g.lines} Lines
              </div>
            ) : null}

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
