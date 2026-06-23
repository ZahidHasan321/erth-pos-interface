import * as React from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  addMonths,
  format,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Button } from "@repo/ui/button";
import { AllBrandsList } from "@/components/appointments/all-brands-list";
import {
  useAllBrandsAppointments,
  useUpdateAppointmentStatus,
} from "@/hooks/useAppointments";
import { BRAND_NAMES } from "@/lib/constants";
import type { Appointment } from "@repo/database";

export const Route = createFileRoute("/$main/appointments-list/")({
  // Cross-brand list is the ERTH (showroom) shop's coordination surface only.
  beforeLoad: ({ params }) => {
    if (params.main !== BRAND_NAMES.showroom) {
      throw redirect({ to: "/$main", params: { main: params.main } });
    }
  },
  component: AppointmentsListPage,
});

function AppointmentsListPage() {
  const [currentMonth, setCurrentMonth] = React.useState(new Date());

  const startDate = format(startOfMonth(currentMonth), "yyyy-MM-dd");
  const endDate = format(endOfMonth(currentMonth), "yyyy-MM-dd");

  const { data: appointments = [], isLoading } = useAllBrandsAppointments(
    startDate,
    endDate,
  );

  const { mutate: updateStatus, isPending: isUpdating } = useUpdateAppointmentStatus();

  function navigateMonth(direction: number) {
    setCurrentMonth((prev) => addMonths(prev, direction));
  }

  function handleStatusChange(id: string, status: Appointment["status"]) {
    updateStatus({ id, status });
  }

  const monthLabel = format(currentMonth, "MMMM yyyy");

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)] p-3 sm:p-4 gap-3 sm:gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary hidden sm:block" />
          <h1 className="text-xl font-bold tracking-tight">Appointments</h1>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => navigateMonth(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <button
            type="button"
            className="text-sm font-medium px-3 py-1 rounded-md hover:bg-accent transition-colors cursor-pointer min-w-[140px] text-center"
            onClick={() => setCurrentMonth(new Date())}
          >
            {monthLabel}
          </button>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => navigateMonth(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 min-h-0">
        <AllBrandsList
          appointments={appointments}
          isLoading={isLoading}
          onStatusChange={handleStatusChange}
          isUpdating={isUpdating}
        />
      </div>
    </div>
  );
}
