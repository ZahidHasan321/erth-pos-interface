import type { Measurement } from "@repo/database";
import { DishdashaTemplateOverlay } from "./DishdashaTemplateOverlay";
import {
  MeasurementPreviewSidePanel,
  type PreviewStyleNames,
} from "./MeasurementPreviewSidePanel";
import { reasonTint } from "./reason-tint";

export interface MeasurementTerminalPreviewProps {
  /** Measurement values to render (live form values or staged corrections). */
  values: Partial<Measurement>;
  /** Body-posture offset applied to body cells (matches the terminal). */
  degree?: number;
  /** Optional style names shown beside each sidebar section. */
  styleNames?: PreviewStyleNames;
  /**
   * Feedback "only what's wrong" mode: when set, only these keys render, and
   * each is tinted by its difference reason. Omit for the full view.
   */
  changedKeys?: Set<string>;
  /** Per-key difference reason (Customer Request / Workshop Error / Shop Error). */
  reasonByKey?: Record<string, string>;
}

/**
 * Terminal-style measurement preview: the workshop terminal's garment diagram
 * (DishdashaTemplateOverlay) plus a style-named measurement sidebar. Read-only;
 * fed by in-progress form/feedback values so staff can sanity-check before save.
 */
export function MeasurementTerminalPreview({
  values,
  degree = 0,
  styleNames,
  changedKeys,
  reasonByKey,
}: MeasurementTerminalPreviewProps) {
  const bodyTints = changedKeys
    ? Object.fromEntries(
        [...changedKeys].map((key) => [key, reasonTint(reasonByKey?.[key])]),
      )
    : undefined;

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <div className="mx-auto w-full max-w-[440px] shrink-0 md:mx-0">
        <DishdashaTemplateOverlay
          values={values}
          degree={degree}
          tints={bodyTints}
          visibleKeys={changedKeys}
        />
      </div>
      <div className="min-w-0 flex-1">
        <MeasurementPreviewSidePanel
          values={values}
          styleNames={styleNames}
          changedKeys={changedKeys}
          reasonByKey={reasonByKey}
        />
      </div>
    </div>
  );
}
