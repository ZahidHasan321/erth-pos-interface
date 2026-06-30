import { parseMeasurementParts } from "@repo/database";

/**
 * Renders a single measurement value (whole + stacked fraction + degree),
 * mirroring the workshop terminal's MeasurementValue so the preview reads the
 * same. `degree` is the body-posture offset applied to the dishdasha body
 * cells; sidebar style dimensions render with degree 0.
 *
 * Returns null when the value is blank/unparseable so empty cells stay empty.
 */
export function MeasureText({
  raw,
  degree = 0,
  className,
}: {
  raw: unknown;
  degree?: number;
  className?: string;
}) {
  const p = parseMeasurementParts(raw, degree);
  if (!p) return null;

  return (
    <span
      className={`inline-flex items-baseline gap-[2px] tabular-nums ${className ?? ""}`}
      style={{ writingMode: "horizontal-tb", fontFeatureSettings: '"tnum","lnum"' }}
    >
      {p.negative && <span>-</span>}
      {(p.whole > 0 || p.numerator === 0) && <span>{p.whole}</span>}
      {p.numerator > 0 && (
        <span
          className="inline-flex flex-col items-center justify-center leading-[0.95]"
          style={{ fontSize: "0.62em", transform: "translateY(-0.05em)" }}
        >
          <span>{p.numerator}</span>
          <span
            className="block h-[1.5px] w-full rounded-full bg-current"
            style={{ marginBlock: "1px" }}
          />
          <span>{p.denominator}</span>
        </span>
      )}
      {p.hasDegree && <span>°</span>}
    </span>
  );
}

/** True when a measurement value is present and non-zero (parses to something). */
export function hasMeasureValue(raw: unknown): boolean {
  if (raw == null || raw === "") return false;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0;
}
