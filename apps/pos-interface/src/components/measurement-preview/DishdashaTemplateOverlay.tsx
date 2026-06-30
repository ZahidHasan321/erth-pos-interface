import type { Measurement } from "@repo/database";
import { parseMeasurementParts } from "@repo/database";
import templateSvg from "./assets/template.svg";
import {
  dishdashaTemplateFields,
  FIELD_MEASUREMENT_MAP,
  DISHDASHA_TEMPLATE_ASPECT,
  type DishdashaTemplateFieldId,
} from "./dishdasha-template-layout";
import { MeasureText } from "./MeasureText";

export interface DishdashaTemplateOverlayProps {
  /** Measurement values, keyed by measurements column. */
  values: Partial<Measurement>;
  /** Body-posture offset applied to body cells (matches the terminal). */
  degree?: number;
  /** Per measurement-key cell tint className (used to flag corrected cells). */
  tints?: Record<string, string>;
  /**
   * When set, only these measurement keys render — used for the feedback
   * "only what's wrong" view. Omit to show every filled cell (full view).
   */
  visibleKeys?: Set<string>;
}

/**
 * The terminal garment diagram: the same template.svg + measurement-cell layout
 * the workshop terminal uses, rendered read-only for the shop measurement
 * preview. The style sidebar is built separately (see MeasurementPreviewSidePanel).
 */
export function DishdashaTemplateOverlay({
  values,
  degree = 0,
  tints,
  visibleKeys,
}: DishdashaTemplateOverlayProps) {
  return (
    <div
      className="relative w-full"
      style={{ aspectRatio: DISHDASHA_TEMPLATE_ASPECT }}
    >
      <img
        src={templateSvg}
        alt="Garment measurement template"
        className="absolute inset-0 h-full w-full object-fill"
      />

      {dishdashaTemplateFields.map((field) => {
        const key = FIELD_MEASUREMENT_MAP[field.id as DishdashaTemplateFieldId];
        if (visibleKeys && !visibleKeys.has(key)) return null;

        const raw = values[key];
        const parts = parseMeasurementParts(raw, degree);
        if (!parts) return null;

        const isVertical =
          "orientation" in field && field.orientation === "vertical";
        const tint = tints?.[key] ?? "";

        return (
          <div
            key={field.id}
            className={`absolute flex items-center justify-center font-medium leading-none ${tint}`}
            style={{
              left: `${field.left}%`,
              top: `${field.top}%`,
              width: `${field.width}%`,
              height: `${field.height}%`,
              fontSize: "clamp(11px, 2.6%, 20px)",
              writingMode: isVertical ? "vertical-rl" : undefined,
              borderRadius: "4px",
              boxSizing: "content-box",
              padding: isVertical ? "8px 3px" : "4px 5px",
              marginLeft: isVertical ? "-3px" : "-5px",
              marginTop: isVertical ? "-8px" : "-4px",
            }}
          >
            <MeasureText raw={raw} degree={degree} />
          </div>
        );
      })}
    </div>
  );
}
