import { memo } from "react";
import { Label } from "@repo/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/select";
import { cn } from "@/lib/utils";
import {
  collarTypes,
  collarButtons,
  jabzourTypes,
  topPocketTypes,
  cuffTypes,
  thicknessOptions,
} from "@/components/forms/fabric-selection-and-options/constants";
import {
  type StyleFields,
  jabzourToSelectValue,
  applyJabzourSelect,
} from "@/lib/feedback-finals";

const COLLAR_POSITIONS = [
  { value: "up", label: "Up" },
  { value: "down", label: "Down" },
  { value: "__standard__", label: "Std" },
] as const;

// --- Small controls -------------------------------------------------------

function StyleSelect({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  options: { value: string; displayText: string }[];
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={placeholder || "-"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.displayText}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function YesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null | undefined;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <div className="flex gap-1">
        {[
          { v: true, l: "Yes" },
          { v: false, l: "No" },
        ].map((o) => (
          <button
            key={o.l}
            type="button"
            onClick={() => onChange(o.v)}
            className={cn(
              "flex-1 h-8 rounded-md border text-xs font-medium transition-colors",
              value === o.v
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:bg-muted",
            )}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}

const thicknessSelectOptions = thicknessOptions.map((t) => ({
  value: t.value,
  displayText: t.value,
}));

// --- Per-final custom style editor ---------------------------------------

export const FinalStyleEditor = memo(function FinalStyleEditor({
  override,
  onChange,
}: {
  override: StyleFields;
  onChange: (patch: StyleFields) => void;
}) {
  const set = (patch: StyleFields) => onChange(patch);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2 rounded-md bg-muted/30 border border-border">
      <StyleSelect
        label="Collar"
        value={override.collar_type ?? null}
        options={collarTypes}
        onChange={(v) => set({ collar_type: v })}
      />
      <StyleSelect
        label="Collar button"
        value={override.collar_button ?? null}
        options={collarButtons}
        onChange={(v) => set({ collar_button: v })}
      />
      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">Collar position</Label>
        <div className="flex gap-1">
          {COLLAR_POSITIONS.map((p) => {
            const current = override.collar_position ?? "__standard__";
            const active = current === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() =>
                  set({ collar_position: p.value === "__standard__" ? null : (p.value as "up" | "down") })
                }
                className={cn(
                  "flex-1 h-8 rounded-md border text-xs font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-muted",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
      <StyleSelect
        label="Cuffs"
        value={override.cuffs_type ?? null}
        options={cuffTypes}
        onChange={(v) => set({ cuffs_type: v })}
      />
      <StyleSelect
        label="Cuffs thickness"
        value={override.cuffs_thickness ?? null}
        options={thicknessSelectOptions}
        onChange={(v) => set({ cuffs_thickness: v })}
      />
      <StyleSelect
        label="Front pocket"
        value={override.front_pocket_type ?? null}
        options={topPocketTypes}
        onChange={(v) => set({ front_pocket_type: v })}
      />
      <StyleSelect
        label="Pocket thickness"
        value={override.front_pocket_thickness ?? null}
        options={thicknessSelectOptions}
        onChange={(v) => set({ front_pocket_thickness: v })}
      />
      <StyleSelect
        label="Jabzour"
        value={jabzourToSelectValue(override) || null}
        options={jabzourTypes}
        onChange={(v) => set(applyJabzourSelect(v))}
      />
      <StyleSelect
        label="Jabzour thickness"
        value={override.jabzour_thickness ?? null}
        options={thicknessSelectOptions}
        onChange={(v) => set({ jabzour_thickness: v })}
      />
      <StyleSelect
        label="Lines"
        value={override.lines != null ? String(override.lines) : null}
        options={[
          { value: "1", displayText: "1 line" },
          { value: "2", displayText: "2 lines" },
        ]}
        onChange={(v) => set({ lines: Number(v) as 1 | 2 })}
      />
      <YesNo
        label="Small tabaggi"
        value={override.small_tabaggi}
        onChange={(v) => set({ small_tabaggi: v })}
      />
      <YesNo
        label="Wallet pocket"
        value={override.wallet_pocket}
        onChange={(v) => set({ wallet_pocket: v })}
      />
      <YesNo
        label="Pen holder"
        value={override.pen_holder}
        onChange={(v) => set({ pen_holder: v })}
      />
      <YesNo
        label="Mobile pocket"
        value={override.mobile_pocket}
        onChange={(v) => set({ mobile_pocket: v })}
      />
    </div>
  );
});
