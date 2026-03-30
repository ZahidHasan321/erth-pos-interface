import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  addDays,
  startOfWeek,
  format,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WeekView } from "@/components/appointments/week-view";
import { DayView } from "@/components/appointments/day-view";
import { BookingSheet } from "@/components/appointments/booking-sheet";
import { DetailSheet } from "@/components/appointments/detail-sheet";
import { LinkOrderDialog } from "@/components/appointments/link-order-dialog";
import { useAppointments, useBrandEmployees } from "@/hooks/useAppointments";
import type { AppointmentWithRelations } from "@/api/appointments";

export const Route = createFileRoute("/$main/appointments/")({
  component: AppointmentsPage,
});

type ViewMode = "week" | "day";

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(
    () => typeof window !== "undefined" && window.innerWidth < 768,
  );
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

function getWeekDates(anchorDate: Date): Date[] {
  const start = startOfWeek(anchorDate, { weekStartsOn: 6 });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function AppointmentsPage() {
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = React.useState<ViewMode>(isMobile ? "day" : "week");
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [employeeFilter, setEmployeeFilter] = React.useState("");
  const [datePickerOpen, setDatePickerOpen] = React.useState(false);

  // Sync view mode when crossing breakpoint
  React.useEffect(() => {
    if (isMobile && viewMode === "week") setViewMode("day");
  }, [isMobile]);

  // Dialog state
  const [bookingOpen, setBookingOpen] = React.useState(false);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [linkOrderOpen, setLinkOrderOpen] = React.useState(false);
  const [selectedAppointment, setSelectedAppointment] = React.useState<AppointmentWithRelations | null>(null);
  const [editingAppointment, setEditingAppointment] = React.useState<AppointmentWithRelations | null>(null);
  const [defaultBookingDate, setDefaultBookingDate] = React.useState<Date | undefined>();
  const [defaultBookingTime, setDefaultBookingTime] = React.useState<string | undefined>();

  // Get current user for booked_by
  const rawUser = localStorage.getItem("tanstack.auth.user");
  const currentUser = rawUser ? JSON.parse(rawUser) : null;
  const bookedByUserId = currentUser?.id ?? "";

  // Compute date range for query
  const weekDates = React.useMemo(() => getWeekDates(currentDate), [currentDate]);
  const startDate = format(weekDates[0], "yyyy-MM-dd");
  const endDate = format(weekDates[6], "yyyy-MM-dd");

  const { data: appointments = [], isLoading } = useAppointments(
    startDate,
    endDate,
    employeeFilter || undefined,
  );

  const { data: employees = [] } = useBrandEmployees();

  const employeeOptions = [
    { value: "", label: "All employees" },
    ...employees.map((e) => ({ value: e.id, label: e.name })),
  ];

  // Navigation
  function navigateWeek(direction: number) {
    setCurrentDate((prev) => addDays(prev, direction * 7));
  }

  function navigateDay(direction: number) {
    setCurrentDate((prev) => addDays(prev, direction));
  }

  function handleDatePickerSelect(date: Date | undefined) {
    if (date) {
      setCurrentDate(date);
      setDatePickerOpen(false);
    }
  }

  // Calendar interactions
  function handleSlotClick(date: Date, hour: number) {
    setDefaultBookingDate(date);
    setDefaultBookingTime(`${hour.toString().padStart(2, "0")}:00`);
    setEditingAppointment(null);
    setBookingOpen(true);
  }

  function handleAppointmentClick(appointment: AppointmentWithRelations) {
    setSelectedAppointment(appointment);
    setDetailOpen(true);
  }

  function handleNewAppointment() {
    setDefaultBookingDate(undefined);
    setDefaultBookingTime(undefined);
    setEditingAppointment(null);
    setBookingOpen(true);
  }

  function handleEdit(appointment: AppointmentWithRelations) {
    setDetailOpen(false);
    setEditingAppointment(appointment);
    setBookingOpen(true);
  }

  function handleLinkOrder(appointment: AppointmentWithRelations) {
    setDetailOpen(false);
    setSelectedAppointment(appointment);
    setLinkOrderOpen(true);
  }

  // Filter appointments for day view
  const dayAppointments = React.useMemo(() => {
    const dateStr = format(currentDate, "yyyy-MM-dd");
    return appointments.filter((a) => a.appointment_date === dateStr);
  }, [appointments, currentDate]);

  // Week range label
  const weekLabel = `${format(weekDates[0], "d MMM")} – ${format(weekDates[6], "d MMM yyyy")}`;

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)] p-3 sm:p-4 gap-3 sm:gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary hidden sm:block" />
          <h1 className="text-lg sm:text-xl font-semibold">Appointments</h1>
        </div>
        <Button onClick={handleNewAppointment} size="sm">
          <Plus className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">New Appointment</span>
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 shrink-0 flex-wrap">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() =>
              viewMode === "week" ? navigateWeek(-1) : navigateDay(-1)
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="text-sm font-medium px-2 py-1 rounded-md hover:bg-accent transition-colors cursor-pointer"
              >
                {viewMode === "week"
                  ? weekLabel
                  : format(currentDate, isMobile ? "d MMM yyyy" : "EEEE, d MMMM yyyy")}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={currentDate}
                onSelect={handleDatePickerSelect}
                weekStartsOn={6}
                defaultMonth={currentDate}
              />
            </PopoverContent>
          </Popover>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() =>
              viewMode === "week" ? navigateWeek(1) : navigateDay(1)
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-36 sm:w-44">
            <Combobox
              options={employeeOptions}
              value={employeeFilter}
              onChange={setEmployeeFilter}
              placeholder="All employees"
              className="h-8 text-xs"
            />
          </div>

          {!isMobile && (
            <div className="flex rounded-md border overflow-hidden">
              <button
                type="button"
                onClick={() => setViewMode("week")}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  viewMode === "week"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
              >
                Week
              </button>
              <button
                type="button"
                onClick={() => setViewMode("day")}
                className={`px-3 py-1 text-xs font-medium transition-colors border-l ${
                  viewMode === "day"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
              >
                Day
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 min-h-0">
        {viewMode === "week" ? (
          <WeekView
            weekDates={weekDates}
            appointments={appointments}
            isLoading={isLoading}
            onSlotClick={handleSlotClick}
            onAppointmentClick={handleAppointmentClick}
          />
        ) : (
          <DayView
            date={currentDate}
            appointments={dayAppointments}
            isLoading={isLoading}
            onSlotClick={handleSlotClick}
            onAppointmentClick={handleAppointmentClick}
          />
        )}
      </div>

      {/* Dialogs */}
      <BookingSheet
        open={bookingOpen}
        onOpenChange={setBookingOpen}
        defaultDate={defaultBookingDate}
        defaultStartTime={defaultBookingTime}
        editingAppointment={editingAppointment}
        bookedByUserId={bookedByUserId}
      />

      <DetailSheet
        appointment={selectedAppointment}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={handleEdit}
        onLinkOrder={handleLinkOrder}
      />

      <LinkOrderDialog
        appointment={selectedAppointment}
        open={linkOrderOpen}
        onOpenChange={setLinkOrderOpen}
      />
    </div>
  );
}
