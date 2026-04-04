import templateSvg from "@/assets/print/template.svg";
import { ACCESSORY_ICONS, STYLE_IMAGE_MAP } from "@/lib/style-images";
import type { Measurement, WorkshopGarment } from "@repo/database";
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
    sideUpper: "armhole_front",
    sleeves: "sleeve_length",
    armhole: "armhole",
    width: "sleeve_width",
    sideLower: "armhole_provision",
    upperChest: "chest_upper",
    chest: "chest_front",
    halfChest: "chest_back",
    waistFront: "waist_front",
    waistBack: "waist_back",
    bottom: "bottom",
  };

const EMPTY_VALUE = "-";

function formatFraction(value: number): string {
  const whole = Math.floor(value);
  const remainder = value - whole;

  if (Math.abs(remainder) < 0.01) return `${whole}`;
  if (Math.abs(remainder - 0.25) < 0.01) return `${whole} 1/4`;
  if (Math.abs(remainder - 0.5) < 0.01) return `${whole} 1/2`;
  if (Math.abs(remainder - 0.75) < 0.01) return `${whole} 3/4`;

  return value.toFixed(1);
}

function formatMeasuredValue(raw: unknown, degree: number): string {
  if (raw == null || raw === "") return "";
  if (raw instanceof Date) return "";
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric === 0) return "";
  const adjusted = degree ? numeric - degree : numeric;
  return formatFraction(adjusted);
}

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

function valueOrDash(value: string): string {
  return value || EMPTY_VALUE;
}

