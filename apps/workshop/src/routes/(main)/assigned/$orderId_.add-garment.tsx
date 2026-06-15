import { useMemo } from "react";
import { createFileRoute, redirect, useRouter, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  getGarmentById, getOrderCustomerId, createGarmentForOrder,
  type CreateGarmentInput,
} from "@/api/garments";
import {
  getMeasurementById, createMeasurement, getLatestMeasurementForCustomer,
} from "@/api/measurements";
import { getAllFeedbackForGarment } from "@/api/feedback";
import { Button } from "@repo/ui/button";
import { Label } from "@repo/ui/label";
import { Input } from "@repo/ui/input";
import { Skeleton } from "@repo/ui/skeleton";
import { ArrowLeft, Save, Replace, PlusCircle, MessageSquare } from "lucide-react";
import { FabricFields } from "@/components/forms/add-garment/FabricFields";
import { StyleFields } from "@/components/forms/add-garment/StyleFields";
import { MeasurementFields } from "@/components/forms/add-garment/MeasurementFields";
import { addGarmentSchema, type AddGarmentFormValues } from "@/components/forms/add-garment/schema";
import { buildPrefillValues } from "@/components/forms/add-garment/prefill";
import { CustomerFeedbackPanel } from "@/components/shared/GarmentDetailSections";
import { SectionCard, StatusBanner } from "@/components/shared/PageShell";
import { canEdit } from "@/lib/rbac";
import { serializeCollarPosition } from "@/lib/qc-spec";
import { cn } from "@/lib/utils";
import type { WorkshopGarment } from "@repo/database";

interface AddGarmentSearch {
  replaces?: string;
}

