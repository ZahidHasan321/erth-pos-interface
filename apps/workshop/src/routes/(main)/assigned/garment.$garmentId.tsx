import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useGarment } from "@/hooks/useWorkshopGarments";
import { useUpdateGarmentDetails } from "@/hooks/useGarmentMutations";
import { getAllFeedbackForGarment } from "@/api/feedback";
import { ProductionPlanDialog } from "@/components/shared/ProductionPlanDialog";
import {
  GarmentHeader,
  NotesSection,
  StyleSection,
  MeasurementsSection,
  TripCycleCard,
  TripListPanel,
} from "@/components/shared/GarmentDetailSections";
import { getGarmentEditability } from "@/lib/editability";
import { canEdit } from "@/lib/rbac";
import { useAuth } from "@/context/auth";
import { DatePicker } from "@repo/ui/date-picker";
import { ConfirmedDatePicker } from "@/components/shared/ConfirmedDatePicker";
import { Skeleton } from "@repo/ui/skeleton";
import { Button } from "@repo/ui/button";
import { ArrowLeft, Lock, Replace } from "lucide-react";
import { toLocalDateStr, pickedDayStr, formatDate } from "@/lib/utils";
import type { WorkshopGarment, TripHistoryEntry, GarmentFeedback } from "@repo/database";

