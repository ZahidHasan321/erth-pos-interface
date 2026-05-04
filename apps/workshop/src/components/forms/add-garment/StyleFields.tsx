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
import { cn } from "@/lib/utils";

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <header className="px-4 py-2.5 border-b bg-muted/30">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
      </header>
      <div className="p-4 space-y-4">{children}</div>
    </section>
  );
}

export function ImageOptionGrid({
  options, value, onChange, allowClear = false, cols = "auto", disabled = false,
}: {
  options: BaseOption[];
  value: string | null;
  onChange: (v: string | null) => void;
  allowClear?: boolean;
  cols?: "auto" | "tight";
  disabled?: boolean;
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
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(allowClear && selected ? null : o.value)}
            className={cn(
              "group relative flex flex-col items-center gap-1.5 p-2 rounded-lg border-2 bg-background transition-all",
              !disabled && "hover:border-primary/60 hover:shadow-sm",
              selected
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-border",
              disabled && "opacity-50 cursor-not-allowed",
            )}
          >
            {selected && (
              <span className="absolute top-1 right-1 rounded-full bg-primary text-primary-foreground p-0.5 shadow">
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
              <div className="h-14 w-14 rounded-md bg-muted flex items-center justify-center text-[10px] text-muted-foreground font-semibold uppercase">
                None
              </div>
            )}
            <span
              className={cn(
                "text-[11px] font-medium text-center leading-tight",
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
  value, onChange, disabled = false,
}: { value: string | null; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div
      className={cn(
        "inline-flex rounded-lg border bg-background p-0.5",
        disabled && "opacity-50",
      )}
    >
      {thicknessOptions.map((t) => {
        const selected = value === t.value;
        return (
          <button
            key={t.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(t.value)}
            title={t.full}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-bold transition-colors min-w-[36px]",
              selected
                ? "bg-primary text-primary-foreground shadow-sm"
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

export function IconToggle({
  checked, onChange, icon, label, disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  icon: string;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative flex flex-col items-center gap-1 p-2.5 rounded-lg border-2 bg-background transition-all min-w-[72px]",
        !disabled && "hover:border-primary/60",
        checked ? "border-primary bg-primary/5" : "border-border",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      {checked && (
        <span className="absolute top-1 right-1 rounded-full bg-primary text-primary-foreground p-0.5">
          <Check className="w-3 h-3" />
        </span>
      )}
      <img src={icon} alt={label} className="h-8 w-8 object-contain" />
      <span
        className={cn(
          "text-[10px] font-medium",
          checked ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </button>
  );
}

export function StyleFields() {
  const { control, register, watch, formState: { errors } } =
    useFormContext<AddGarmentFormValues>();
  const jab1 = watch("jabzour_1");
  const showJab2 = jab1 === "JAB_SHAAB";

  return (
    <div className="space-y-4">
      <SectionCard title="General">
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
                  <div className="inline-flex rounded-lg border bg-background p-0.5">
                    {options.map((o) => (
                      <button
                        key={o.label}
                        type="button"
                        onClick={() => field.onChange(o.value)}
                        className={cn(
                          "px-4 py-1.5 rounded-md text-sm font-bold transition-colors",
                          field.value === o.value
                            ? "bg-primary text-primary-foreground shadow-sm"
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

      <SectionCard title="Collar">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Type</Label>
          <Controller
            control={control}
            name="collar_type"
            render={({ field }) => (
              <ImageOptionGrid
                options={collarTypes}
                value={field.value}
                onChange={field.onChange}
                allowClear
              />
            )}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Button</Label>
          <Controller
            control={control}
            name="collar_button"
            render={({ field }) => (
              <ImageOptionGrid
                options={collarButtons}
                value={field.value}
                onChange={field.onChange}
                allowClear
              />
            )}
          />
        </div>
        <div>
          <Controller
            control={control}
            name="small_tabaggi"
            render={({ field }) => (
              <IconToggle
                checked={!!field.value}
                onChange={field.onChange}
                icon={smallTabaggiImage}
                label="Small Tabaggi"
              />
            )}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Position</Label>
          <Controller
            control={control}
            name="collar_position"
            render={({ field }) => (
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={field.value === "up"}
                    onChange={(e) => field.onChange(e.target.checked ? "up" : null)}
                  />
                  UP
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={field.value === "down"}
                    onChange={(e) => field.onChange(e.target.checked ? "down" : null)}
                  />
                  DOWN
                </label>
                <span className="text-xs text-muted-foreground self-center">
                  (none = ordinary)
                </span>
              </div>
            )}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Thickness</Label>
          <Controller
            control={control}
            name="collar_thickness"
            render={({ field }) => (
              <ThicknessPicker value={field.value} onChange={field.onChange} />
            )}
          />
        </div>
      </SectionCard>

      <SectionCard title="Jabzour">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Type</Label>
          <Controller
            control={control}
            name="jabzour_1"
            render={({ field }) => (
              <ImageOptionGrid
                options={jabzourTypes}
                value={field.value}
                onChange={field.onChange}
                allowClear
              />
            )}
          />
        </div>
        {showJab2 && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Jabzour 2 <span className="text-red-600">*</span>
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
                />
              )}
            />
            {errors.jabzour_2 && (
              <p className="text-xs text-red-600">{errors.jabzour_2.message as string}</p>
            )}
          </div>
        )}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Thickness</Label>
          <Controller
            control={control}
            name="jabzour_thickness"
            render={({ field }) => (
              <ThicknessPicker value={field.value} onChange={field.onChange} />
            )}
          />
        </div>
      </SectionCard>

      <SectionCard title="Front pocket">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Type</Label>
          <Controller
            control={control}
            name="front_pocket_type"
            render={({ field }) => (
              <ImageOptionGrid
                options={topPocketTypes}
                value={field.value}
                onChange={field.onChange}
                allowClear
              />
            )}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Thickness</Label>
          <Controller
            control={control}
            name="front_pocket_thickness"
            render={({ field }) => (
              <ThicknessPicker value={field.value} onChange={field.onChange} />
            )}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Accessories</Label>
          <div className="flex flex-wrap gap-2">
            <Controller
              control={control}
              name="wallet_pocket"
              render={({ field }) => (
                <IconToggle
                  checked={!!field.value}
                  onChange={field.onChange}
                  icon={walletIcon}
                  label="Wallet"
                />
              )}
            />
            <Controller
              control={control}
              name="pen_holder"
              render={({ field }) => (
                <IconToggle
                  checked={!!field.value}
                  onChange={field.onChange}
                  icon={penIcon}
                  label="Pen"
                />
              )}
            />
            <Controller
              control={control}
              name="mobile_pocket"
              render={({ field }) => (
                <IconToggle
                  checked={!!field.value}
                  onChange={field.onChange}
                  icon={phoneIcon}
                  label="Mobile"
                />
              )}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Cuffs">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Type</Label>
          <Controller
            control={control}
            name="cuffs_type"
            render={({ field }) => (
              <ImageOptionGrid
                options={cuffTypes}
                value={field.value}
                onChange={field.onChange}
                allowClear
              />
            )}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Thickness</Label>
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
  );
}
