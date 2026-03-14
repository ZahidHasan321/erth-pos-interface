import type { Measurement } from "@repo/database";

const MEASUREMENT_FIELDS: { key: keyof Measurement; label: string }[] = [
  { key: "collar_width", label: "Collar W" },
  { key: "collar_height", label: "Collar H" },
  { key: "shoulder", label: "Shoulder" },
  { key: "armhole", label: "Armhole" },
  { key: "chest_upper", label: "Chest Upper" },
  { key: "chest_full", label: "Chest Full" },
  { key: "chest_front", label: "Chest Front" },
  { key: "chest_back", label: "Chest Back" },
  { key: "sleeve_length", label: "Sleeve L" },
  { key: "sleeve_width", label: "Sleeve W" },
  { key: "elbow", label: "Elbow" },
  { key: "waist_front", label: "Waist Front" },
  { key: "waist_back", label: "Waist Back" },
  { key: "waist_full", label: "Waist Full" },
  { key: "length_front", label: "Length Front" },
  { key: "length_back", label: "Length Back" },
  { key: "bottom", label: "Bottom" },
  { key: "jabzour_width", label: "Jabzour W" },
  { key: "jabzour_length", label: "Jabzour L" },
  { key: "top_pocket_length", label: "Top Pocket L" },
  { key: "top_pocket_width", label: "Top Pocket W" },
  { key: "side_pocket_length", label: "Side Pocket L" },
  { key: "side_pocket_width", label: "Side Pocket W" },
  { key: "chest_provision", label: "Chest Prov" },
  { key: "waist_provision", label: "Waist Prov" },
  { key: "armhole_provision", label: "Armhole Prov" },
];

interface MeasurementGridProps {
  measurement: Measurement | null | undefined;
}

export function MeasurementGrid({ measurement }: MeasurementGridProps) {
  if (!measurement) {
    return <p className="text-sm text-muted-foreground italic">No measurements recorded</p>;
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {MEASUREMENT_FIELDS.map(({ key, label }) => {
        const val = measurement[key];
        if (!val) return null;
        return (
          <div key={key} className="bg-muted/40 rounded-lg p-2 text-center">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
            <p className="text-sm font-bold tabular-nums">{Number(val).toFixed(1)}</p>
          </div>
        );
      })}
    </div>
  );
}
