import { Calendar } from "@repo/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import { useTodayAppointments } from "@/hooks/useAppointments";
import type { AppointmentWithRelations } from "@/api/appointments";

interface MiniCalendarProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  appointments: AppointmentWithRelations[];
}

export function MiniCalendar({
  selectedDate,
  onDateSelect,
  appointments,
}: MiniCalendarProps) {
  // Collect dates that have appointments for bold styling
  const appointmentDates = new Set(
    appointments.map((a) => a.appointment_date),
  );

  return (
    <Card>
      <CardContent className="p-1">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => date && onDateSelect(date)}
          weekStartsOn={6} // Saturday
          className="[--cell-size:--spacing(8)] p-2"
          modifiers={{
            hasAppointment: (date) => {
              const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
              return appointmentDates.has(dateStr);
            },
          }}
          modifiersClassNames={{
            hasAppointment: "font-bold",
          }}
        />
      </CardContent>
    </Card>
  );
}

export function TodaySummary() {
  const { data: todayAppointments = [] } = useTodayAppointments();

  const scheduled = todayAppointments.filter((a) => a.status === "scheduled").length;
  const completed = todayAppointments.filter((a) => a.status === "completed").length;
  const cancelled = todayAppointments.filter((a) => a.status === "cancelled").length;
  const noShow = todayAppointments.filter((a) => a.status === "no_show").length;

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm font-medium">Today's Summary</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-1.5">
        <SummaryRow label="Scheduled" count={scheduled} color="text-blue-600" />
        <SummaryRow label="Completed" count={completed} color="text-emerald-600" />
        {cancelled > 0 && <SummaryRow label="Cancelled" count={cancelled} color="text-gray-500" />}
        {noShow > 0 && <SummaryRow label="No Show" count={noShow} color="text-red-600" />}
        {todayAppointments.length === 0 && (
          <p className="text-xs text-muted-foreground">No appointments today</p>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryRow({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${color}`}>{count}</span>
    </div>
  );
}
