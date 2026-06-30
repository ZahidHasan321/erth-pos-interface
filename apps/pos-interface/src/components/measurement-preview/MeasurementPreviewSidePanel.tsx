import type { ReactNode } from "react";
import type { Measurement } from "@repo/database";
import {
  getShortLabel,
  SHOULDER_SLOPE_LABELS,
  type ShoulderSlope,
} from "@repo/database";
import { MeasureText, hasMeasureValue } from "./MeasureText";
import { reasonTint } from "./reason-tint";

/** Optional human-readable style names shown next to each section heading. */
export interface PreviewStyleNames {
  frontPocket?: string;
  jabzour?: string;
  sidePocket?: string;
  cuffs?: string;
  collar?: string;
}

interface SectionDef {
  title: string;
  styleKey: keyof PreviewStyleNames;
  /** Always shown in full view (blank renders "-"). */
  primary: string[];
  /** Shown only when present (matches the terminal's hide-if-blank rule). */
  optional: string[];
}

const SECTIONS: SectionDef[] = [
  {
    title: "Front Pocket",
    styleKey: "frontPocket",
    primary: ["top_pocket_length", "top_pocket_width", "top_pocket_distance"],
    optional: ["pen_pocket_length", "pen_pocket_width"],
  },
  {
    title: "Jabzour",
    styleKey: "jabzour",
    primary: ["jabzour_width", "jabzour_length"],
    optional: ["second_button_distance"],
  },
  {
    title: "Side Pocket",
    styleKey: "sidePocket",
    primary: ["side_pocket_length", "side_pocket_width"],
    optional: [],
  },
  {
    title: "Cuffs",
    styleKey: "cuffs",
    primary: [],
    optional: ["basma_length", "basma_width", "sleeve_hemming", "bottom_hemming"],
  },
  {
    title: "Collar",
    styleKey: "collar",
    primary: ["collar_height", "collar_width"],
    optional: [],
  },
];

function collarPositionLabel(value: unknown): string {
  if (value === "up") return "Up";
  if (value === "down") return "Down";
  return "Standard";
}

interface MeasurementPreviewSidePanelProps {
  values: Partial<Measurement>;
  styleNames?: PreviewStyleNames;
  /** Changed-only mode (feedback): render just these keys. */
  changedKeys?: Set<string>;
  /** Per-key difference reason, used to tint flagged cells. */
  reasonByKey?: Record<string, string>;
}

export function MeasurementPreviewSidePanel({
  values,
  styleNames,
  changedKeys,
  reasonByKey,
}: MeasurementPreviewSidePanelProps) {
  const changedOnly = changedKeys != null;

  const shouldShow = (key: string, isPrimary: boolean): boolean => {
    if (changedOnly) return changedKeys.has(key);
    if (isPrimary) return true;
    return hasMeasureValue(values[key as keyof Measurement]);
  };

  const cell = (key: string): ReactNode => {
    const tint = changedOnly ? reasonTint(reasonByKey?.[key]) : "border border-border bg-card";
    return (
      <div
        key={key}
        className={`flex flex-col items-center justify-center rounded-md px-2 py-1 text-center ${tint}`}
      >
        <span className="text-[10px] font-medium leading-tight text-muted-foreground">
          {getShortLabel(key)}
        </span>
        <span className="text-base font-medium leading-tight tabular-nums">
          <MeasureText raw={values[key as keyof Measurement]} />
        </span>
      </div>
    );
  };

  const categoricalCell = (
    key: string,
    label: string,
    text: string,
  ): ReactNode => {
    const tint = changedOnly ? reasonTint(reasonByKey?.[key]) : "border border-border bg-card";
    return (
      <div
        key={key}
        className={`flex flex-col items-center justify-center rounded-md px-2 py-1 text-center ${tint}`}
      >
        <span className="text-[10px] font-medium leading-tight text-muted-foreground">
          {label}
        </span>
        <span className="text-sm font-medium leading-tight">{text}</span>
      </div>
    );
  };

  // Top categorical strip: shoulder slope + collar position.
  const showSlope = changedOnly ? changedKeys.has("shoulder_slope") : !!values.shoulder_slope;
  const showCollarPos = changedOnly ? changedKeys.has("collar_position") : true;
  const categoricalCells: ReactNode[] = [];
  if (showSlope) {
    categoricalCells.push(
      categoricalCell(
        "shoulder_slope",
        "Shoulder Slope",
        values.shoulder_slope
          ? SHOULDER_SLOPE_LABELS[values.shoulder_slope as ShoulderSlope] ?? "-"
          : "-",
      ),
    );
  }
  if (showCollarPos) {
    categoricalCells.push(
      categoricalCell(
        "collar_position",
        "Collar Position",
        collarPositionLabel(values.collar_position),
      ),
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {categoricalCells.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">{categoricalCells}</div>
      )}

      {SECTIONS.map((section) => {
        const keys = [...section.primary, ...section.optional].filter((k) =>
          shouldShow(k, section.primary.includes(k)),
        );
        if (keys.length === 0) return null;

        const styleName = styleNames?.[section.styleKey];
        return (
          <section
            key={section.title}
            className="rounded-md border border-border bg-background p-2"
          >
            <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-border pb-1">
              <h4 className="text-xs font-medium text-muted-foreground">
                {section.title}
              </h4>
              {styleName && (
                <span className="truncate text-xs font-medium text-foreground">
                  {styleName}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {keys.map((k) => cell(k))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
