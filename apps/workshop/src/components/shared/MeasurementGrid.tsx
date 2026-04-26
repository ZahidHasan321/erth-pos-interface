import type { Measurement, MeasurementIssue } from "@repo/database";
import { MeasurementValue } from "./MeasurementValue";

const MEASUREMENT_GROUPS: { title: string; color: string; cellColor: string; fields: { key: keyof Measurement; label: string }[] }[] = [
  {
    title: "Collar & Shoulder",
    color: "text-rose-600",
    cellColor: "bg-rose-50/70",
    fields: [
      { key: "collar_width", label: "Collar W" },
      { key: "collar_height", label: "Collar H" },
      { key: "shoulder", label: "Shoulder" },
    ],
  },
  {
    title: "Chest",
    color: "text-orange-600",
    cellColor: "bg-orange-50/70",
    fields: [
      { key: "chest_full", label: "Full" },
      { key: "chest_upper", label: "Upper" },
      { key: "chest_front", label: "Front" },
      { key: "chest_back", label: "Back" },
    ],
  },
  {
    title: "Sleeve & Armhole",
    color: "text-emerald-600",
    cellColor: "bg-emerald-50/70",
    fields: [
      { key: "sleeve_length", label: "Length" },
      { key: "sleeve_width", label: "Width" },
      { key: "elbow", label: "Elbow" },
      { key: "armhole", label: "Armhole" },
      { key: "armhole_front", label: "AH Front" },
    ],
  },
  {
    title: "Waist & Length",
    color: "text-blue-600",
    cellColor: "bg-blue-50/70",
    fields: [
      { key: "waist_full", label: "Full" },
      { key: "waist_front", label: "Front" },
      { key: "waist_back", label: "Back" },
      { key: "length_front", label: "L Front" },
      { key: "length_back", label: "L Back" },
      { key: "bottom", label: "Bottom" },
    ],
  },
  {
    title: "Pockets & Jabzour",
    color: "text-purple-600",
    cellColor: "bg-purple-50/70",
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
    return <p className="text-sm text-muted-foreground italic">No measurements recorded</p>;
  }

  const degree = measurement.degree ? Number(measurement.degree) : 0;

  return (
    <div className="space-y-3">

      {MEASUREMENT_GROUPS.map((group) => {
        const filled = group.fields.filter((f) => measurement[f.key] || corrections?.has(f.key as string));
        if (filled.length === 0) return null;
        return (
          <div key={group.title}>
            <p className={`text-xs font-bold uppercase tracking-wider mb-1.5 ${group.color}`}>
              {group.title}
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {filled.map(({ key, label }) => {
                const correction = corrections?.get(key as string) ?? null;
                return (
                  <div
                    key={key}
                    className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 ${
                      correction ? "bg-red-50 ring-1 ring-red-300" : group.cellColor
                    }`}
                  >
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <MeasurementValue
                      raw={measurement[key]}
                      degree={degree}
                      className="text-sm font-bold tabular-nums"
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
