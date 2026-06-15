import type React from "react";
import templateSvg from "@/assets/print/template.svg";
import erthLogo from "@/assets/erth-dark.svg";
import sakkbaLogo from "@/assets/sakkba.svg";
import { ACCESSORY_ICONS, STYLE_IMAGE_MAP } from "@/lib/style-images";
import { parseMeasurementParts } from "@repo/database";
import type { Measurement, WorkshopGarment } from "@repo/database";
import type { AlterationFilter } from "@/lib/alteration-filter";
import { MeasurementValue } from "@/components/shared/MeasurementValue";
import { PIECE_STAGE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { getMeasurementCorrections } from "@/lib/qc-corrections";
import { hasBasmaMeasurements } from "@/lib/qc-spec";

const BRAND_LOGOS: Record<string, string> = {
  ERTH: erthLogo,
  SAKKBA: sakkbaLogo,
};
import {
  qualityCheckTemplateFields,
  type QualityTemplateFieldId,
} from "./quality-check-field-layout";

const FIELD_MEASUREMENT_MAP: Record<QualityTemplateFieldId, keyof Measurement> =
  {
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

const EMPTY_VALUE = "-";


function formatThickness(value: string | null | undefined): string {
  if (!value) return EMPTY_VALUE;

  const normalized = String(value).trim().toUpperCase();

  if (normalized === "S" || normalized === "SINGLE") return "SINGLE";
  if (normalized === "D" || normalized === "DOUBLE") return "DOUBLE";
  if (normalized === "T" || normalized === "TRIPLE") return "TRIPLE";
  if (normalized === "N" || normalized === "NO HASHWA") return "NO HASHWA";

  return normalized;
}

function optionFor(key: string | null | undefined) {
  if (!key) return null;
  return STYLE_IMAGE_MAP[key] ?? null;
}

function StyleImageCell({
  image,
  alt,
  fallback,
}: {
  image: string | null | undefined;
  alt: string;
  fallback: string;
}) {
  if (image) {
    return <img src={image} alt={alt} className="terminal-qc-style-image" />;
  }
  return <div className="terminal-qc-style-placeholder">{fallback}</div>;
}

function ExtraRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="terminal-qc-extra-row">
      <span className="terminal-qc-extra-row-label">{label}</span>
      <span className="terminal-qc-extra-row-value">{value ?? EMPTY_VALUE}</span>
    </div>
  );
}

function MeasureLayout({
  image,
  imageAlt,
  imageFallback,
  height,
  width,
  extras,
  accessories,
}: {
  image: string | null | undefined;
  imageAlt: string;
  imageFallback: string;
  height: React.ReactNode;
  width?: React.ReactNode;
  extras?: React.ReactNode;
  accessories?: React.ReactNode;
}) {
  return (
    <div className="terminal-qc-measure-layout">
      <div className="terminal-qc-measure-row">
        <StyleImageCell image={image} alt={imageAlt} fallback={imageFallback} />
        <span className="terminal-qc-height-box">
          <span className="terminal-qc-height-box-text">{height ?? EMPTY_VALUE}</span>
        </span>
      </div>
      {width !== undefined && (
        <div className="terminal-qc-width-box">{width ?? EMPTY_VALUE}</div>
      )}
      {extras && (
        <div className="terminal-qc-extras-row">{extras}</div>
      )}
      {accessories && (
        <div className="terminal-qc-accessories-row">{accessories}</div>
      )}
    </div>
  );
}

function ThicknessBadge({ value }: { value: string | null | undefined }) {
  return <span className="terminal-qc-thickness-badge">{formatThickness(value)}</span>;
}

