import { useState } from "react";
import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useGarment } from "@/hooks/useWorkshopGarments";
import { useUpdateGarmentDetails } from "@/hooks/useGarmentMutations";
import { getAllFeedbackForGarment } from "@/api/feedback";
import { PlanDialog } from "@/components/shared/PlanDialog";
import { ReturnPlanDialog } from "@/components/shared/ReturnPlanDialog";
import {
  GarmentHeader,
  NotesSection,
  TripCyclesSection,
  CollapsibleSpecsSection,
} from "@/components/shared/GarmentDetailSections";
import { getGarmentEditability } from "@/lib/editability";
import { Label } from "@repo/ui/label";
import { DatePicker } from "@repo/ui/date-picker";
import { ConfirmedDatePicker } from "@/components/shared/ConfirmedDatePicker";
import { Skeleton } from "@repo/ui/skeleton";
import { Button } from "@repo/ui/button";
import { ArrowLeft, Clock, Timer, Lock, Replace } from "lucide-react";
import { toLocalDateStr, formatDate } from "@/lib/utils";
import type { WorkshopGarment, TripHistoryEntry } from "@repo/database";

export const Route = createFileRoute("/(main)/assigned/garment/$garmentId")({
  component: AssignedGarmentDetailPage,
  head: () => ({ meta: [{ title: "Garment Details" }] }),
});

/** Extract current trip entry from trip_history */
function getCurrentTripEntry(garment: WorkshopGarment): TripHistoryEntry | null {
  const raw = garment.trip_history;
  const entries: TripHistoryEntry[] = !raw
    ? []
    : typeof raw === "string"
      ? JSON.parse(raw)
      : Array.isArray(raw)
        ? (raw as TripHistoryEntry[])
        : [];
  const tripNum = garment.trip_number ?? 1;
  return entries.find((t) => t.trip === tripNum) ?? null;
}

// ── Main Page ──────────────────────────────────────────────────

function AssignedGarmentDetailPage() {
  const { garmentId } = Route.useParams();
  const { data: garment, isLoading } = useGarment(garmentId);
  const { data: feedbackHistory = [], isLoading: isLoadingFeedback } = useQuery({
    queryKey: ["garment-feedback-all", garmentId],
    queryFn: () => getAllFeedbackForGarment(garmentId),
    enabled: !!garmentId,
    staleTime: 60_000,
  });
  const updateMut = useUpdateGarmentDetails();
  const router = useRouter();
  const [planOpen, setPlanOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (!garment) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto text-center py-24">
        <p className="text-lg font-semibold text-muted-foreground">Garment not found</p>
        <Button variant="outline" className="mt-4" onClick={() => router.history.back()}>
          Go Back
        </Button>
      </div>
    );
  }

  const hasSoaking = !!garment.soaking;
  const isReturn = (garment.trip_number ?? 1) > 1;
  const currentTripEntry = getCurrentTripEntry(garment);
  const reentryStage = currentTripEntry?.reentry_stage ?? null;
  const qcFailCount = currentTripEntry?.qc_attempts?.filter((a) => a.result === "fail").length ?? 0;

  const editability = getGarmentEditability(garment);

  const handlePlanConfirm = async (newPlan: Record<string, string>, date: string, _unit?: string, reentryStage?: string) => {
    const updates: Record<string, unknown> = {
      assigned_date: date || null,
      production_plan: newPlan,
    };
    if (reentryStage) {
      updates.piece_stage = reentryStage;
    }
    await updateMut.mutateAsync({ id: garment.id, updates });
  };

  return (
    <div className="p-3 sm:p-4 max-w-[1600px] mx-auto pb-8">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => router.history.back()}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline cursor-pointer transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Order
        </button>
        <DiscardedReplacementCta garment={garment} />
      </div>

      <GarmentHeader garment={garment} showExtras reentryStage={reentryStage} qcFailCount={qcFailCount}>
        <EditableDates garment={garment} updateMut={updateMut} editability={editability} />
        {editability.readOnlyReason && !editability.canEditPlan && !editability.canEditDeliveryDate && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
            <Lock className="w-3 h-3" />
            <span>{editability.readOnlyReason}</span>
          </div>
        )}
      </GarmentHeader>

      {/* Two-column layout on wide screens: trip cycles on left, specs/notes on right */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4 min-w-0">
          <TripCyclesSection
            garment={garment}
            feedbackHistory={feedbackHistory}
            isLoadingFeedback={isLoadingFeedback}
            onEditCurrentPlan={editability.canEditPlan ? () => setPlanOpen(true) : undefined}
          />
        </div>

        <aside className="space-y-4 min-w-0 lg:sticky lg:top-4 lg:self-start">
          {garment.notes && <NotesSection notes={garment.notes} />}
          <CollapsibleSpecsSection garment={garment} defaultOpen />
        </aside>
      </div>

      {editability.canEditPlan && isReturn && (
        <ReturnPlanDialog
          open={planOpen}
          onOpenChange={setPlanOpen}
          onConfirm={handlePlanConfirm}
          garmentCount={1}
          defaultDate={garment.assigned_date ?? undefined}
          workerHistory={garment.worker_history as Record<string, string> | null}
          feedbackStatus={garment.feedback_status}
          tripNumber={garment.trip_number}
          feedbackNotes={garment.notes}
          garmentId={garment.id}
          tripHistory={garment.trip_history as TripHistoryEntry[] | string | null | undefined}
          title={`Edit Plan — ${garment.garment_id}`}
          lockedSteps={editability.lockedPlanSteps}
        />
      )}
      {editability.canEditPlan && !isReturn && (
        <PlanDialog
          open={planOpen}
          onOpenChange={setPlanOpen}
          onConfirm={handlePlanConfirm}
          garmentCount={1}
          defaultDate={garment.assigned_date ?? undefined}
          defaultPlan={garment.production_plan as Record<string, string> | null}
          title={`Edit Plan — ${garment.garment_id}`}
          confirmLabel="Save Changes"
          hasSoaking={hasSoaking}
          lockedSteps={editability.lockedPlanSteps}
        />
      )}
    </div>
  );
}

