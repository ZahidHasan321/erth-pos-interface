import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useGarment } from "@/hooks/useWorkshopGarments";
import { useUpdateGarmentDetails } from "@/hooks/useGarmentMutations";
import { PlanDialog } from "@/components/shared/PlanDialog";
import {
  GarmentHeader,
  StyleSection,
  WorkerHistorySection,
  MeasurementsSection,
  NotesSection,
  TripHistorySection,
} from "@/components/shared/GarmentDetailSections";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, Clock, Timer } from "lucide-react";
import type { WorkshopGarment } from "@repo/database";

export const Route = createFileRoute("/(main)/assigned/garment/$garmentId")({
  component: AssignedGarmentDetailPage,
  head: () => ({ meta: [{ title: "Garment Details" }] }),
});

// ── Main Page ──────────────────────────────────────────────────

function AssignedGarmentDetailPage() {
  const { garmentId } = Route.useParams();
  const { data: garment, isLoading } = useGarment(garmentId);
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

  const handlePlanConfirm = async (newPlan: Record<string, string>, date: string) => {
    await updateMut.mutateAsync({
      id: garment.id,
      updates: {
        assigned_date: date || null,
        production_plan: newPlan,
      },
    });
    toast.success(`${garment.garment_id ?? "Garment"} plan updated`);
  };

  return (
    <div className="p-3 sm:p-4 max-w-7xl mx-auto pb-8">
      <button
        onClick={() => router.history.back()}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline cursor-pointer transition-colors mb-3"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Order
      </button>

      <GarmentHeader garment={garment} showExtras>
        <EditableDates garment={garment} updateMut={updateMut} />
      </GarmentHeader>

      {/* Content — 3 columns on lg */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
        <StyleSection garment={garment} />
        <WorkerHistorySection garment={garment} onEditPlan={() => setPlanOpen(true)} />
        <MeasurementsSection garment={garment} />
      </div>

      {garment.notes && (
        <div className="mt-3">
          <NotesSection notes={garment.notes} />
        </div>
      )}

      {garment.trip_history && (garment.trip_history as any[]).length > 0 && (
        <div className="mt-3">
          <TripHistorySection tripHistory={garment.trip_history} />
        </div>
      )}

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
      />
    </div>
  );
}

// ── Editable Dates ─────────────────────────────────────────────

function EditableDates({
  garment,
  updateMut,
}: {
  garment: WorkshopGarment;
  updateMut: ReturnType<typeof useUpdateGarmentDetails>;
}) {
  const handleDeliveryChange = async (d: Date | null) => {
    if (!d) return;
    await updateMut.mutateAsync({
      id: garment.id,
      updates: { delivery_date: d.toISOString().slice(0, 10) },
    });
    toast.success("Delivery date updated");
  };

  const handleAssignedChange = async (d: Date | null) => {
    if (!d) return;
    await updateMut.mutateAsync({
      id: garment.id,
      updates: { assigned_date: d.toISOString().slice(0, 10) },
    });
    toast.success("Assigned date updated");
  };

  return (
    <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-dashed">
      <div className="space-y-1">
        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <Clock className="w-3 h-3" /> Garment Delivery
        </Label>
        <DatePicker
          value={garment.delivery_date ?? ""}
          onChange={handleDeliveryChange}
          className="h-8 text-sm font-semibold"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <Timer className="w-3 h-3" /> Assigned
        </Label>
        <DatePicker
          value={garment.assigned_date ?? ""}
          onChange={handleAssignedChange}
          className="h-8 text-sm font-semibold"
        />
      </div>
    </div>
  );
}