export function TerminalQualityTemplatePrint({
  garment,
  alterationFilter,
  measurement: measurementProp,
  qcFailActuals,
  qcFailOptionActuals: _qcFailOptionActuals,
  optionChanges: _optionChanges,
}: {
  garment: WorkshopGarment;
  alterationFilter?: AlterationFilter | null;
  /** Optional measurement override — used by alt-out garments where
   *  `garment.measurement` is null and the effective set is computed from
   *  full_measurement_set or original_garment + sparse changes. */
  measurement?: Measurement | null;
  /** Operator-recorded values from the last QC fail — rendered in red beside
   *  the expected value so the worker knows what to correct. */
  qcFailActuals?: Map<string, number> | null;
  /** Option defects from the last QC fail — print view not yet rendering these
   *  per-section; accepted to keep parity with the screen overlay's prop shape. */
  qcFailOptionActuals?: Map<string, unknown> | null;
  /** Customer-feedback option changes — print view doesn't render the banner
   *  yet; accepted for prop parity with the screen overlay. */
  optionChanges?: import("@/lib/alteration-filter").OptionChange[];
}) {
  const showSection = (key: "frontPocket" | "jabzour" | "sidePocket" | "cuffs" | "collar") =>
    !alterationFilter?.hideUnchanged || alterationFilter.visibleSections.has(key);
  const measurement = measurementProp ?? garment.measurement ?? null;
  const degree = measurement?.degree ? Number(measurement.degree) : 0;
  const corrections = getMeasurementCorrections(garment.trip_history);
  const basma = hasBasmaMeasurements(measurement as unknown as Record<string, unknown> | null);

  const hasMeasureVal = (key: keyof Measurement): boolean => {
    if (!measurement) return false;
    const v = measurement[key];
    return v != null && v !== "" && Number(v) > 0;
  };
  const styledMeasure = (key: keyof Measurement) => {
    if (!measurement) return null;
    const correction = corrections.get(key as string) ?? null;
    return <MeasurementValue raw={measurement[key]} degree={0} correction={correction} />;
  };

  const styleLabel = String(garment.style ?? "kuwaiti").toUpperCase();
  const lineCount = String(garment.lines ?? 1);
  const lineLabel =
    lineCount === "1" ? "SINGLE" : lineCount === "2" ? "DOUBLE" : lineCount;

  const frontPocket = optionFor(garment.front_pocket_type);
  const collarType = optionFor(garment.collar_type);
  const collarButton = optionFor(garment.collar_button);
  const cuffs = optionFor(garment.cuffs_type);
  const sidePocket = optionFor("SID_MUDAWWAR_SIDE_POCKET");

  const isShaab = garment.jabzour_1 === "ZIPPER";
  const jabzourPrimary = isShaab
    ? optionFor("JAB_SHAAB")
    : optionFor(garment.jabzour_2);
  const jabzourSecondary = isShaab ? optionFor(garment.jabzour_2) : null;

  const garmentDisplayId = garment.garment_id ?? garment.id.slice(0, 8);
  const stageLabel = garment.piece_stage
    ? PIECE_STAGE_LABELS[garment.piece_stage as keyof typeof PIECE_STAGE_LABELS] ?? garment.piece_stage
    : null;
  const typeLabel = (garment.garment_type ?? "FINAL").toUpperCase();

  return (
    <div className="terminal-qc-print-sheet">
      <div className="terminal-qc-print-header">
        <div className="terminal-qc-print-id-block">
          <span className="terminal-qc-print-id-label">N FAT</span>
          <span className="terminal-qc-print-id-value">{garmentDisplayId}</span>
          <span className="terminal-qc-print-id-meta">
            {typeLabel}{stageLabel ? ` · ${stageLabel}` : ""}
          </span>
        </div>

        <div className="terminal-qc-print-customer">
          <p>
            <span>Customer:</span> {garment.customer_name ?? EMPTY_VALUE}
          </p>
          <p>
            <span>Phone:</span> {garment.customer_mobile ?? EMPTY_VALUE}
          </p>
          <p>
            <span>Invoice:</span> {garment.invoice_number ?? EMPTY_VALUE}
          </p>
          {garment.delivery_date_order && (
            <p>
              <span>Due:</span> {formatDate(garment.delivery_date_order)}
            </p>
          )}
        </div>

        <div className="terminal-qc-print-brand">
          {(() => {
            const brand = garment.order_brand ?? "ERTH";
            const logo = BRAND_LOGOS[brand];
            return logo
              ? <img src={logo} alt={brand} className="terminal-qc-print-brand-logo" />
              : <span>{brand}</span>;
          })()}
        </div>
      </div>

      <div className="terminal-qc-print-main">
        <div className="terminal-qc-template-frame">
          <div className="terminal-qc-template-frame-inner">
          <img
            src={templateSvg}
            alt="Measurement template"
            className="terminal-qc-template-image"
          />

          {qualityCheckTemplateFields.map((field) => {
            const measurementKey = FIELD_MEASUREMENT_MAP[field.id];
            if (alterationFilter?.hideUnchanged && !alterationFilter.measurementKeys.has(measurementKey as string)) {
              return null;
            }
            const correction = corrections.get(measurementKey as string) ?? null;
            const qcActual = qcFailActuals?.get(measurementKey as string);
            const hasQcActual = qcActual !== undefined;
            const effectiveRaw = correction ? correction.corrected : (measurement ? measurement[measurementKey] : null);
            const parts = parseMeasurementParts(effectiveRaw, correction ? 0 : degree);
            if (!parts) return null;

            const reason = alterationFilter?.fieldReasons.get(measurementKey as string);
            const isVertical = "orientation" in field && field.orientation === "vertical";
            const stateClass = correction || hasQcActual
              ? "terminal-qc-measure-cell-issue"
              : reason === "Customer Request"
                ? "terminal-qc-measure-cell-reason-customer"
                : reason === "Workshop Error"
                  ? "terminal-qc-measure-cell-reason-workshop"
                  : reason === "Shop Error"
                    ? "terminal-qc-measure-cell-reason-shop"
                    : "";

            return (
              <div
                key={field.id}
                className={`terminal-qc-measure-cell ${isVertical ? "terminal-qc-measure-cell-vertical" : ""} ${hasQcActual && !isVertical ? "terminal-qc-measure-cell-stacked" : ""} ${stateClass}`}
                style={{
                  left: `${field.left}%`,
                  top: `${field.top}%`,
                  width: `${field.width}%`,
                  height: `${field.height}%`,
                }}
              >
                <MeasurementValue
                  raw={measurement ? measurement[measurementKey] : null}
                  degree={degree}
                  correction={correction}
                />
                {hasQcActual && (
                  <span className="terminal-qc-measure-cell-actual">
                    <MeasurementValue raw={qcActual} degree={0} />
                  </span>
                )}
              </div>
            );
          })}
          </div>
        </div>

        <aside className="terminal-qc-style-panel">
          <div className="terminal-qc-style-meta">
            <span>{styleLabel}</span>
            <span>LINE {lineLabel}</span>
            <span>{(garment.garment_type ?? "FINAL").toUpperCase()}</span>
          </div>

          {showSection("frontPocket") && (
          <section className="terminal-qc-style-block">
            <div className="terminal-qc-style-header">
              <h4>Front Pocket</h4>
              <ThicknessBadge value={garment.front_pocket_thickness} />
            </div>
            <MeasureLayout
              image={frontPocket?.image}
              imageAlt={frontPocket?.label ?? "Front pocket"}
              imageFallback="POCKET"
              height={styledMeasure("top_pocket_length")}
              width={styledMeasure("top_pocket_width")}
              extras={<ExtraRow label="Pocket Dist" value={styledMeasure("top_pocket_distance")} />}
              accessories={
                garment.pen_holder ? (
                  <span>
                    <img src={ACCESSORY_ICONS.pen} alt="Pen holder" className="terminal-qc-accessory-rotate" /> PEN
                  </span>
                ) : null
              }
            />
          </section>
          )}

          {showSection("jabzour") && (
          <section className="terminal-qc-style-block">
            <div className="terminal-qc-style-header">
              <h4>Jabzour</h4>
              <ThicknessBadge value={garment.jabzour_thickness} />
            </div>
            <MeasureLayout
              image={jabzourPrimary?.image}
              imageAlt={jabzourPrimary?.label ?? "Jabzour"}
              imageFallback={isShaab ? "JAB SHAAB" : "JAB"}
              height={styledMeasure("jabzour_width")}
              width={styledMeasure("jabzour_length")}
              extras={
                hasMeasureVal("second_button_distance")
                  ? <ExtraRow label="2nd Bottom Dist" value={styledMeasure("second_button_distance")} />
                  : null
              }
              accessories={isShaab ? <span>ZIPPER</span> : null}
            />
            {jabzourSecondary?.image ? (
              <img
                src={jabzourSecondary.image}
                alt={jabzourSecondary.label}
                className="terminal-qc-jabzour-secondary"
              />
            ) : null}
          </section>
          )}

          {showSection("sidePocket") && (
          <section className="terminal-qc-style-block">
            <div className="terminal-qc-style-header">
              <h4>Side Pocket</h4>
            </div>
            <MeasureLayout
              image={sidePocket?.image}
              imageAlt={sidePocket?.label ?? "Side pocket"}
              imageFallback="SIDE"
              height={styledMeasure("side_pocket_length")}
              width={styledMeasure("side_pocket_width")}
              accessories={
                (garment.wallet_pocket || garment.mobile_pocket) ? (
                  <>
                    {garment.wallet_pocket ? (
                      <span>
                        <img src={ACCESSORY_ICONS.wallet} alt="Wallet pocket" /> WALLET
                      </span>
                    ) : null}
                    {garment.mobile_pocket ? (
                      <span>
                        <img src={ACCESSORY_ICONS.phone} alt="Mobile pocket" /> MOBILE
                      </span>
                    ) : null}
                  </>
                ) : null
              }
            />
          </section>
          )}

          {showSection("cuffs") && (
          <section className="terminal-qc-style-block">
            <div className="terminal-qc-style-header">
              <h4>Cuffs</h4>
              <ThicknessBadge value={garment.cuffs_thickness} />
            </div>
            <div className="terminal-qc-cuffs-image-wrap">
              <StyleImageCell
                image={cuffs?.image}
                alt={cuffs?.label ?? "Cuffs"}
                fallback="NO CUFF"
              />
            </div>
            {basma && (hasMeasureVal("basma_length") || hasMeasureVal("basma_width")) && (
              <div className="terminal-qc-extras-row">
                {hasMeasureVal("basma_length") && (
                  <ExtraRow label="Basma L" value={styledMeasure("basma_length")} />
                )}
                {hasMeasureVal("basma_width") && (
                  <ExtraRow label="Basma W" value={styledMeasure("basma_width")} />
                )}
              </div>
            )}
          </section>
          )}

          {showSection("collar") && (
          <section className="terminal-qc-style-block">
            <div className="terminal-qc-style-header">
              <h4>Collar</h4>
              <ThicknessBadge value={(garment as { collar_thickness?: string | null }).collar_thickness} />
            </div>
            <MeasureLayout
              image={collarType?.image}
              imageAlt={collarType?.label ?? "Collar"}
              imageFallback="COLLAR"
              height={styledMeasure("collar_height")}
              width={styledMeasure("collar_width")}
              accessories={
                <>
                  {collarButton ? (
                    <span>
                      {collarButton.image ? (
                        <img src={collarButton.image} alt={collarButton.label} />
                      ) : null}
                      {collarButton.label}
                    </span>
                  ) : null}
                  {garment.small_tabaggi ? (
                    <span>
                      <img src={ACCESSORY_ICONS.smallTabaggi} alt="Small tabbagi" /> SMALL TABAGGI
                    </span>
                  ) : null}
                  {measurement?.collar_position === "up" ? (
                    <span>COLLAR UP</span>
                  ) : measurement?.collar_position === "down" ? (
                    <span>COLLAR DOWN</span>
                  ) : (
                    <span>COLLAR STANDARD</span>
                  )}
                </>
              }
            />
          </section>
          )}
        </aside>
      </div>

      {garment.notes ? (
        <div className="terminal-qc-print-notes">
          <strong>Notes:</strong> {garment.notes}
        </div>
      ) : null}
    </div>
  );
}
