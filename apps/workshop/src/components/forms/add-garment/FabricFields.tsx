import { useFormContext, Controller } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { getFabrics } from "@/api/fabrics";
import { Label } from "@repo/ui/label";
import { Input } from "@repo/ui/input";
import { Checkbox } from "@repo/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@repo/ui/select";
import type { AddGarmentFormValues } from "./schema";

export function FabricFields() {
  const { control, register, watch, setValue, formState: { errors } } =
    useFormContext<AddGarmentFormValues>();
  const source = watch("fabric_source");
  const { data: fabrics = [], isLoading: loadingFabrics } = useQuery({
    queryKey: ["fabrics"],
    queryFn: getFabrics,
  });

  return (
    <section className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <header className="px-4 py-2.5 border-b bg-muted/30">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Fabric</h3>
      </header>
      <div className="p-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <Label>Source</Label>
          <Controller
            control={control}
            name="fabric_source"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(v) => {
                  field.onChange(v);
                  // Clear the inactive side so stale validation doesn't block submit.
                  if (v === "IN") setValue("shop_name", "");
                  if (v === "OUT") setValue("fabric_id", null);
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN">Inventory (IN)</SelectItem>
                  <SelectItem value="OUT">Customer-provided (OUT)</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>

        {source === "IN" ? (
          <div className="space-y-1.5">
            <Label>Fabric</Label>
            <Controller
              control={control}
              name="fabric_id"
              render={({ field }) => (
                <Select
                  value={field.value == null ? "" : String(field.value)}
                  onValueChange={(v) => field.onChange(v === "" ? null : Number(v))}
                  disabled={loadingFabrics}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingFabrics ? "Loading…" : "Pick fabric"} />
                  </SelectTrigger>
                  <SelectContent>
                    {fabrics.map((f) => (
                      <SelectItem key={f.id} value={String(f.id)}>
                        {f.name}{f.color ? ` — ${f.color}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.fabric_id && (
              <p className="text-xs text-red-600">{errors.fabric_id.message as string}</p>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="shop_name">Shop name</Label>
            <Input id="shop_name" {...register("shop_name")} />
            {errors.shop_name && (
              <p className="text-xs text-red-600">{errors.shop_name.message as string}</p>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="color">Color</Label>
          <Input id="color" {...register("color")} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fabric_length">Length (m)</Label>
          <Input
            id="fabric_length"
            type="number"
            step="0.01"
            min="0"
            {...register("fabric_length", {
              setValueAs: (v) => (v === "" || v == null ? null : Number(v)),
            })}
          />
          {errors.fabric_length && (
            <p className="text-xs text-red-600">{errors.fabric_length.message as string}</p>
          )}
        </div>
      </div>

      <div className="flex gap-6 pt-1">
        <label className="flex items-center gap-2 text-sm">
          <Controller
            control={control}
            name="soaking"
            render={({ field }) => (
              <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(!!v)} />
            )}
          />
          Soaking
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Controller
            control={control}
            name="express"
            render={({ field }) => (
              <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(!!v)} />
            )}
          />
          Express
        </label>
      </div>
      </div>
    </section>
  );
}
