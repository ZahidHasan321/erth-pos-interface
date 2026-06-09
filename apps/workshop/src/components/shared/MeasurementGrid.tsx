import type { Measurement, MeasurementIssue } from "@repo/database";
import { ShoulderSlopeDisplay } from "@repo/ui/shoulder-slope";
import { MeasurementValue } from "./MeasurementValue";
import { cn } from "@/lib/utils";

const MEASUREMENT_GROUPS: { title: string; fields: { key: keyof Measurement; label: string }[] }[] = [
  {
    title: "Collar & shoulder",
    fields: [
      { key: "collar_width", label: "Collar W" },
      { key: "collar_height", label: "Collar H" },
      { key: "shoulder", label: "Shoulder" },
    ],
  },
  {
    title: "Chest",
    fields: [
      { key: "chest_full", label: "Full" },
      { key: "chest_upper", label: "Upper" },
      { key: "chest_front", label: "Front" },
      { key: "chest_back", label: "Back" },
    ],
  },
  {
    title: "Sleeve & armhole",
    fields: [
      { key: "sleeve_length", label: "Length" },
      { key: "sleeve_width", label: "Width" },
      { key: "elbow", label: "Elbow" },
      { key: "armhole_front", label: "AH front" },
    ],
  },
  {
    title: "Waist & length",
    fields: [
      { key: "waist_full", label: "Full" },
      { key: "waist_front", label: "Front" },
      { key: "waist_back", label: "Back" },
      { key: "length_front", label: "L front" },
      { key: "length_back", label: "L back" },
      { key: "bottom", label: "Bottom" },
    ],
  },
  {
    title: "Pockets & jabzour",
    fields: [
      { key: "top_pocket_length", label: "Top P L" },
      { key: "top_pocket_width", label: "Top P W" },
      { key: "side_pocket_length", label: "Side P L" },
      { key: "side_pocket_width", label: "Side P W" },
      { key: "jabzour_length", label: "Jabzour L" },
      { key: "jabzour_width", label: "Jabzour W" },
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
      {MEASUREMENT_GROUPS.map((group) => {
        const filled = group.fields.filter((f) => measurement[f.key] || corrections?.has(f.key as string));
        if (filled.length === 0) return null;
        return (
          <div key={group.title}>
            <h4 className="text-sm font-medium text-muted-foreground mb-1.5">
              {group.title}
            </h4>
            <div className="grid grid-cols-3 gap-1">
              {filled.map(({ key, label }) => {
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
                    <span className="text-xs text-muted-foreground">{label}</span>
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