// ── Discarded replacement CTA ──────────────────────────────────
// Only surfaces for discarded garments. If the garment has already been
// replaced, show a disabled pill instead of the button — prevents a second
// replacement and makes the wire-up visible.

function DiscardedReplacementCta({ garment }: { garment: WorkshopGarment }) {
  if (garment.piece_stage !== "discarded") return null;
  const replacedById = (garment as WorkshopGarment & { replaced_by_garment_id: string | null }).replaced_by_garment_id;
  if (replacedById) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-muted text-xs font-semibold text-muted-foreground">
        <Replace className="w-3 h-3" /> Replacement already created
      </span>
    );
  }
  return (
    <Button asChild variant="destructive" size="sm">
      <Link
        to="/assigned/$orderId/add-garment"
        params={{ orderId: String(garment.order_id) }}
        search={{ replaces: garment.id }}
      >
        <Replace className="w-4 h-4 mr-1" />
        Create replacement
      </Link>
    </Button>
  );
}

// ── Editable Dates ─────────────────────────────────────────────

function EditableDates({
  garment,
  updateMut,
  editability,
}: {
  garment: WorkshopGarment;
  updateMut: ReturnType<typeof useUpdateGarmentDetails>;
  editability: ReturnType<typeof getGarmentEditability>;
}) {
  const handleDeliveryChange = async (d: Date) => {
    await updateMut.mutateAsync({
      id: garment.id,
      updates: { delivery_date: toLocalDateStr(d) },
    });
  };

  const handleAssignedChange = async (d: Date | null) => {
    if (!d) return;
    await updateMut.mutateAsync({
      id: garment.id,
      updates: { assigned_date: toLocalDateStr(d) },
    });
  };

  const deliveryValue = garment.delivery_date ?? garment.delivery_date_order ?? null;

  return (
    <div className="flex flex-wrap gap-3 justify-end">
      <div className="space-y-1">
        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <Clock className="w-3 h-3" /> Garment Delivery
        </Label>
        {editability.canEditDeliveryDate ? (
          <ConfirmedDatePicker
            value={garment.delivery_date ?? ""}
            onConfirm={handleDeliveryChange}
            label="garment delivery date"
            className="h-8 text-sm font-semibold"
          />
        ) : (
          <div className="h-8 flex items-center text-sm font-semibold text-amber-700">
            {deliveryValue ? formatDate(toLocalDateStr(deliveryValue)) : "—"}
          </div>
        )}
      </div>
      <div className="space-y-1">
        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <Timer className="w-3 h-3" /> Assigned
        </Label>
        {editability.canEditPlan ? (
          <DatePicker
            value={garment.assigned_date ?? ""}
            onChange={handleAssignedChange}
            className="h-8 text-sm font-semibold"
          />
        ) : (
          <div className="h-8 flex items-center text-sm font-semibold text-violet-700">
            {garment.assigned_date ? formatDate(garment.assigned_date) : "—"}
          </div>
        )}
      </div>
    </div>
  );
}
