import { useMemo } from "react";
import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  getGarmentById, getOrderGarments, createGarmentForOrder,
  type CreateGarmentInput,
} from "@/api/garments";
import {
  getMeasurementById, createMeasurement, getLatestMeasurementForCustomer,
} from "@/api/measurements";
import { Button } from "@repo/ui/button";
import { Label } from "@repo/ui/label";
import { Input } from "@repo/ui/input";
import { Skeleton } from "@repo/ui/skeleton";
import { ArrowLeft, Save, Replace, PlusCircle } from "lucide-react";
import { FabricFields } from "@/components/forms/add-garment/FabricFields";
import { StyleFields } from "@/components/forms/add-garment/StyleFields";
import { MeasurementFields } from "@/components/forms/add-garment/MeasurementFields";
import { addGarmentSchema, type AddGarmentFormValues } from "@/components/forms/add-garment/schema";
import { buildPrefillValues } from "@/components/forms/add-garment/prefill";
import type { WorkshopGarment } from "@repo/database";

interface AddGarmentSearch {
  replaces?: string;
}

export const Route = createFileRoute("/(main)/assigned/$orderId_/add-garment")({
  component: AddGarmentPage,
  head: () => ({ meta: [{ title: "Add Garment" }] }),
  validateSearch: (search: Record<string, unknown>): AddGarmentSearch => ({
    replaces: typeof search.replaces === "string" ? search.replaces : undefined,
  }),
});

