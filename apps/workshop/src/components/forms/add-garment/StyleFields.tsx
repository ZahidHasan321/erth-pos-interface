import { useFormContext, Controller } from "react-hook-form";
import { Label } from "@repo/ui/label";
import { Input } from "@repo/ui/input";
import { Checkbox } from "@repo/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@repo/ui/select";
import {
  collarTypes, collarButtons, jabzourTypes, topPocketTypes, cuffTypes,
  thicknessOptions, type BaseOption,
} from "./constants";
import type { AddGarmentFormValues } from "./schema";

function OptionSelect({
  value, onChange, options, placeholder = "Select…", allowNone = false,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: BaseOption[];
  placeholder?: string;
  allowNone?: boolean;
}) {
  return (
    <Select
      value={value ?? ""}
      onValueChange={(v) => onChange(v === "__none" ? null : v)}
    >
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value="__none">— none —</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.displayText}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ThicknessPicker({
  value, onChange,
}: { value: string | null; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1">
      {thicknessOptions.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={`px-2 py-1 rounded text-xs font-semibold border transition-colors
            ${value === t.value
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background hover:bg-muted border-border"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function StyleFields() {
  const { control, register, watch, formState: { errors } } =
    useFormContext<AddGarmentFormValues>();
  const jab1 = watch("jabzour_1");

  return (
    <section className="space-y-4 bg-card border rounded-xl p-4">
      <h2 className="text-sm font-bold uppercase tracking-wider">Style</h2>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="style">Style</Label>
          <Input id="style" {...register("style")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lines">Lines</Label>
          <Input
            id="lines"
            type="number"
            min="1"
            max="3"
            {...register("lines", { valueAsNumber: true })}
          />
        </div>
      </div>

      {/* Collar */}
      <div className="border-t pt-3 space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Collar</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Controller
              control={control}
              name="collar_type"
              render={({ field }) => (
                <OptionSelect value={field.value} onChange={field.onChange} options={collarTypes} />
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Button</Label>
            <Controller
              control={control}
              name="collar_button"
              render={({ field }) => (
                <OptionSelect value={field.value} onChange={field.onChange} options={collarButtons} />
              )}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Controller
            control={control}
            name="small_tabaggi"
            render={({ field }) => (
              <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(!!v)} />
            )}
          />
          Small tabaggi
        </label>
      </div>

      {/* Jabzour */}
      <div className="border-t pt-3 space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Jabzour</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Jabzour 1</Label>
            <Controller
              control={control}
              name="jabzour_1"
              render={({ field }) => (
                <OptionSelect value={field.value} onChange={field.onChange} options={jabzourTypes} />
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Jabzour 2 {jab1 === "JAB_SHAAB" && <span className="text-red-600">*</span>}</Label>
            <Controller
              control={control}
              name="jabzour_2"
              render={({ field }) => (
                <OptionSelect
                  value={field.value} onChange={field.onChange}
                  options={jabzourTypes} allowNone
                />
              )}
            />
            {errors.jabzour_2 && (
              <p className="text-xs text-red-600">{errors.jabzour_2.message as string}</p>
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Thickness</Label>
          <Controller
            control={control}
            name="jabzour_thickness"
            render={({ field }) => (
              <ThicknessPicker value={field.value} onChange={field.onChange} />
            )}
          />
        </div>
      </div>

      {/* Front pocket */}
      <div className="border-t pt-3 space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Front pocket</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Controller
              control={control}
              name="front_pocket_type"
              render={({ field }) => (
                <OptionSelect value={field.value} onChange={field.onChange} options={topPocketTypes} />
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Thickness</Label>
            <Controller
              control={control}
              name="front_pocket_thickness"
              render={({ field }) => (
                <ThicknessPicker value={field.value} onChange={field.onChange} />
              )}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          {(["wallet_pocket", "pen_holder", "mobile_pocket"] as const).map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <Controller
                control={control}
                name={key}
                render={({ field }) => (
                  <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(!!v)} />
                )}
              />
              {key === "wallet_pocket" ? "Wallet pocket"
                : key === "pen_holder" ? "Pen holder"
                : "Mobile pocket"}
            </label>
          ))}
        </div>
      </div>

      {/* Cuffs */}
      <div className="border-t pt-3 space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Cuffs</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Controller
              control={control}
              name="cuffs_type"
              render={({ field }) => (
                <OptionSelect value={field.value} onChange={field.onChange} options={cuffTypes} />
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Thickness</Label>
            <Controller
              control={control}
              name="cuffs_thickness"
              render={({ field }) => (
                <ThicknessPicker value={field.value} onChange={field.onChange} />
              )}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
