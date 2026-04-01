import { format, isBefore, startOfDay } from "date-fns";
import {
  Dialog,
  DialogContent,
} from "@repo/ui/dialog";
import { Button } from "@repo/ui/button";
import { Badge } from "@repo/ui/badge";
import { cn } from "@/lib/utils";
import { getEmployeeColor, APPOINTMENT_STATUS_LABELS } from "@/lib/constants";
import { formatTime24to12 } from "./time-picker";
import type { AppointmentWithRelations } from "@/api/appointments";
import {
  Plus,
  Printer,
  Clock,
  MapPin,
  Phone,
  X,
} from "lucide-react";
import { usePrint, PrintView } from "./print-view";

interface DayDialogProps {
  date: Date | null;
  appointments: AppointmentWithRelations[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAppointmentClick: (appointment: AppointmentWithRelations) => void;
  onNewAppointment: (date: Date) => void;
}

function statusBadgeVariant(status: string) {
  switch (status) {
    case "scheduled": return "default";
    case "completed": return "secondary";
    case "cancelled": return "outline";
    case "no_show": return "destructive";
    default: return "default";
  }
}

export function DayDialog({
  date,
  appointments,
  open,
  onOpenChange,
  onAppointmentClick,
  onNewAppointment,
}: DayDialogProps) {
  const { printRef, triggerPrint } = usePrint();

  if (!date) return null;

  const isPast = isBefore(startOfDay(date), startOfDay(new Date()));

  const sorted = [...appointments].sort((a, b) =>
    a.start_time.localeCompare(b.start_time),
  );

  const scheduled = sorted.filter((a) => a.status === "scheduled");
  const others = sorted.filter((a) => a.status !== "scheduled");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg w-full max-h-[85dvh] p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b bg-muted/30">
          <div>
            <h2 className="text-sm font-semibold">
              {format(date, "EEEE, d MMMM yyyy")}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {appointments.length} appointment{appointments.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={triggerPrint}
              disabled={appointments.length === 0}
            >
              <Printer className="h-3.5 w-3.5" />
            </Button>
            {!isPast && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onNewAppointment(date)}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto max-h-[65dvh]">
          {appointments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <p className="text-sm">No appointments</p>
              {!isPast && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => onNewAppointment(date)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Book appointment
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {[...scheduled, ...others].map((apt) => {
                const color = getEmployeeColor(apt.assigned_to);
                const area = apt.area || apt.city || "";

                return (
                  <button
                    key={apt.id}
                    type="button"
                    onClick={() => onAppointmentClick(apt)}
                    className={cn(
                      "w-full flex items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-accent/50 active:bg-accent cursor-pointer",
                      apt.status === "cancelled" && "opacity-50",
                      apt.status === "completed" && "opacity-60",
                    )}
                  >
                    {/* Color bar */}
                    <div className={cn("w-1 self-stretch rounded-full shrink-0 mt-0.5", color.dot)} />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-sm font-bold truncate",
                          apt.status === "cancelled" && "line-through",
                        )}>
                          {apt.customer_name}
                        </span>
                        {apt.status !== "scheduled" && (
                          <Badge variant={statusBadgeVariant(apt.status)} className="text-[11px] font-bold px-1.5 py-0">
                            {APPOINTMENT_STATUS_LABELS[apt.status]}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground font-medium">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatTime24to12(apt.start_time)} – {formatTime24to12(apt.end_time)}
                        </span>
                        {area && (
                          <span className="flex items-center gap-1 truncate">
                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                            {area}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span>{apt.assignee?.name ?? "Unassigned"}</span>
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {apt.customer_phone}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Hidden print content */}
        <div ref={printRef} className="hidden">
          <PrintView
            mode="day"
            appointments={appointments}
            currentDate={date}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
