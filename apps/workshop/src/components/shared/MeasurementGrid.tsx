import type { Measurement } from "@repo/database";

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
      { key: "chest_provision", label: "Provision" },
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
      { key: "armhole_provision", label: "AH Prov" },
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
      { key: "waist_provision", label: "Provision" },
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

function formatFraction(val: number): { whole: number; frac: string } {
  const whole = Math.floor(val);
  const rem = val - whole;
  if (rem < 0.01) return { whole, frac: "" };
  if (Math.abs(rem - 0.25) < 0.01) return { whole, frac: "¼" };
  if (Math.abs(rem - 0.5) < 0.01) return { whole, frac: "½" };
  if (Math.abs(rem - 0.75) < 0.01) return { whole, frac: "¾" };
  // Non-standard fraction — show decimal
  return { whole, frac: `.${Math.round(rem * 100)}` };
}

interface MeasurementGridProps {
  measurement: Measurement | null | undefined;
}

export function MeasurementGrid({ measurement }: MeasurementGridProps) {
  if (!measurement) {
    return <p className="text-sm text-muted-foreground italic">No measurements recorded</p>;
  }

  const degree = measurement.degree ? Number(measurement.degree) : 0;

  return (
    <div className="space-y-3">

      {MEASUREMENT_GROUPS.map((group) => {
        const filled = group.fields.filter((f) => measurement[f.key]);
        if (filled.length === 0) return null;
        return (
          <div key={group.title}>
            <p className={`text-xs font-bold uppercase tracking-wider mb-1.5 ${group.color}`}>
              {group.title}
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {filled.map(({ key, label }) => {
                const raw = Number(measurement[key]);
                const adjusted = degree ? raw - degree : raw;
                const { whole, frac } = formatFraction(adjusted);
                return (
                  <div key={key} className={`flex items-baseline justify-between rounded-lg px-2.5 py-1.5 ${group.cellColor}`}>
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className="text-sm font-bold tabular-nums">
                      {whole}
                      {frac && <span className="text-xs font-semibold text-muted-foreground">({frac})</span>}
                      <span className="text-xs text-muted-foreground font-normal">°</span>
                    </span>
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
