import { useFormContext, Controller } from "react-hook-form";
import { Label } from "@repo/ui/label";
import { Input } from "@repo/ui/input";
import { Check } from "lucide-react";
import {
  collarTypes, collarButtons, jabzourTypes, topPocketTypes, cuffTypes,
  thicknessOptions, smallTabaggiImage, penIcon, phoneIcon, walletIcon,
  type BaseOption,
} from "./constants";
import type { AddGarmentFormValues } from "./schema";
import { SectionCard } from "@/components/shared/PageShell";
import { cn } from "@/lib/utils";
import { COLLAR_POSITIONS, type CollarPosition } from "@/lib/qc-spec";

export function ImageOptionGrid({
  options, value, onChange, allowClear = false, cols = "auto", disabled = false, failed = false,
}: {
  options: BaseOption[];
  value: string | null;
  onChange: (v: string | null) => void;
  allowClear?: boolean;
  cols?: "auto" | "tight";
  disabled?: boolean;
  /** When true, the selected option renders in the bad-status tone — QC fail indicator. */
  failed?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-2",
        cols === "auto"
          ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
          : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4",
      )}
    >
      {options.map((o) => {
        const selected = value === o.value;
        const showFail = selected && failed;
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(allowClear && selected ? null : o.value)}
            className={cn(
              "group relative flex flex-col items-center gap-1.5 p-2 rounded-md border bg-background transition-colors",
              !disabled && !showFail && "hover:border-primary/60",
              showFail
                ? "border-[color:var(--status-bad)] bg-[var(--status-bad-bg)]"
                : selected
                  ? "border-primary bg-primary/5"
                  : "border-border",
              disabled && "opacity-50 cursor-not-allowed",
            )}
          >
            {selected && (
              <span
                className={cn(
                  "absolute top-1 right-1 rounded-full p-0.5",
                  showFail
                    ? "bg-[color:var(--status-bad)] text-white"
                    : "bg-primary text-primary-foreground",
                )}
              >
                <Check className="w-3 h-3" />
              </span>
            )}
            {o.image ? (
              <img
                src={o.image}
                alt={o.alt ?? o.displayText}
                className="h-14 w-14 object-contain"
              />
            ) : (
              <div className="h-14 w-14 rounded-md bg-muted flex items-center justify-center text-xs text-muted-foreground">
                None
              </div>
            )}
            <span
              className={cn(
                "text-xs font-medium text-center leading-tight",
                selected ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {o.displayText}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function ThicknessPicker({
  value, onChange, disabled = false, failed = false,
}: {
  value: string | null;
  onChange: (v: string) => void;
  disabled?: boolean;
  /** When true, the selected option renders in the bad-status tone — QC fail indicator. */
  failed?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex rounded-md border bg-background p-0.5",
        disabled && "opacity-50",
        failed && "border-[color:var(--status-bad)]",
      )}
    >
      {thicknessOptions.map((t) => {
        const selected = value === t.value;
        const showFail = selected && failed;
        return (
          <button
            key={t.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(t.value)}
            title={t.full}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors min-w-[36px]",
              showFail
                ? "bg-[color:var(--status-bad)] text-white"
                : selected
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground",
              !disabled && !selected && "hover:text-foreground hover:bg-muted",
              disabled && "cursor-not-allowed",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Explicit Yes / No toggle for a present-or-absent option (§2.11). An
 * unanswered field renders in a distinct "not filled" state (dashed amber
 * border, no Yes/No selected) so the user has to make a deliberate choice
 * rather than leave a silent default. `value` is `undefined`/`null` until
 * answered.
 */
export function YesNoToggle({
  value, onChange, icon, label, disabled = false, failed = false,
}: {
  value: boolean | null | undefined;
  onChange: (v: boolean) => void;
  icon: string;
  label: string;
  disabled?: boolean;
  /** When true, render in the bad-status tone — QC fail indicator. */
  failed?: boolean;
}) {
  const answered = value === true || value === false;
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1.5 p-2.5 rounded-md border bg-background transition-colors min-w-[88px]",
        failed
          ? "border-[color:var(--status-bad)] bg-[var(--status-bad-bg)]"
          : !answered
            ? "border-dashed border-amber-400/80"
            : value
              ? "border-primary/60"
              : "border-border",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <img
        src={icon}
        alt={label}
        className={cn(
          "h-8 w-8 object-contain transition-opacity",
          value === false && "opacity-30 grayscale",
          !answered && "opacity-60",
        )}
      />
      <span
        className={cn(
          "text-xs font-medium",
          failed ? "text-[color:var(--status-bad)]" : "text-foreground",
        )}
      >
        {label}
      </span>
      <div className="inline-flex rounded-md border bg-background p-0.5">
        {([true, false] as const).map((opt) => {
          const selected = value === opt;
          return (
            <button
              key={String(opt)}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt)}
              className={cn(
                "px-2.5 py-1 rounded-[5px] text-xs font-semibold transition-colors",
                selected
                  ? failed
                    ? "bg-[color:var(--status-bad)] text-white"
                    : opt
                      ? "bg-primary text-primary-foreground"
                      : "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted",
                disabled && "cursor-not-allowed",
              )}
            >
              {opt ? "Yes" : "No"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Up / Down / Standard picker for collar position (§2.11). Unanswered renders
 * in the "not filled" state so Standard is a deliberate choice, not a default.
 * `value` is `undefined` until answered; "standard" persists as null.
 */
export function CollarPositionPicker({
  value, onChange, disabled = false, failed = false,
}: {
  value: CollarPosition | null | undefined;
  onChange: (v: CollarPosition) => void;
  disabled?: boolean;
  failed?: boolean;
}) {
  const answered = value === "up" || value === "down" || value === "standard";
  return (
    <div
      className={cn(
        "inline-flex rounded-md border bg-background p-0.5",
        disabled && "opacity-50",
        failed
          ? "border-[color:var(--status-bad)]"
          : !answered && "border-dashed border-amber-400/80",
      )}
    >
      {COLLAR_POSITIONS.map((p) => {
        const selected = value === p.value;
        const showFail = selected && failed;
        return (
          <button
            key={p.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(p.value)}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              showFail
                ? "bg-[color:var(--status-bad)] text-white"
                : selected
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground",
              !disabled && !selected && "hover:text-foreground hover:bg-muted",
              disabled && "cursor-not-allowed",
            )}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

export function StyleFields() {
  const { control, register, watch, formState: { errors } } =
    useFormContext<AddGarmentFormValues>();
  const jab1 = watch("jabzour_1");
  const showJab2 = jab1 === "JAB_SHAAB";

  return (
    <div className="space-y-4">
      <SectionCard title="General" bodyClassName="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="style">Style</Label>
            <Input id="style" {...register("style")} placeholder="kuwaiti" />
          </div>
          <div className="space-y-1.5">
            <Label>Lines</Label>
            <Controller
              control={control}
              name="lines"
              render={({ field }) => {
                const options: { value: number | null; label: string }[] = [
                  { value: null, label: "None" },
                  { value: 1, label: "1" },
                  { value: 2, label: "2" },
                ];
                return (
                  <div className="inline-flex rounded-md border bg-background p-0.5">
                    {options.map((o) => (
                      <button
                        key={o.label}
                        type="button"
                        onClick={() => field.onChange(o.value)}
                        className={cn(
                          "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
                          field.value === o.value
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                );
              }}
            />
          </div>
        </div>
      </SectionCard>

      {/* Detailed style sections — pair up on wide screens so the tailor sees
          collar + jabzour and pocket + cuffs side-by-side instead of scrolling
          through five stacked cards. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Collar" bodyClassName="space-y-3">
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Type</Label>
            <Controller
              control={control}
              name="collar_type"
              render={({ field }) => (
                <ImageOptionGrid
                  options={collarTypes}
                  value={field.value}
                  onChange={field.onChange}
                  allowClear
                  cols="tight"
                />
              )}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Button</Label>
            <Controller
              control={control}
              name="collar_button"
              render={({ field }) => (
                <ImageOptionGrid
                  options={collarButtons}
                  value={field.value}
                  onChange={field.onChange}
                  allowClear
                  cols="tight"
                />
              )}
            />
          </div>
          <div>
            <Controller
              control={control}
              name="small_tabaggi"
              render={({ field }) => (
                <YesNoToggle
                  value={field.value}
                  onChange={field.onChange}
                  icon={smallTabaggiImage}
                  label="Small Tabaggi"
                  failed={!!errors.small_tabaggi}
                />
              )}
            />
            {errors.small_tabaggi && (
              <p className="text-xs text-[color:var(--status-bad)] mt-1">{errors.small_tabaggi.message as string}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Position</Label>
            <Controller
              control={control}
              name="collar_position"
              render={({ field }) => (
                <CollarPositionPicker
                  value={field.value}
                  onChange={field.onChange}
                  failed={!!errors.collar_position}
                />
              )}
            />
            {errors.collar_position && (
              <p className="text-xs text-[color:var(--status-bad)]">{errors.collar_position.message as string}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Thickness</Label>
            <Controller
              control={control}
              name="collar_thickness"
              render={({ field }) => (
                <ThicknessPicker value={field.value} onChange={field.onChange} />
              )}
            />
          </div>
        </SectionCard>

        <SectionCard title="Jabzour" bodyClassName="space-y-3">
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Type</Label>
            <Controller
              control={control}
              name="jabzour_1"
              render={({ field }) => (
                <ImageOptionGrid
                  options={jabzourTypes}
                  value={field.value}
                  onChange={field.onChange}
                  allowClear
                  cols="tight"
                />
              )}
            />
          </div>
          {showJab2 && (
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">
                Jabzour 2 <span className="text-[color:var(--status-bad)]">*</span>
              </Label>
              <Controller
                control={control}
                name="jabzour_2"
                render={({ field }) => (
                  <ImageOptionGrid
                    options={jabzourTypes.filter((j) => j.value !== "JAB_SHAAB")}
                    value={field.value}
                    onChange={field.onChange}
                    allowClear
                    cols="tight"
                  />
                )}
              />
              {errors.jabzour_2 && (
                <p className="text-xs text-[color:var(--status-bad)]">{errors.jabzour_2.message as string}</p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Thickness</Label>
            <Controller
              control={control}
              name="jabzour_thickness"
              render={({ field }) => (
                <ThicknessPicker value={field.value} onChange={field.onChange} />
              )}
            />
          </div>
        </SectionCard>

        <SectionCard title="Front pocket" bodyClassName="space-y-3">
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Type</Label>
            <Controller
              control={control}
              name="front_pocket_type"
              render={({ field }) => (
                <ImageOptionGrid
                  options={topPocketTypes}
                  value={field.value}
                  onChange={field.onChange}
                  allowClear
                  cols="tight"
                />
              )}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Thickness</Label>
            <Controller
              control={control}
              name="front_pocket_thickness"
              render={({ field }) => (
                <ThicknessPicker value={field.value} onChange={field.onChange} />
              )}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Accessories</Label>
            <div className="flex flex-wrap gap-2">
              <Controller
                control={control}
                name="wallet_pocket"
                render={({ field }) => (
                  <YesNoToggle
                    value={field.value}
                    onChange={field.onChange}
                    icon={walletIcon}
                    label="Wallet"
                    failed={!!errors.wallet_pocket}
                  />
                )}
              />
              <Controller
                control={control}
                name="pen_holder"
                render={({ field }) => (
                  <YesNoToggle
                    value={field.value}
                    onChange={field.onChange}
                    icon={penIcon}
                    label="Pen"
                    failed={!!errors.pen_holder}
                  />
                )}
              />
              <Controller
                control={control}
                name="mobile_pocket"
                render={({ field }) => (
                  <YesNoToggle
                    value={field.value}
                    onChange={field.onChange}
                    icon={phoneIcon}
                    label="Mobile"
                    failed={!!errors.mobile_pocket}
                  />
                )}
              />
            </div>
            {(errors.wallet_pocket || errors.pen_holder || errors.mobile_pocket) && (
              <p className="text-xs text-[color:var(--status-bad)]">Choose Yes or No for each accessory.</p>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Cuffs" bodyClassName="space-y-3">
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Type</Label>
            <Controller
              control={control}
              name="cuffs_type"
              render={({ field }) => (
                <ImageOptionGrid
                  options={cuffTypes}
                  value={field.value}
                  onChange={field.onChange}
                  allowClear
                  cols="tight"
                />
              )}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Thickness</Label>
            <Controller
              control={control}
              name="cuffs_thickness"
              render={({ field }) => (
                <ThicknessPicker value={field.value} onChange={field.onChange} />
              )}
            />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