function AddGarmentPage() {
  const { orderId } = Route.useParams();
  const { replaces: replacesId } = Route.useSearch();
  const router = useRouter();
  const orderIdNum = Number(orderId);

  // Replacement source: the original garment we're replacing. Its specs seed
  // the form; its measurement row is the source for the measurement clone.
  const originalQuery = useQuery({
    queryKey: ["garment", replacesId],
    queryFn: () => getGarmentById(replacesId!),
    enabled: !!replacesId,
  });

  // Order context. Used to derive customer_id for blank-add mode (so we can
  // pull the customer's latest measurements to prefill).
  const orderGarmentsQuery = useQuery({
    queryKey: ["orderGarments", orderIdNum],
    queryFn: () => getOrderGarments(orderIdNum),
    enabled: Number.isFinite(orderIdNum),
  });

  const original = (originalQuery.data ?? null) as WorkshopGarment | null;
  const anyGarment = orderGarmentsQuery.data?.[0] ?? null;
  const customerId = ((anyGarment as any)?.order?.customer?.id
    ?? (original as any)?.order?.customer?.id
    ?? null) as string | null;

  // Source measurement row: replacement → original's row, blank-add →
  // customer's latest. Null/undefined when not loaded yet.
  const sourceMeasurementId = original?.measurement_id ?? null;
  const replacementMeasurementQuery = useQuery({
    queryKey: ["measurement", sourceMeasurementId],
    queryFn: () => getMeasurementById(sourceMeasurementId!),
    enabled: !!sourceMeasurementId,
  });
  const latestMeasurementQuery = useQuery({
    queryKey: ["latestMeasurement", customerId],
    queryFn: () => getLatestMeasurementForCustomer(customerId!),
    enabled: !!customerId && !replacesId,
  });

  const seedMeasurement = replacementMeasurementQuery.data ?? latestMeasurementQuery.data ?? null;

  const loading = (replacesId && (originalQuery.isLoading || replacementMeasurementQuery.isLoading))
    || orderGarmentsQuery.isLoading
    || (!replacesId && !!customerId && latestMeasurementQuery.isLoading);

  // Prefill values — recomputed when sources change identity. Passed via
  // `values` so react-hook-form syncs the form state once the async data
  // arrives. `resetOptions.keepDirtyValues: true` preserves any fields the
  // user has already edited, so we don't wipe their work on a late refetch.
  const prefill = useMemo(
    () => buildPrefillValues(original, seedMeasurement),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [original?.id, seedMeasurement?.id],
  );

  const form = useForm<AddGarmentFormValues>({
    resolver: zodResolver(addGarmentSchema) as any,
    defaultValues: prefill,
    values: loading ? undefined : prefill,
    resetOptions: { keepDirtyValues: true },
  });

  const alreadyReplaced = !!(original as WorkshopGarment | null)?.replaced_by_garment_id;

  const submitMutation = useMutation({
    mutationFn: async (values: AddGarmentFormValues) => {
      // Build the measurement row first. We always create a NEW measurement
      // record for the garment — never edit the source row — so the source's
      // history stays intact and two garments can diverge cleanly.
      if (!customerId) throw new Error("Could not determine customer for this order");
      const { id: measurementId } = await createMeasurement(
        customerId,
        values.measurements as Record<string, unknown>,
      );

      const input: CreateGarmentInput = {
        order_id: orderIdNum,
        measurement_id: measurementId,
        garment_type: values.garment_type,
        fabric_id: values.fabric_id,
        fabric_source: values.fabric_source,
        color: values.color,
        shop_name: values.shop_name,
        fabric_length: values.fabric_length,
        style: values.style,
        collar_type: values.collar_type,
        collar_button: values.collar_button,
        cuffs_type: values.cuffs_type,
        cuffs_thickness: values.cuffs_thickness,
        front_pocket_type: values.front_pocket_type,
        front_pocket_thickness: values.front_pocket_thickness,
        wallet_pocket: values.wallet_pocket,
        pen_holder: values.pen_holder,
        mobile_pocket: values.mobile_pocket,
        small_tabaggi: values.small_tabaggi,
        jabzour_1: values.jabzour_1,
        jabzour_2: values.jabzour_2,
        jabzour_thickness: values.jabzour_thickness,
        lines: values.lines,
        soaking: values.soaking,
        express: values.express,
        delivery_date: new Date(values.delivery_date).toISOString(),
        notes: values.notes ?? null,
        quantity: 1,
        // Replacement carries schedule + plan from the original so it drops
        // into production at the same slot. Blank-add stays unscheduled.
        production_plan: replacesId ? (original?.production_plan as Record<string, string> | null ?? null) : null,
        assigned_date: values.assigned_date || null,
        assigned_unit: replacesId ? (original?.assigned_unit ?? null) : null,
        assigned_person: replacesId ? (original?.assigned_person ?? null) : null,
      };
      return createGarmentForOrder(input, replacesId);
    },
    onSuccess: () => {
      toast.success(replacesId ? "Replacement garment created" : "Garment added");
      router.navigate({ to: "/assigned/$orderId", params: { orderId } });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to save garment");
    },
  });

  const mode = replacesId ? "replace" : "add";

  const showForm = !loading && !(replacesId && !original) && !(replacesId && alreadyReplaced);

  return (
    <div className="min-h-full bg-muted/20">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to="/assigned/$orderId"
              params={{ orderId }}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Order #{orderId}</span>
            </Link>
            <div className="h-6 w-px bg-border shrink-0" />
            <div className="flex items-center gap-2 min-w-0">
              {mode === "replace" ? (
                <Replace className="w-5 h-5 text-red-600 shrink-0" />
              ) : (
                <PlusCircle className="w-5 h-5 text-primary shrink-0" />
              )}
              <h1 className="text-lg sm:text-xl font-bold truncate">
                {mode === "replace" ? "Replacement Garment" : "Add Garment"}
              </h1>
              {mode === "replace" && original && (
                <span className="hidden md:inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">
                  replaces {original.garment_id}
                </span>
              )}
            </div>
          </div>

          {showForm && (
            <div className="flex gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => router.history.back()}
              >
                Cancel
              </Button>
              <Button
                form="add-garment-form"
                type="submit"
                size="sm"
                disabled={submitMutation.isPending}
              >
                <Save className="w-4 h-4 mr-1" />
                {submitMutation.isPending ? "Saving…" : "Create garment"}
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 pb-20">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-96 rounded-xl" />
          </div>
        ) : replacesId && !original ? (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-md p-3 text-sm">
            Original garment not found.
          </div>
        ) : replacesId && alreadyReplaced ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-md p-3 text-sm">
            This garment already has a replacement — cannot create another.
          </div>
        ) : (
          <FormProvider {...form}>
            <form
              id="add-garment-form"
              onSubmit={form.handleSubmit((v) => submitMutation.mutate(v))}
              className="space-y-4"
            >
              {mode === "replace" && original && (
                <div className="bg-red-50/60 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-xl p-3 text-sm flex items-start gap-3">
                  <Replace className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div>
                      <span className="font-semibold text-red-900 dark:text-red-200">Replacing </span>
                      <span className="font-mono text-xs text-red-800 dark:text-red-300">
                        {original.garment_id} · {original.garment_type} · trip {original.trip_number}
                      </span>
                    </div>
                    <p className="text-[11px] text-red-700/80 dark:text-red-300/80 mt-0.5">
                      Original kept for history. No extra pricing — this replaces the old garment.
                    </p>
                  </div>
                </div>
              )}

              {/* Meta */}
              <section className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                <header className="px-4 py-2.5 border-b bg-muted/30">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Meta</h3>
                </header>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Garment type</Label>
                    <div className="inline-flex rounded-lg border bg-background p-0.5">
                      {(["brova", "final"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => form.setValue("garment_type", t)}
                          className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                            form.watch("garment_type") === t
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="delivery_date">Delivery date</Label>
                    <Input
                      id="delivery_date"
                      type="date"
                      {...form.register("delivery_date")}
                    />
                    {form.formState.errors.delivery_date && (
                      <p className="text-xs text-red-600">
                        {form.formState.errors.delivery_date.message as string}
                      </p>
                    )}
                  </div>
                  {mode === "replace" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="assigned_date">Assigned date</Label>
                      <Input
                        id="assigned_date"
                        type="date"
                        {...form.register("assigned_date")}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Inherits the original garment's production plan. Set a new workshop date.
                      </p>
                    </div>
                  )}
                  <div className="sm:col-span-2 lg:col-span-1 space-y-1.5">
                    <Label htmlFor="notes">Notes</Label>
                    <Input id="notes" {...form.register("notes")} placeholder="Optional" />
                  </div>
                </div>
              </section>

              <FabricFields />
              <StyleFields />
              <MeasurementFields />
            </form>
          </FormProvider>
        )}
      </div>
    </div>
  );
}