export function TerminalQualityTemplatePrint({
  garment,
}: {
  garment: WorkshopGarment;
}) {
  const measurement = garment.measurement ?? null;
  const degree = measurement?.degree ? Number(measurement.degree) : 0;

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

  const frontPocketHeight = formatMeasuredValue(
    measurement?.top_pocket_length,
    degree,
  );
  const frontPocketWidth = formatMeasuredValue(
    measurement?.top_pocket_width,
    degree,
  );
  const jabzourLength = formatMeasuredValue(
    measurement?.jabzour_length,
    degree,
  );
  const sidePocketHeight = formatMeasuredValue(
    measurement?.side_pocket_length,
    degree,
  );
  const sidePocketWidth = formatMeasuredValue(
    measurement?.side_pocket_width,
    degree,
  );
  const collarHeight = formatMeasuredValue(measurement?.collar_height, degree);
  const collarWidth = formatMeasuredValue(measurement?.collar_width, degree);

  const garmentDisplayId = garment.garment_id ?? garment.id.slice(0, 8);

  return (
    <div className="terminal-qc-print-sheet">
      <div className="terminal-qc-print-header">
        <div className="terminal-qc-print-id-block">
          <span className="terminal-qc-print-id-label">N FAT</span>
          <span className="terminal-qc-print-id-value">{garmentDisplayId}</span>
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
        </div>

        <div className="terminal-qc-print-brand">
          {garment.order_brand ?? "ERTH"}
        </div>
      </div>

      <div className="terminal-qc-print-main">
        <div className="terminal-qc-template-frame">
          <img
            src={templateSvg}
            alt="Measurement template"
            className="terminal-qc-template-image"
          />

          {qualityCheckTemplateFields.map((field) => {
            const measurementKey = FIELD_MEASUREMENT_MAP[field.id];
            const value = measurement
              ? formatMeasuredValue(measurement[measurementKey], degree)
              : "";

            if (!value) return null;

            return (
              <div
                key={field.id}
                className={`terminal-qc-measure-cell ${"orientation" in field && field.orientation === "vertical" ? "terminal-qc-measure-cell-vertical" : ""}`}
                style={{
                  left: `${field.left}%`,
                  top: `${field.top}%`,
                  width: `${field.width}%`,
                  height: `${field.height}%`,
                }}
              >
                {value}
              </div>
            );
          })}
        </div>

        <aside className="terminal-qc-style-panel">
          <div className="terminal-qc-style-meta">
            <span>{styleLabel}</span>
            <span>LINE {lineLabel}</span>
            <span>{(garment.garment_type ?? "FINAL").toUpperCase()}</span>
          </div>

          <section className="terminal-qc-style-block">
            <h4>Front Pocket</h4>
            <div className="terminal-qc-style-row">
              {frontPocket?.image ? (
                <img
                  src={frontPocket.image}
                  alt={frontPocket.label}
                  className="terminal-qc-style-image"
                />
              ) : (
                <div className="terminal-qc-style-placeholder">POCKET</div>
              )}
              <div className="terminal-qc-style-values">
                <span>H {valueOrDash(frontPocketHeight)}</span>
                <span>W {valueOrDash(frontPocketWidth)}</span>
                <span>
                  HASHWA {formatThickness(garment.front_pocket_thickness)}
                </span>
              </div>
            </div>
            <div className="terminal-qc-accessories-row">
              {garment.pen_holder ? (
                <span>
                  <img src={ACCESSORY_ICONS.pen} alt="Pen holder" /> PEN
                </span>
              ) : null}
            </div>
          </section>

          <section className="terminal-qc-style-block">
            <h4>Jabzour</h4>
            <div className="terminal-qc-style-row">
              <div className="terminal-qc-jabzour-stack">
                {jabzourPrimary?.image ? (
                  <img
                    src={jabzourPrimary.image}
                    alt={jabzourPrimary.label}
                    className="terminal-qc-style-image"
                  />
                ) : (
                  <div className="terminal-qc-style-placeholder">JAB 1</div>
                )}
                {jabzourSecondary?.image ? (
                  <img
                    src={jabzourSecondary.image}
                    alt={jabzourSecondary.label}
                    className="terminal-qc-style-image"
                  />
                ) : null}
              </div>
              <div className="terminal-qc-style-values">
                <span>L {valueOrDash(jabzourLength)}</span>
                <span>HASHWA {formatThickness(garment.jabzour_thickness)}</span>
              </div>
            </div>
          </section>

          <section className="terminal-qc-style-block">
            <h4>Side Pocket</h4>
            <div className="terminal-qc-style-row">
              {sidePocket?.image ? (
                <img
                  src={sidePocket.image}
                  alt={sidePocket.label}
                  className="terminal-qc-style-image"
                />
              ) : (
                <div className="terminal-qc-style-placeholder">SIDE</div>
              )}
              <div className="terminal-qc-style-values">
                <span>H {valueOrDash(sidePocketHeight)}</span>
                <span>W {valueOrDash(sidePocketWidth)}</span>
              </div>
            </div>
            <div className="terminal-qc-accessories-row">
              {garment.wallet_pocket ? (
                <span>
                  <img src={ACCESSORY_ICONS.wallet} alt="Wallet pocket" />{" "}
                  WALLET
                </span>
              ) : null}
              <span>
                <img src={ACCESSORY_ICONS.phone} alt="Mobile pocket" /> MOBILE
              </span>
            </div>
          </section>

          <section className="terminal-qc-style-block">
            <h4>Cuffs</h4>
            <div className="terminal-qc-style-row">
              {cuffs?.image ? (
                <img
                  src={cuffs.image}
                  alt={cuffs.label}
                  className="terminal-qc-style-image"
                />
              ) : (
                <div className="terminal-qc-style-placeholder">NO CUFF</div>
              )}
              <div className="terminal-qc-style-values">
                <span>HASHWA {formatThickness(garment.cuffs_thickness)}</span>
              </div>
            </div>
          </section>

          <section className="terminal-qc-style-block">
            <h4>Collar</h4>
            <div className="terminal-qc-style-row">
              {collarType?.image ? (
                <img
                  src={collarType.image}
                  alt={collarType.label}
                  className="terminal-qc-style-image"
                />
              ) : (
                <div className="terminal-qc-style-placeholder">COLLAR</div>
              )}

              <div className="terminal-qc-style-values">
                <span>H {valueOrDash(collarHeight)}</span>
                <span>W {valueOrDash(collarWidth)}</span>
              </div>
            </div>

            <div className="terminal-qc-accessories-row terminal-qc-collar-row">
              {collarButton?.image ? (
                <span>
                  <img src={collarButton.image} alt={collarButton.label} />{" "}
                  BUTTON
                </span>
              ) : null}
              {garment.small_tabaggi ? (
                <span>
                  <img src={ACCESSORY_ICONS.smallTabaggi} alt="Small tabbagi" />
                  SMALL TABAGGI
                </span>
              ) : null}
            </div>
          </section>
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
