import { useEffect, useMemo } from "react";
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

export const Route = createFileRoute("/(main)/assigned/$orderId/add-garment")({
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

  const form = useForm<AddGarmentFormValues>({
    resolver: zodResolver(addGarmentSchema) as any,
    defaultValues: useMemo(
      () => buildPrefillValues(original, seedMeasurement),
      // Re-prefill only when the source identities change — not on every
      // query refetch, which would wipe user edits.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [original?.id, seedMeasurement?.id],
    ),
  });

  // When async data arrives after mount, reset the form once with the
  // freshly computed prefill. Subsequent user edits are preserved.
  useEffect(() => {
    if (loading) return;
    form.reset(buildPrefillValues(original, seedMeasurement));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [original?.id, seedMeasurement?.id, loading]);

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

  return (
    <div className="p-4 sm:p-6 pb-10 max-w-5xl mx-auto">
      <div className="mb-4">
        <Link
          to="/assigned/$orderId"
          params={{ orderId }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Back to order #{orderId}
        </Link>
      </div>

      <div className="flex items-center gap-2 mb-4">
        {mode === "replace" ? (
          <Replace className="w-5 h-5 text-red-600" />
        ) : (
          <PlusCircle className="w-5 h-5 text-blue-600" />
        )}
        <h1 className="text-xl font-bold">
          {mode === "replace" ? "Create Replacement Garment" : "Add Garment"}
        </h1>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
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
            onSubmit={form.handleSubmit((v) => submitMutation.mutate(v))}
            className="space-y-4"
          >
            {mode === "replace" && original && (
              <div className="bg-muted/30 rounded-md p-3 text-sm border">
                <div className="font-semibold mb-1">Replacing</div>
                <div className="font-mono text-xs">
                  {original.garment_id} · {original.garment_type} · trip {original.trip_number}
                </div>
              </div>
            )}

            {/* Meta */}
            <section className="space-y-4 bg-card border rounded-xl p-4">
              <h2 className="text-sm font-bold uppercase tracking-wider">Meta</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Garment type</Label>
                  <div className="flex gap-2">
                    {(["brova", "final"] as const).map((t) => (
                      <Button
                        key={t}
                        type="button"
                        variant={form.watch("garment_type") === t ? "default" : "outline"}
                        size="sm"
                        onClick={() => form.setValue("garment_type", t)}
                      >
                        {t}
                      </Button>
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
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="notes">Notes</Label>
                  <Input id="notes" {...form.register("notes")} placeholder="Optional" />
                </div>
              </div>
            </section>

            <FabricFields />
            <StyleFields />
            <MeasurementFields />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.history.back()}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitMutation.isPending}
              >
                <Save className="w-4 h-4 mr-1" />
                {submitMutation.isPending ? "Saving…" : "Create garment"}
              </Button>
            </div>
          </form>
        </FormProvider>
      )}
    </div>
  );
}
