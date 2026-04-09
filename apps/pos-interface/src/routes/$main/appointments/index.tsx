import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  addMonths,
  format,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarDays,
  Printer,
  List,
  LayoutGrid,
} from "lucide-react";
import { Button } from "@repo/ui/button";
import { Combobox } from "@repo/ui/combobox";
import { MonthView } from "@/components/appointments/month-view";
import { ListView } from "@/components/appointments/list-view";
import { DayDialog } from "@/components/appointments/day-dialog";
import { BookingSheet } from "@/components/appointments/booking-sheet";
import { DetailSheet } from "@/components/appointments/detail-sheet";
import { useAppointments, useBrandEmployees } from "@/hooks/useAppointments";
import { useAuth } from "@/context/auth";
import type { AppointmentWithRelations } from "@/api/appointments";
import { PrintView, usePrint } from "@/components/appointments/print-view";

export const Route = createFileRoute("/$main/appointments/")({
  component: AppointmentsPage,
});

type ViewMode = "calendar" | "list";

function AppointmentsPage() {
  const [viewMode, setViewMode] = React.useState<ViewMode>("calendar");
  const [currentMonth, setCurrentMonth] = React.useState(new Date());
  const [employeeFilter, setEmployeeFilter] = React.useState("");

  // Day dialog state
  const [dayDialogOpen, setDayDialogOpen] = React.useState(false);
  const [selectedDay, setSelectedDay] = React.useState<Date | null>(null);
  const [selectedDayAppointments, setSelectedDayAppointments] = React.useState<AppointmentWithRelations[]>([]);

  // Booking / detail / link dialog state
  const [bookingOpen, setBookingOpen] = React.useState(false);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [selectedAppointment, setSelectedAppointment] = React.useState<AppointmentWithRelations | null>(null);
  const [editingAppointment, setEditingAppointment] = React.useState<AppointmentWithRelations | null>(null);
  const [defaultBookingDate, setDefaultBookingDate] = React.useState<Date | undefined>();
  const [defaultBookingTime, setDefaultBookingTime] = React.useState<string | undefined>();

  // Current user for booked_by
  const { user: currentUser } = useAuth();
  const bookedByUserId = currentUser?.id ?? "";

  // Fetch entire month's appointments
  const startDate = format(startOfMonth(currentMonth), "yyyy-MM-dd");
  const endDate = format(endOfMonth(currentMonth), "yyyy-MM-dd");

  const { data: appointments = [], isLoading } = useAppointments(
    startDate,
    endDate,
    employeeFilter || undefined,
  );

  const { data: employees = [] } = useBrandEmployees();
  const { printRef, triggerPrint } = usePrint();

  const employeeOptions = [
    { value: "", label: "All employees" },
    ...employees.map((e) => ({ value: e.id, label: e.name })),
  ];

  // Navigation
  function navigateMonth(direction: number) {
    setCurrentMonth((prev) => addMonths(prev, direction));
  }

  function goToToday() {
    setCurrentMonth(new Date());
  }

  // Day click from month grid
  function handleDayClick(date: Date, dayAppointments: AppointmentWithRelations[]) {
    setSelectedDay(date);
    setSelectedDayAppointments(dayAppointments);
    setDayDialogOpen(true);
  }

  // Appointment click (from day dialog or list view)
  function handleAppointmentClick(appointment: AppointmentWithRelations) {
    setDayDialogOpen(false);
    setSelectedAppointment(appointment);
    setDetailOpen(true);
  }

  // New appointment
  function handleNewAppointment() {
    setDefaultBookingDate(undefined);
    setDefaultBookingTime(undefined);
    setEditingAppointment(null);
    setBookingOpen(true);
  }

  function handleNewAppointmentOnDay(date: Date) {
    setDayDialogOpen(false);
    setDefaultBookingDate(date);
    setDefaultBookingTime(undefined);
    setEditingAppointment(null);
    setBookingOpen(true);
  }

  // Edit from detail sheet
  function handleEdit(appointment: AppointmentWithRelations) {
    setDetailOpen(false);
    setEditingAppointment(appointment);
    setBookingOpen(true);
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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={triggerPrint}>
            <Printer className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Print Month</span>
          </Button>
          <Button onClick={handleNewAppointment} size="sm">
            <Plus className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">New Appointment</span>
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 shrink-0 flex-wrap">
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
            onClick={goToToday}
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

          {/* View toggle */}
          <div className="flex rounded-md border overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === "calendar"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Calendar</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors border-l ${
                viewMode === "list"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">List</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-h-0">
        {viewMode === "calendar" ? (
          <MonthView
            currentMonth={currentMonth}
            appointments={appointments}
            isLoading={isLoading}
            onDayClick={handleDayClick}
          />
        ) : (
          <ListView
            appointments={appointments}
            isLoading={isLoading}
            onAppointmentClick={handleAppointmentClick}
          />
        )}
      </div>

      {/* Day dialog (calendar view only) */}
      <DayDialog
        date={selectedDay}
        appointments={selectedDayAppointments}
        open={dayDialogOpen}
        onOpenChange={setDayDialogOpen}
        onAppointmentClick={handleAppointmentClick}
        onNewAppointment={handleNewAppointmentOnDay}
      />

      {/* Booking sheet */}
      <BookingSheet
        open={bookingOpen}
        onOpenChange={setBookingOpen}
        defaultDate={defaultBookingDate}
        defaultStartTime={defaultBookingTime}
        editingAppointment={editingAppointment}
        bookedByUserId={bookedByUserId}
      />

      {/* Detail sheet */}
      <DetailSheet
        appointment={selectedAppointment}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={handleEdit}
      />

      {/* Hidden print content — month print */}
      <div ref={printRef} className="hidden">
        <PrintView
          mode="month"
          appointments={appointments}
          currentMonth={currentMonth}
        />
      </div>
    </div>
  );
}