export const Route = createFileRoute("/(main)/assigned/garment/$garmentId")({
  component: AssignedGarmentDetailPage,
  head: () => ({ meta: [{ title: "Garment Details" }] }),
});

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
  const [selectedTripState, setSelectedTrip] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="p-4 max-w-[1600px] mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-md" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <Skeleton className="lg:col-span-3 h-96 rounded-md" />
          <Skeleton className="lg:col-span-6 h-96 rounded-md" />
          <Skeleton className="lg:col-span-3 h-96 rounded-md" />
        </div>
      </div>
    );
  }

  if (!garment) {
    return (
      <div className="p-4 max-w-[1600px] mx-auto text-center py-24">
        <p className="text-base text-muted-foreground">Garment not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.history.back()}>
          Go back
        </Button>
      </div>
    );
  }

  const isReturn = (garment.trip_number ?? 1) > 1;
  const currentTripEntry = getCurrentTripEntry(garment);
  const reentryStage = currentTripEntry?.reentry_stage ?? null;
  const qcFailCount = currentTripEntry?.qc_attempts?.filter((a) => a.result === "fail").length ?? 0;

  const editability = getGarmentEditability(garment);

  const currentTripNum = garment.trip_number ?? 1;
  const selectedTrip = selectedTripState ?? currentTripNum;
  const selectedFeedback: GarmentFeedback | null =
    feedbackHistory.find((fb) => (fb.trip_number ?? 1) === selectedTrip) ?? null;

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
    <div className="p-3 sm:p-4 max-w-[1600px] mx-auto pb-8 space-y-4">
      {/* Top bar: back link + replacement CTA */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.history.back()}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline cursor-pointer transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to order
        </button>
        <DiscardedReplacementCta garment={garment} />
      </div>

      {/* Identity header with inline editable dates + pipeline */}
      <GarmentHeader garment={garment} showExtras reentryStage={reentryStage} qcFailCount={qcFailCount}>
        <EditableDates garment={garment} updateMut={updateMut} editability={editability} />
        {editability.readOnlyReason && !editability.canEditPlan && !editability.canEditDeliveryDate && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground sm:justify-end">
            <Lock className="w-3 h-3" />
            <span>{editability.readOnlyReason}</span>
          </div>
        )}
      </GarmentHeader>

      {/* Notes — always full-width when present, sits above the dashboard */}
      {garment.notes && <NotesSection notes={garment.notes} />}

      {/* 3-col dashboard: Specs (left) | Selected trip (center) | Trip list (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-3 min-w-0">
          <SidebarSpecs garment={garment} />
        </div>

        <div className="lg:col-span-6 min-w-0">
          <TripCycleCard
            garment={garment}
            tripNum={selectedTrip}
            feedback={selectedFeedback}
            onEditPlan={editability.canEditPlan ? () => setPlanOpen(true) : undefined}
            isLoadingFeedback={isLoadingFeedback}
          />
        </div>

        <div className="lg:col-span-3 min-w-0">
          <TripListPanel
            garment={garment}
            feedbackHistory={feedbackHistory}
            selectedTrip={selectedTrip}
            onSelect={setSelectedTrip}
          />
        </div>
      </div>

      {editability.canEditPlan && isReturn && (
        <ProductionPlanDialog
          mode="rework"
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
          title={`Edit Plan: ${garment.garment_id}`}
          lockedSteps={editability.lockedPlanSteps}
        />
      )}
      {editability.canEditPlan && !isReturn && (
        <ProductionPlanDialog
          mode="new"
          open={planOpen}
          onOpenChange={setPlanOpen}
          onConfirm={handlePlanConfirm}
          garmentCount={1}
          defaultDate={garment.assigned_date ?? undefined}
          defaultPlan={garment.production_plan as Record<string, string> | null}
          title={`Edit Plan: ${garment.garment_id}`}
          confirmLabel="Save Changes"
          lockedSteps={editability.lockedPlanSteps}
        />
      )}
    </div>
  );
}

// Sidebar tabs — Style vs Measurements. Each pane fills the column on its own
// so the sidebar doesn't stretch beyond the viewport.
function SidebarSpecs({ garment }: { garment: WorkshopGarment }) {
  const [tab, setTab] = useState<"style" | "measurements">("style");
  return (
    <div className="bg-card border border-border rounded-md overflow-hidden">
      <div role="tablist" aria-label="Garment specs" className="flex border-b border-border">
        <SidebarTab active={tab === "style"} onSelect={() => setTab("style")}>
          Style
        </SidebarTab>
        <SidebarTab active={tab === "measurements"} onSelect={() => setTab("measurements")}>
          Measurements
        </SidebarTab>
      </div>
      <div className="p-4">
        {tab === "style" ? (
          <StyleSection garment={garment} embedded />
        ) : (
          <MeasurementsSection garment={garment} embedded />
        )}
      </div>
    </div>
  );
}

function SidebarTab({
  active,
  onSelect,
  children,
}: {
  active: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      type="button"
      aria-selected={active}
      onClick={onSelect}
      className={[
        "flex-1 px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
        active
          ? "text-foreground border-b-2 border-foreground -mb-px"
          : "text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

// Surfaces only for discarded garments that already have a replacement.
function DiscardedReplacementCta({ garment }: { garment: WorkshopGarment }) {
  const { user } = useAuth();
  if (garment.piece_stage !== "discarded") return null;
  if (!canEdit(user, "/assigned")) return null;
  const replacedById = (garment as WorkshopGarment & { replaced_by_garment_id: string | null }).replaced_by_garment_id;
  if (replacedById) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-sm text-muted-foreground">
        <Replace className="w-3.5 h-3.5" /> Replacement already created
      </span>
    );
  }
  return null;
}

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
      updates: { delivery_date: pickedDayStr(d) },
    });
  };

  const handleAssignedChange = async (d: Date | null) => {
    if (!d) return;
    await updateMut.mutateAsync({
      id: garment.id,
      updates: { assigned_date: pickedDayStr(d) },
    });
  };

  const deliveryValue = garment.delivery_date ?? garment.delivery_date_order ?? null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 sm:justify-end">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Delivery</span>
        {editability.canEditDeliveryDate ? (
          <ConfirmedDatePicker
            value={garment.delivery_date ?? ""}
            onConfirm={handleDeliveryChange}
            label="garment delivery date"
            className="h-8 text-sm"
          />
        ) : (
          <span className="text-base tabular-nums">
            {deliveryValue ? formatDate(toLocalDateStr(deliveryValue)) : "-"}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Assigned</span>
        {editability.canEditPlan ? (
          <DatePicker
            value={garment.assigned_date ?? ""}
            onChange={handleAssignedChange}
            className="h-8 text-sm"
          />
        ) : (
          <span className="text-base tabular-nums">
            {garment.assigned_date ? formatDate(garment.assigned_date) : "-"}
          </span>
        )}
      </div>
    </div>
  );
}
