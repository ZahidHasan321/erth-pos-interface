import * as React from "react";
import { format, isToday } from "date-fns";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { AppointmentBlock } from "./appointment-block";
import type { AppointmentWithRelations } from "@/api/appointments";

const HOURS = Array.from({ length: 24 }, (_, i) => i); // 0–23 (full day)
const HOUR_HEIGHT = 64; // px per hour row

interface WeekViewProps {
  weekDates: Date[];
  appointments: AppointmentWithRelations[];
  isLoading?: boolean;
  onSlotClick: (date: Date, hour: number) => void;
  onAppointmentClick: (appointment: AppointmentWithRelations) => void;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function layoutAppointments(appointments: AppointmentWithRelations[]) {
  if (appointments.length === 0) return [];

  const sorted = [...appointments].sort((a, b) =>
    a.start_time.localeCompare(b.start_time) || a.end_time.localeCompare(b.end_time),
  );

  // Group overlapping appointments
  const groups: (typeof sorted)[] = [];
  let currentGroup = [sorted[0]];
  let groupEnd = sorted[0].end_time;

  for (let i = 1; i < sorted.length; i++) {
    const apt = sorted[i];
    if (apt.start_time < groupEnd) {
      currentGroup.push(apt);
      if (apt.end_time > groupEnd) groupEnd = apt.end_time;
    } else {
      groups.push(currentGroup);
      currentGroup = [apt];
      groupEnd = apt.end_time;
    }
  }
  groups.push(currentGroup);

  // Assign columns within each group
  const result: { appointment: AppointmentWithRelations; column: number; totalColumns: number }[] = [];

  for (const group of groups) {
    const columnEnds: string[] = [];
    const groupEntries: { appointment: AppointmentWithRelations; column: number }[] = [];

    for (const apt of group) {
      let col = columnEnds.findIndex((end) => apt.start_time >= end);
      if (col === -1) {
        col = columnEnds.length;
        columnEnds.push(apt.end_time);
      } else {
        columnEnds[col] = apt.end_time;
      }
      groupEntries.push({ appointment: apt, column: col });
    }

    const totalColumns = columnEnds.length;
    for (const entry of groupEntries) {
      result.push({ ...entry, totalColumns });
    }
  }

  return result;
}

function getAppointmentStyle(
  appointment: AppointmentWithRelations,
  column: number,
  totalColumns: number,
) {
  const startMin = timeToMinutes(appointment.start_time);
  const endMin = timeToMinutes(appointment.end_time);
  const topMin = startMin;
  const durationMin = endMin - startMin;

  const GAP = 4;
  // Google Calendar style: overlap instead of equal split
  // Each card is wide, offset by a fraction so edges peek out
  const offsetPercent = totalColumns <= 1 ? 0 : Math.min(20, 60 / totalColumns);
  const leftPercent = column * offsetPercent;
  const widthPercent = totalColumns <= 1 ? 100 : 100 - (totalColumns - 1) * offsetPercent;

  return {
    top: `${(topMin / 60) * HOUR_HEIGHT + GAP / 2}px`,
    height: `${Math.max((durationMin / 60) * HOUR_HEIGHT - GAP, 20)}px`,
    left: `calc(${leftPercent}% + 2px)`,
    width: `calc(${widthPercent}% - 4px)`,
    zIndex: 10 + column,
  };
}

export function WeekView({
  weekDates,
  appointments,
  isLoading,
  onSlotClick,
  onAppointmentClick,
}: WeekViewProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Scroll to current hour on mount
  React.useEffect(() => {
    if (!containerRef.current) return;
    const currentHour = new Date().getHours();
    const scrollTo = Math.max(0, (currentHour - 1) * HOUR_HEIGHT);
    containerRef.current.scrollTo({ top: scrollTo });
  }, []);

  // Group appointments by date string
  const appointmentsByDate = React.useMemo(() => {
    const map = new Map<string, AppointmentWithRelations[]>();
    for (const apt of appointments) {
      const key = apt.appointment_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(apt);
    }
    return map;
  }, [appointments]);

  // Now indicator
  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowTop = (nowMinutes / 60) * HOUR_HEIGHT;
  const showNowLine = nowMinutes >= 0 && nowMinutes < 24 * 60;

  return (
    <div className="flex flex-col h-full border rounded-lg bg-muted overflow-hidden relative">
      {/* Loading progress bar */}
      {isLoading && (
        <div className="absolute top-0 left-0 right-0 z-50 h-0.5 bg-muted overflow-hidden">
          <div className="h-full bg-primary animate-[loading_1.5s_ease-in-out_infinite] w-1/3" />
        </div>
      )}
      {/* Horizontally scrollable wrapper for tablet */}
      <div className="flex flex-col h-full overflow-x-auto">
        <div className="flex flex-col h-full min-w-[700px]">
      {/* Day headers */}
      <div className="flex border-b bg-muted/30 shrink-0">
        {/* Time gutter */}
        <div className="w-14 lg:w-16 shrink-0" />
        {weekDates.map((date) => {
          const today = isToday(date);
          return (
            <div
              key={date.toISOString()}
              className={cn(
                "flex-1 text-center py-2 border-l",
                today && "bg-primary/5",
              )}
            >
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {format(date, "EEE")}
              </div>
              <div
                className={cn(
                  "text-sm font-semibold",
                  today && "text-primary",
                )}
              >
                {format(date, "d")}
              </div>
            </div>
          );
        })}
      </div>

      {/* Scrollable time grid */}
      <div ref={containerRef} className="flex-1 overflow-y-auto relative">
        <div className="flex" style={{ height: `${HOURS.length * HOUR_HEIGHT}px` }}>
          {/* Time gutter */}
          <div className="w-14 lg:w-16 shrink-0 relative">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute right-2 text-[10px] text-muted-foreground -translate-y-1/2"
                style={{ top: `${(hour) * HOUR_HEIGHT + HOUR_HEIGHT / 2}px` }}
              >
                {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDates.map((date) => {
            const dateKey = format(date, "yyyy-MM-dd");
            const dayAppointments = appointmentsByDate.get(dateKey) ?? [];
            const laidOut = layoutAppointments(dayAppointments);
            const today = isToday(date);

            return (
              <div
                key={dateKey}
                className={cn(
                  "flex-1 border-l relative bg-white",
                  today && "bg-primary/[0.02]",
                )}
              >
                {/* Hour grid lines */}
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="absolute left-0 right-0 border-t border-border/40"
                    style={{ top: `${(hour) * HOUR_HEIGHT}px` }}
                  />
                ))}

                {/* Half-hour grid lines */}
                {HOURS.map((hour) => (
                  <div
                    key={`half-${hour}`}
                    className="absolute left-0 right-0 border-t border-border/20 border-dashed"
                    style={{ top: `${(hour) * HOUR_HEIGHT + HOUR_HEIGHT / 2}px` }}
                  />
                ))}

                {/* Click targets for each hour slot */}
                {HOURS.map((hour) => (
                  <button
                    key={`slot-${hour}`}
                    type="button"
                    className="absolute left-0 right-0 transition-colors duration-150 hover:bg-primary/[0.06] active:bg-primary/10 group"
                    style={{
                      top: `${(hour) * HOUR_HEIGHT}px`,
                      height: `${HOUR_HEIGHT}px`,
                    }}
                    onClick={() => onSlotClick(date, hour)}
                  >
                    <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                      <span className="text-[10px] text-primary/40 font-medium">+</span>
                    </span>
                  </button>
                ))}

                {/* Now indicator */}
                {today && showNowLine && (
                  <div
                    className="absolute left-0 right-0 z-20 pointer-events-none"
                    style={{ top: `${nowTop}px` }}
                  >
                    <div className="relative">
                      <motion.div
                        className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full bg-red-500"
                        animate={{ scale: [1, 1.3, 1] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      />
                      <div className="h-[2px] bg-red-500" />
                    </div>
                  </div>
                )}

                {/* Appointment blocks */}
                {laidOut.map(({ appointment: apt, column, totalColumns }) => (
                  <AppointmentBlock
                    key={apt.id}
                    appointment={apt}
                    onClick={onAppointmentClick}
                    style={getAppointmentStyle(apt, column, totalColumns)}
                    compact
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
        </div>
      </div>
    </div>
  );
}
