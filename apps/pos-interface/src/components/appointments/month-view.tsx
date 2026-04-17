import * as React from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  format,
} from "date-fns";
import { cn, getLocalDateStr } from "@/lib/utils";
import { getEmployeeColor } from "@/lib/constants";
import { formatTime24to12 } from "./time-picker";
import type { AppointmentWithRelations } from "@/api/appointments";

const DAY_NAMES = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

interface MonthViewProps {
  currentMonth: Date;
  appointments: AppointmentWithRelations[];
  isLoading?: boolean;
  onDayClick: (date: Date, dayAppointments: AppointmentWithRelations[]) => void;
}

export function MonthView({
  currentMonth,
  appointments,
  isLoading,
  onDayClick,
}: MonthViewProps) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 6 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 6 });

  const days: Date[] = [];
  let cursor = gridStart;
  while (cursor <= gridEnd) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }

  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  const appointmentsByDate = React.useMemo(() => {
    const map = new Map<string, AppointmentWithRelations[]>();
    for (const apt of appointments) {
      const key = apt.appointment_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(apt);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return map;
  }, [appointments]);

  const todayStr = getLocalDateStr();

  return (
    <div className="flex flex-col h-full border rounded-lg bg-muted overflow-hidden relative shadow-md">
      {isLoading && (
        <div className="absolute top-0 left-0 right-0 z-50 h-0.5 bg-muted overflow-hidden">
          <div className="h-full bg-primary animate-[loading_1.5s_ease-in-out_infinite] w-1/3" />
        </div>
      )}

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b bg-muted/30 shrink-0">
        {DAY_NAMES.map((name) => (
          <div
            key={name}
            className="text-center py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {name}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div
        className="flex-1 grid overflow-hidden"
        style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}
      >
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b last:border-b-0 min-h-0">
            {week.map((day) => {
              const dateKey = format(day, "yyyy-MM-dd");
              const dayAppts = appointmentsByDate.get(dateKey) ?? [];
              const inMonth = isSameMonth(day, currentMonth);
              const isPast = dateKey < todayStr;
              const todayFlag = dateKey === todayStr;

              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => onDayClick(day, dayAppts)}
                  className={cn(
                    "flex flex-col p-1 lg:p-1.5 border-r last:border-r-0 transition-colors cursor-pointer bg-white overflow-hidden min-h-0",
                    "hover:bg-primary/5 active:bg-primary/10",
                    !inMonth && "bg-muted/50 hover:bg-muted/60",
                    isPast && inMonth && "opacity-60",
                    todayFlag && "ring-1 ring-inset ring-primary bg-primary/[0.03]",
                  )}
                >
                  {/* Date number */}
                  <span
                    className={cn(
                      "self-start text-xs sm:text-sm font-semibold leading-none shrink-0",
                      !inMonth && "text-muted-foreground/50",
                      todayFlag && "text-primary font-bold",
                    )}
                  >
                    {format(day, "d")}
                  </span>

                  {/* Appointment indicators */}
                  {dayAppts.length > 0 && (
                    <>
                      {/* Mobile/tablet: dots + count */}
                      <MobileIndicator appointments={dayAppts} />
                      {/* Desktop: mini cards */}
                      <DesktopCards appointments={dayAppts} />
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mobile/small tablet: colored dots + count badge */
function MobileIndicator({ appointments }: { appointments: AppointmentWithRelations[] }) {
  return (
    <div className="flex flex-col items-center gap-0.5 w-full mt-1 flex-1 min-h-0 lg:hidden">
      <div className="flex items-center justify-center gap-1 flex-wrap">
        {appointments.slice(0, 4).map((apt) => {
          const color = getEmployeeColor(apt.assigned_to);
          return (
            <span
              key={apt.id}
              className={cn("w-2 h-2 rounded-full shrink-0", color.dot)}
            />
          );
        })}
      </div>
      <span className="text-[11px] text-muted-foreground font-bold leading-none">
        {appointments.length}
      </span>
    </div>
  );
}

/** Desktop (lg+): mini appointment cards that fit the cell */
function DesktopCards({ appointments }: { appointments: AppointmentWithRelations[] }) {
  const MAX_VISIBLE = 3;
  const visible = appointments.slice(0, MAX_VISIBLE);
  const remaining = appointments.length - MAX_VISIBLE;

  return (
    <div className="hidden lg:flex flex-col gap-0.5 mt-1 w-full flex-1 min-h-0 overflow-hidden">
      {visible.map((apt) => {
        const color = getEmployeeColor(apt.assigned_to);
        return (
          <div
            key={apt.id}
            className={cn(
              "flex items-center gap-1 rounded px-1 py-0.5 text-xs leading-tight truncate shrink-0",
              color.bg,
              color.text,
              apt.status === "cancelled" && "opacity-40 line-through",
              apt.status === "completed" && "opacity-50",
            )}
          >
            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", color.dot)} />
            <span className="truncate font-bold">{apt.customer_name}</span>
            <span className="font-semibold ml-auto shrink-0">
              {formatTime24to12(apt.start_time).replace(/:00 /, " ").replace(/ /, "")}
            </span>
          </div>
        );
      })}
      {remaining > 0 && (
        <span className="text-[11px] text-muted-foreground font-bold px-1 shrink-0">
          +{remaining} more
        </span>
      )}
    </div>
  );
}
