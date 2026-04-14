import { parseMeasurementParts } from "@repo/database";
import type { Measurement } from "@repo/database";

interface MeasurementValueProps {
  raw: unknown;
  degree?: number;
  className?: string;
}

export function MeasurementValue({ raw, degree = 0, className }: MeasurementValueProps) {
  const p = parseMeasurementParts(raw, degree);
  if (!p) return null;

  return (
    <span
      className={`inline-flex items-center gap-[3px] ${className ?? ""}`}
      style={{ writingMode: "horizontal-tb" }}
    >
      {p.negative && <span>-</span>}
      {(p.whole > 0 || p.numerator === 0) && <span>{p.whole}</span>}
      {p.numerator > 0 && (
        <span className="inline-flex flex-col items-center leading-none">
          <span className="text-[0.8em]">{p.numerator}</span>
          <span className="block h-px w-full bg-current" />
          <span className="text-[0.8em]">{p.denominator}</span>
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
}

export function MeasurementField({ measurement, field, degree = 0, className }: MeasurementFieldProps) {
  if (!measurement) return null;
  return <MeasurementValue raw={measurement[field]} degree={degree} className={className} />;
}
