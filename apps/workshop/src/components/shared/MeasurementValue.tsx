import { parseMeasurementParts } from "@repo/database";
import type { Measurement, MeasurementIssue } from "@repo/database";

interface MeasurementValueProps {
  raw: unknown;
  degree?: number;
  className?: string;
  /** When set, renders the corrected value in red with the original in the tooltip. */
  correction?: MeasurementIssue | null;
}

export function MeasurementValue({ raw, degree = 0, className, correction }: MeasurementValueProps) {
  const effectiveRaw = correction ? correction.corrected : raw;
  const p = parseMeasurementParts(effectiveRaw, correction ? 0 : degree);
  if (!p) return null;

  const tooltip = correction
    ? `Workshop mistake, original: ${correction.original ?? "-"}${correction.note ? ` (${correction.note})` : ""}`
    : undefined;

  return (
    <span
      className={`inline-flex items-baseline gap-[2px] tabular-nums ${correction ? "text-red-600 font-medium" : ""} ${className ?? ""}`}
      style={{ writingMode: "horizontal-tb", fontFeatureSettings: '"tnum","lnum"' }}
      title={tooltip}
    >
      {p.negative && <span>-</span>}
      {(p.whole > 0 || p.numerator === 0) && <span>{p.whole}</span>}
      {p.numerator > 0 && (
        <span
          className="inline-flex flex-col items-center justify-center leading-[0.95]"
          style={{ fontSize: "0.62em", transform: "translateY(-0.05em)" }}
        >
          <span>{p.numerator}</span>
          <span className="block h-[1.5px] w-full bg-current rounded-full" style={{ marginBlock: "1px" }} />
          <span>{p.denominator}</span>
        </span>
      )}
      {p.hasDegree && <span>°</span>}
    </span>
  );
}

// Convenience: given a measurement object + field key + degree, render the value
interface MeasurementFieldProps {
  measurement: Measurement | null | undefined;
  field: keyof Measurement;
  degree?: number;
  className?: string;
  correction?: MeasurementIssue | null;
}

export function MeasurementField({ measurement, field, degree = 0, className, correction }: MeasurementFieldProps) {
  if (!measurement) return null;
  return (
    <MeasurementValue
      raw={measurement[field]}
      degree={degree}
      className={className}
      correction={correction}
    />
  );
}
