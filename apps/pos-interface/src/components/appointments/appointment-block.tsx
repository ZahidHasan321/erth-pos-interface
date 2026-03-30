import { cn } from "@/lib/utils";
import { getEmployeeColor } from "@/lib/constants";
import { formatTime24to12 } from "./time-picker";
import type { AppointmentWithRelations } from "@/api/appointments";

interface AppointmentBlockProps {
  appointment: AppointmentWithRelations;
  onClick: (appointment: AppointmentWithRelations) => void;
  style?: React.CSSProperties;
  compact?: boolean;
}

export function AppointmentBlock({
  appointment,
  onClick,
  style,
  compact = false,
}: AppointmentBlockProps) {
  const color = getEmployeeColor(appointment.assigned_to);
  const assigneeName = appointment.assignee?.name ?? "Unassigned";
  const area = appointment.area || appointment.city || "";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick(appointment);
      }}
      style={style}
      className={cn(
        "absolute rounded-lg px-2 py-1.5 text-left cursor-pointer overflow-hidden hover:!z-30 transition-shadow duration-150 hover:shadow-md active:scale-[0.98]",
        color.bg,
        color.text,
        appointment.status === "cancelled" && "opacity-50 line-through",
        appointment.status === "completed" && "opacity-60",
      )}
    >
      <div className="flex flex-col gap-0 leading-tight">
        <div className="flex items-center gap-1.5">
          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", color.dot)} />
          <span className="text-[11px] font-semibold truncate">
            {appointment.customer_name}
          </span>
        </div>
        {!compact && (
          <>
            <span className="text-[10px] truncate opacity-70 pl-3">
              {assigneeName}
            </span>
            {area && (
              <span className="text-[10px] truncate opacity-50 pl-3">{area}</span>
            )}
          </>
        )}
        <span className="text-[9px] opacity-40 pl-3">
          {formatTime24to12(appointment.start_time)} – {formatTime24to12(appointment.end_time)}
        </span>
      </div>
    </button>
  );
}