export const Route = createFileRoute("/(main)/assigned/$orderId_/add-garment")({
  // Parent /(main) already gates by canAccess on the /assigned matrix entry,
  // which returns true for "view" — so view-only roles (manager:shop,
  // staff:workshop) can reach this page through the matrix. Adding garments
  // is an edit action, so re-check at this route with canEdit and bounce
  // view-only users to the order detail page.
  beforeLoad: ({ context, params }) => {
    const user = (context.auth as any).user ?? null;
    if (!canEdit(user, "/assigned")) {
      throw redirect({
        to: "/assigned/$orderId",
        params: { orderId: params.orderId },
      });
    }
  },
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

  // Order context. We need customer_id to clone/create measurements and to
  // fetch the customer's latest measurement in blank-add mode. Garment detail
  // queries flatten `order` away, so read it directly from the orders row.
  const orderCustomerQuery = useQuery({
    queryKey: ["orderCustomerId", orderIdNum],
    queryFn: () => getOrderCustomerId(orderIdNum),
    enabled: Number.isFinite(orderIdNum),
  });

  const original = (originalQuery.data ?? null) as WorkshopGarment | null;
  const customerId = orderCustomerQuery.data != null ? String(orderCustomerQuery.data) : null;

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

  // Feedback history for the original garment — surfaces *why* this redo was
  // triggered (rejection reason, measurement diffs, customer notes).
  const feedbackQuery = useQuery({
    queryKey: ["garmentFeedbackAll", replacesId],
    queryFn: () => getAllFeedbackForGarment(replacesId!),
    enabled: !!replacesId,
  });
  const feedbackHistory = feedbackQuery.data ?? [];

  const seedMeasurement = replacementMeasurementQuery.data ?? latestMeasurementQuery.data ?? null;

  const loading = (replacesId && (originalQuery.isLoading || replacementMeasurementQuery.isLoading))
    || orderCustomerQuery.isLoading
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
        {
          ...(values.measurements as Record<string, unknown>),
          // Categorical body measurements — live on the measurement row alongside
          // the numeric dimensions (see schema shoulderSlopeEnum / collarPositionEnum).
          shoulder_slope: values.shoulder_slope ?? null,
          collar_position: serializeCollarPosition(values.collar_position) ?? null,
        },
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
        collar_thickness: values.collar_thickness,
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
        lines: values.lines ?? undefined,
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
      {/* Sticky header — order link, page title, primary actions. The title
          stays compact (text-base) so the sticky bar doesn't dominate the
          viewport on smaller workshop monitors. */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
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
                <Replace className="w-4 h-4 text-[color:var(--status-bad)] shrink-0" />
              ) : (
                <PlusCircle className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
              <h1 className="text-base font-medium truncate">
                {mode === "replace" ? "Replacement garment" : "Add garment"}
              </h1>
              {mode === "replace" && original && (
                <span className="hidden md:inline text-sm text-muted-foreground tabular-nums">
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

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5 pb-20">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 rounded-md" />
            <Skeleton className="h-48 rounded-md" />
            <Skeleton className="h-96 rounded-md" />
          </div>
        ) : replacesId && !original ? (
          <StatusBanner tone="bad">Original garment not found.</StatusBanner>
        ) : replacesId && alreadyReplaced ? (
          <StatusBanner tone="warn">
            This garment already has a replacement. Cannot create another.
          </StatusBanner>
        ) : (
          <FormProvider {...form}>
            <form
              id="add-garment-form"
              onSubmit={form.handleSubmit((v) => submitMutation.mutate(v))}
              className={cn(
                // Replace mode runs a 2-col grid (context rail + form).
                // Blank-add keeps a single centered column.
                mode === "replace"
                  ? "grid grid-cols-1 lg:grid-cols-12 gap-4"
                  : "max-w-4xl mx-auto space-y-4",
              )}
            >
              {mode === "replace" && original && (
                <aside className="lg:col-span-4 space-y-4 lg:sticky lg:top-[72px] lg:self-start lg:max-h-[calc(100vh-88px)] lg:overflow-y-auto">
                  <ReplacesSummary original={original} />
                  {feedbackHistory.length > 0 && (
                    <SectionCard
                      title={`Why this redo · ${feedbackHistory.length}`}
                      bodyClassName="space-y-4"
                    >
                      {feedbackHistory.map((fb) => (
                        <CustomerFeedbackPanel key={fb.id} fb={fb} />
                      ))}
                    </SectionCard>
                  )}
                  {feedbackHistory.length === 0 && (
                    <SectionCard title="Why this redo">
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <MessageSquare className="w-4 h-4" />
                        No feedback recorded for this garment.
                      </p>
                    </SectionCard>
                  )}
                </aside>
              )}

              <div className={cn("space-y-4", mode === "replace" && "lg:col-span-8")}>
                <SectionCard
                  title="Garment meta"
                  bodyClassName="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
                >
                  <div className="space-y-1.5">
                    <Label>Garment type</Label>
                    <div className="inline-flex rounded-md border bg-background p-0.5">
                      {(["brova", "final"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => form.setValue("garment_type", t)}
                          className={cn(
                            "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
                            form.watch("garment_type") === t
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-muted",
                          )}
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
                      <p className="text-xs text-[color:var(--status-bad)]">
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
                      <p className="text-sm text-muted-foreground">
                        Inherits the original garment's plan. Set a new workshop date.
                      </p>
                    </div>
                  )}
                  <div className="sm:col-span-2 lg:col-span-3 space-y-1.5">
                    <Label htmlFor="notes">Notes</Label>
                    <Input id="notes" {...form.register("notes")} placeholder="Optional" />
                  </div>
                </SectionCard>

                <FabricFields />
                <StyleFields />
                <MeasurementFields />
              </div>
            </form>
          </FormProvider>
        )}
      </div>
    </div>
  );
}

// ── Context rail: replaces summary ──────────────────────────────────────────
// Quick-reference card of what the original garment was — type, trip, fabric,
// style summary. Sits at the top of the left rail so the tailor knows what
// the prefill is based on without scrolling through the form.

function ReplacesSummary({ original }: { original: WorkshopGarment }) {
  const fabric = original.fabric_source === "OUT"
    ? `OUT · ${original.shop_name || "-"}`
    : `IN · #${original.fabric_id ?? "-"}`;
  const color = original.color || null;
  const length = original.fabric_length != null ? `${original.fabric_length} m` : null;

  return (
    <SectionCard title="Replaces" bodyClassName="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-base font-medium tabular-nums">{original.garment_id}</span>
        <span className="text-sm text-muted-foreground capitalize">{original.garment_type}</span>
        {original.trip_number != null && (
          <span className="text-sm text-muted-foreground tabular-nums">
            · trip {original.trip_number}
          </span>
        )}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Fabric</dt>
        <dd className="text-foreground">{fabric}</dd>
        {color && (
          <>
            <dt className="text-muted-foreground">Color</dt>
            <dd className="text-foreground">{color}</dd>
          </>
        )}
        {length && (
          <>
            <dt className="text-muted-foreground">Length</dt>
            <dd className="text-foreground tabular-nums">{length}</dd>
          </>
        )}
        {original.style && (
          <>
            <dt className="text-muted-foreground">Style</dt>
            <dd className="text-foreground">{original.style}</dd>
          </>
        )}
      </dl>
      <p className="text-sm text-muted-foreground border-t border-border pt-2.5">
        Original kept for history. No extra pricing. This replaces the old garment.
      </p>
    </SectionCard>
  );
}
