import type { Measurement, MeasurementIssue } from "@repo/database";
import { getLabel } from "@repo/database";
import { ShoulderSlopeDisplay } from "@repo/ui/shoulder-slope";
import { MeasurementValue } from "./MeasurementValue";
import { cn } from "@/lib/utils";

// Field labels come from the central spec (getLabel) so naming stays in
// lock-step with QC and the new-measurement form.
const MEASUREMENT_GROUPS: { title: string; fields: { key: keyof Measurement }[] }[] = [
  {
    title: "Collar & shoulder",
    fields: [
      { key: "collar_width" },
      { key: "collar_height" },
      { key: "shoulder" },
    ],
  },
  {
    title: "Chest",
    fields: [
      { key: "chest_full" },
      { key: "chest_upper" },
      { key: "chest_front" },
      { key: "chest_back" },
    ],
  },
  {
    title: "Sleeve & armhole",
    fields: [
      { key: "sleeve_length" },
      { key: "sleeve_width" },
      { key: "elbow" },
      { key: "armhole_front" },
    ],
  },
  {
    title: "Waist & length",
    fields: [
      { key: "waist_full" },
      { key: "waist_front" },
      { key: "waist_back" },
      { key: "length_front" },
      { key: "length_back" },
      { key: "bottom" },
    ],
  },
  {
    title: "Pockets & jabzour",
    fields: [
      { key: "top_pocket_length" },
      { key: "top_pocket_width" },
      { key: "side_pocket_length" },
      { key: "side_pocket_width" },
      { key: "jabzour_length" },
      { key: "jabzour_width" },
    ],
  },
];

interface MeasurementGridProps {
  measurement: Measurement | null | undefined;
  corrections?: Map<string, MeasurementIssue> | null;
}

export function MeasurementGrid({ measurement, corrections }: MeasurementGridProps) {
  if (!measurement) {
    return <p className="text-sm italic text-muted-foreground">No measurements recorded.</p>;
  }

  const degree = measurement.degree ? Number(measurement.degree) : 0;

  return (
    <div className="space-y-3">
      {/* Categorical body measurements (like shoulder slope) — collar position
          lives on the measurement, not the garment style; Standard = null. */}
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {measurement.shoulder_slope && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1.5">
                Shoulder slope
              </h4>
              <div className="flex items-center justify-between rounded-md bg-muted px-2 py-1 w-fit gap-3">
                <span className="text-xs text-muted-foreground">Slope</span>
                <ShoulderSlopeDisplay value={measurement.shoulder_slope} />
              </div>
            </div>
          )}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1.5">
              Collar position
            </h4>
            <div className="flex items-center justify-between rounded-md bg-muted px-2 py-1 w-fit gap-3">
              <span className="text-xs text-muted-foreground">Position</span>
              <span className="text-sm">
                {measurement.collar_position === "up"
                  ? "Up"
                  : measurement.collar_position === "down"
                    ? "Down"
                    : "Standard"}
              </span>
            </div>
          </div>
        </div>
      {MEASUREMENT_GROUPS.map((group) => {
        const filled = group.fields.filter((f) => measurement[f.key] || corrections?.has(f.key as string));
        if (filled.length === 0) return null;
        return (
          <div key={group.title}>
            <h4 className="text-sm font-medium text-muted-foreground mb-1.5">
              {group.title}
            </h4>
            <div className="grid grid-cols-3 gap-1">
              {filled.map(({ key }) => {
                const correction = corrections?.get(key as string) ?? null;
                return (
                  <div
                    key={key}
                    className={cn(
                      "flex items-center justify-between rounded-md px-2 py-1",
                      correction
                        ? "bg-[var(--status-bad-bg)]"
                        : "bg-muted",
                    )}
                  >
                    <span className="text-xs text-muted-foreground">{getLabel(key as string)}</span>
                    <MeasurementValue
                      raw={measurement[key]}
                      degree={degree}
                      className={cn(
                        "text-sm tabular-nums",
                        correction && "text-[var(--status-bad)]",
                      )}
                      correction={correction}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
